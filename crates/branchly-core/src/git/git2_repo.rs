//! [`GitRepository`] implemented with libgit2, plus the git CLI for network
//! operations, commits, merges and sequencer commands.

use std::collections::HashMap;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use git2::{
    ApplyLocation, ApplyOptions, BranchType, Delta, DiffFindOptions, DiffOptions, ErrorClass,
    ErrorCode as GitErrorCode, IndexAddOption, ObjectType, Oid, Patch, ReferenceType, Repository,
    RepositoryState, ResetType, Sort, StashApplyOptions, StashFlags, Status, StatusOptions,
    build::CheckoutBuilder,
};

use super::cli::{CliOutput, GitCli};
use super::convert::{self, commit_summary, delta_paths};
use super::{CommitRecord, GitRepository, HunkAction, Operation};
use crate::domain::{
    Blame, BlameHunk, Branch, ChangeKind, CommitDetail, CommitSummary, ConflictFile, ConflictSide,
    DiffStats, FileChange, FileDiff, FileHistoryEntry, HeadInfo, HunkRef, MergeOptions,
    MergeOutcome, RefKind, RefLabel, Remote, RepoState, ResetMode, Sha, Stash, Tag,
    WorkingTreeStatus, short_sha,
};
use crate::error::{Error, Result};

/// Maximum number of files listed in the detail of a single commit.
const MAX_COMMIT_FILES: usize = 3_000;

pub struct Git2Repository {
    repo: Repository,
    workdir: PathBuf,
    cli: GitCli,
}

impl Git2Repository {
    /// Opens the repository containing `path` (which may be a subfolder).
    pub fn open(path: &Path) -> Result<Self> {
        if !path.exists() {
            return Err(Error::PathNotFound(path.to_path_buf()));
        }
        let repo = Repository::discover(path).map_err(|err| match err.code() {
            GitErrorCode::NotFound => Error::NotARepository(path.to_path_buf()),
            _ => Error::Git(err),
        })?;
        let workdir = repo.workdir().map(normalize_dir).ok_or_else(|| {
            Error::invalid("Los repositorios sin árbol de trabajo (bare) no están soportados")
        })?;
        Ok(Self {
            repo,
            workdir,
            cli: GitCli::new(),
        })
    }

    /// Creates an empty repository in `path` (creating the folder if needed).
    pub fn init(path: &Path) -> Result<Self> {
        if path.join(".git").exists() {
            return Err(Error::AlreadyExists(format!(
                "un repositorio en «{}»",
                path.display()
            )));
        }
        std::fs::create_dir_all(path)?;
        Repository::init(path)?;
        Self::open(path)
    }

    pub fn cli(&self) -> &GitCli {
        &self.cli
    }

    /// The underlying libgit2 handle, for tests and advanced callers.
    pub fn raw(&self) -> &Repository {
        &self.repo
    }

    fn oid(sha: &str) -> Result<Oid> {
        Oid::from_str(sha)
            .map_err(|_| Error::invalid(format!("Identificador de commit inválido: {sha}")))
    }

    fn find_commit(&self, sha: &str) -> Result<git2::Commit<'_>> {
        self.repo
            .find_commit(Self::oid(sha)?)
            .map_err(|err| not_found(err, format!("el commit {}", short_sha(sha))))
    }

    fn head_commit(&self) -> Result<Option<git2::Commit<'_>>> {
        match self.repo.head() {
            Ok(head) => Ok(Some(head.peel_to_commit()?)),
            Err(err) if is_unborn(&err) => Ok(None),
            Err(err) => Err(err.into()),
        }
    }

    fn head_tree(&self) -> Result<Option<git2::Tree<'_>>> {
        Ok(match self.head_commit()? {
            Some(commit) => Some(commit.tree()?),
            None => None,
        })
    }

    fn head_oid(&self) -> Result<Option<Oid>> {
        Ok(self.head_commit()?.map(|c| c.id()))
    }

    /// Fresh handle for APIs that need `&mut Repository` (stash).
    fn reopen(&self) -> Result<Repository> {
        Ok(Repository::open(self.repo.path())?)
    }

    fn path_diff_options(path: &str) -> DiffOptions {
        let mut opts = DiffOptions::new();
        opts.pathspec(path)
            .disable_pathspec_match(true)
            .include_untracked(true)
            .recurse_untracked_dirs(true)
            .show_untracked_content(true)
            .include_typechange(true);
        opts
    }

    fn conflicts(&self) -> Result<Vec<ConflictFile>> {
        let index = self.repo.index()?;
        if !index.has_conflicts() {
            return Ok(Vec::new());
        }
        let mut files = Vec::new();
        for conflict in index.conflicts()? {
            let conflict = conflict?;
            let entry = conflict
                .our
                .as_ref()
                .or(conflict.their.as_ref())
                .or(conflict.ancestor.as_ref());
            if let Some(entry) = entry {
                files.push(ConflictFile {
                    path: String::from_utf8_lossy(&entry.path).into_owned(),
                    has_ours: conflict.our.is_some(),
                    has_theirs: conflict.their.is_some(),
                });
            }
        }
        files.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(files)
    }

    fn current_branch_name(&self) -> Result<Option<String>> {
        Ok(self.head()?.branch)
    }

    fn run_cli(&self, args: &[&str]) -> Result<String> {
        self.cli
            .run(&self.workdir, args)
            .map_err(classify_cli_error)
    }

    fn cli_output(&self, args: &[&str]) -> Result<CliOutput> {
        self.cli.output(&self.workdir, args, None)
    }
}

impl GitRepository for Git2Repository {
    fn workdir(&self) -> &Path {
        &self.workdir
    }

    fn head(&self) -> Result<HeadInfo> {
        match self.repo.head() {
            Ok(head) => {
                let detached = self.repo.head_detached()?;
                Ok(HeadInfo {
                    branch: (!detached && head.is_branch())
                        .then(|| head.shorthand().unwrap_or_default().to_owned()),
                    detached,
                    target: head.peel_to_commit().ok().map(|c| c.id().to_string()),
                    unborn: false,
                })
            }
            Err(err) if is_unborn(&err) => {
                let head = self.repo.find_reference("HEAD")?;
                let branch = head
                    .symbolic_target()
                    .ok()
                    .flatten()
                    .map(|t| t.strip_prefix("refs/heads/").unwrap_or(t).to_owned());
                Ok(HeadInfo {
                    branch,
                    detached: false,
                    target: None,
                    unborn: true,
                })
            }
            Err(err) => Err(err.into()),
        }
    }

    fn state(&self) -> Result<RepoState> {
        Ok(match self.repo.state() {
            RepositoryState::Clean => RepoState::Clean,
            RepositoryState::Merge => RepoState::Merging,
            RepositoryState::Revert | RepositoryState::RevertSequence => RepoState::Reverting,
            RepositoryState::CherryPick | RepositoryState::CherryPickSequence => {
                RepoState::CherryPicking
            }
            RepositoryState::Bisect => RepoState::Bisecting,
            RepositoryState::Rebase
            | RepositoryState::RebaseInteractive
            | RepositoryState::RebaseMerge => RepoState::Rebasing,
            RepositoryState::ApplyMailbox | RepositoryState::ApplyMailboxOrRebase => {
                RepoState::ApplyingMailbox
            }
        })
    }

    fn refs_fingerprint(&self) -> Result<String> {
        let mut entries = Vec::new();
        for reference in self.repo.references()? {
            let reference = reference?;
            let Ok(name) = reference.name() else { continue };
            if name == "refs/stash" {
                continue;
            }
            let target = reference
                .target()
                .map(|t| t.to_string())
                .or_else(|| {
                    reference
                        .symbolic_target()
                        .ok()
                        .flatten()
                        .map(str::to_owned)
                })
                .unwrap_or_default();
            entries.push((name.to_owned(), target));
        }
        entries.sort();
        let mut hasher = DefaultHasher::new();
        entries.hash(&mut hasher);
        if let Ok(head) = self.repo.find_reference("HEAD") {
            head.symbolic_target().ok().flatten().hash(&mut hasher);
            head.target().map(|t| t.to_string()).hash(&mut hasher);
        }
        Ok(format!("{:016x}", hasher.finish()))
    }

    fn ref_labels(&self) -> Result<Vec<(Sha, RefLabel)>> {
        let detached = self.repo.head_detached().unwrap_or(false);
        let head_ref = self
            .repo
            .find_reference("HEAD")
            .ok()
            .and_then(|h| h.symbolic_target().ok().flatten().map(str::to_owned));
        let mut labels = Vec::new();
        for reference in self.repo.references()? {
            let reference = reference?;
            if reference.kind() != Some(ReferenceType::Direct) {
                continue;
            }
            let Ok(full_name) = reference.name() else {
                continue;
            };
            let (kind, name) = if let Some(name) = full_name.strip_prefix("refs/heads/") {
                (RefKind::LocalBranch, name)
            } else if let Some(name) = full_name.strip_prefix("refs/remotes/") {
                (RefKind::RemoteBranch, name)
            } else if let Some(name) = full_name.strip_prefix("refs/tags/") {
                (RefKind::Tag, name)
            } else {
                continue;
            };
            let Ok(commit) = reference.peel_to_commit() else {
                continue;
            };
            labels.push((
                commit.id().to_string(),
                RefLabel {
                    name: name.to_owned(),
                    full_name: full_name.to_owned(),
                    kind,
                    is_head: !detached
                        && kind == RefKind::LocalBranch
                        && head_ref.as_deref() == Some(full_name),
                },
            ));
        }
        if detached && let Some(oid) = self.head_oid()? {
            labels.push((
                oid.to_string(),
                RefLabel {
                    name: "HEAD".to_owned(),
                    full_name: "HEAD".to_owned(),
                    kind: RefKind::Head,
                    is_head: true,
                },
            ));
        }
        Ok(labels)
    }

    fn walk_all(&self) -> Result<Vec<CommitRecord>> {
        let mut walk = self.repo.revwalk()?;
        walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;
        for glob in ["refs/heads", "refs/remotes", "refs/tags"] {
            walk.push_glob(glob)?;
        }
        if self.head_oid()?.is_some() {
            walk.push_head()?;
        }
        let mut records = Vec::new();
        for oid in walk {
            let commit = self.repo.find_commit(oid?)?;
            let message = String::from_utf8_lossy(commit.message_bytes());
            let message = message.trim_end();
            let author = commit.author();
            let when = author.when();
            records.push(CommitRecord {
                id: commit.id(),
                parents: commit.parent_ids().collect(),
                summary: message.lines().next().unwrap_or_default().trim().into(),
                message: message.into(),
                author_name: String::from_utf8_lossy(author.name_bytes()).into(),
                author_email: String::from_utf8_lossy(author.email_bytes()).into(),
                time: when.seconds(),
                offset_minutes: when.offset_minutes(),
            });
        }
        Ok(records)
    }

    fn resolve_commit(&self, rev: &str) -> Result<Sha> {
        let object = self
            .repo
            .revparse_single(rev)
            .map_err(|err| not_found(err, format!("«{rev}»")))?;
        Ok(object.peel_to_commit()?.id().to_string())
    }

    fn commit_summary(&self, sha: &str) -> Result<CommitSummary> {
        Ok(commit_summary(&self.find_commit(sha)?))
    }

    fn commit_detail(&self, sha: &str) -> Result<CommitDetail> {
        let commit = self.find_commit(sha)?;
        let tree = commit.tree()?;
        let parent_tree = match commit.parent(0) {
            Ok(parent) => Some(parent.tree()?),
            Err(_) => None,
        };
        let mut opts = DiffOptions::new();
        opts.include_typechange(true);
        let mut diff =
            self.repo
                .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))?;
        diff.find_similar(Some(DiffFindOptions::new().renames(true)))?;
        let git_stats = diff.stats()?;
        let (files, files_truncated) = convert::file_changes(&diff, MAX_COMMIT_FILES)?;

        let id = commit.id().to_string();
        let message = String::from_utf8_lossy(commit.message_bytes()).into_owned();
        let (summary, body) = split_message(&message);
        let refs = self
            .ref_labels()?
            .into_iter()
            .filter(|(target, _)| *target == id)
            .map(|(_, label)| label)
            .collect();
        Ok(CommitDetail {
            short_id: short_sha(&id),
            summary,
            body,
            author: convert::signature(&commit.author()),
            committer: convert::signature(&commit.committer()),
            parents: commit.parent_ids().map(|p| p.to_string()).collect(),
            refs,
            files,
            stats: DiffStats {
                files_changed: git_stats.files_changed() as u32,
                additions: git_stats.insertions() as u32,
                deletions: git_stats.deletions() as u32,
            },
            files_truncated,
            id,
        })
    }

    fn commit_file_diff(&self, sha: &str, path: &str, old_path: Option<&str>) -> Result<FileDiff> {
        let commit = self.find_commit(sha)?;
        let tree = commit.tree()?;
        let parent_tree = match commit.parent(0) {
            Ok(parent) => Some(parent.tree()?),
            Err(_) => None,
        };
        let mut opts = DiffOptions::new();
        opts.disable_pathspec_match(true)
            .include_typechange(true)
            .pathspec(path);
        if let Some(old) = old_path {
            opts.pathspec(old);
        }
        let mut diff =
            self.repo
                .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))?;
        if old_path.is_some() {
            diff.find_similar(Some(DiffFindOptions::new().renames(true)))?;
        }
        let idx = diff
            .deltas()
            .position(|d| delta_paths(&d).0 == path)
            .ok_or_else(|| Error::NotFound(format!("«{path}» en el commit {}", short_sha(sha))))?;
        convert::file_diff(&diff, idx)
    }

    fn file_history(&self, path: &str, limit: usize) -> Result<Vec<FileHistoryEntry>> {
        if self.head_oid()?.is_none() {
            return Ok(Vec::new());
        }
        let mut walk = self.repo.revwalk()?;
        walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;
        walk.push_head()?;
        let file = Path::new(path);
        let entry_id = |commit: &git2::Commit<'_>| -> Option<Oid> {
            commit.tree().ok()?.get_path(file).ok().map(|e| e.id())
        };
        let mut entries = Vec::new();
        for oid in walk {
            let commit = self.repo.find_commit(oid?)?;
            let current = entry_id(&commit);
            let parents: Vec<Option<Oid>> = commit.parents().map(|p| entry_id(&p)).collect();
            // A commit touches the file when it differs from every parent
            // (git's default history simplification).
            let touched = if parents.is_empty() {
                current.is_some()
            } else {
                parents.iter().all(|p| *p != current)
            };
            if !touched {
                continue;
            }
            let change = match (current, parents.first().copied().flatten()) {
                (None, _) => ChangeKind::Deleted,
                (Some(_), None) => ChangeKind::Added,
                (Some(_), Some(_)) => ChangeKind::Modified,
            };
            entries.push(FileHistoryEntry {
                commit: commit_summary(&commit),
                change,
                path: path.to_owned(),
            });
            if entries.len() >= limit {
                break;
            }
        }
        Ok(entries)
    }

    fn blame(&self, path: &str) -> Result<Blame> {
        let tree = self
            .head_tree()?
            .ok_or_else(|| Error::NotFound(format!("«{path}» en HEAD")))?;
        let entry = tree
            .get_path(Path::new(path))
            .map_err(|err| not_found(err, format!("«{path}» en HEAD")))?;
        let blob = self.repo.find_blob(entry.id())?;
        if blob.is_binary() {
            return Err(Error::invalid(
                "No se puede mostrar el blame de un archivo binario",
            ));
        }
        let content = String::from_utf8_lossy(blob.content());
        let lines = content
            .lines()
            .map(|l| l.strip_suffix('\r').unwrap_or(l).to_owned())
            .collect();

        let blame = self.repo.blame_file(Path::new(path), None)?;
        let mut summaries: HashMap<Oid, String> = HashMap::new();
        let mut hunks = Vec::with_capacity(blame.len());
        for hunk in blame.iter() {
            let oid = hunk.final_commit_id();
            let summary = match summaries.get(&oid) {
                Some(s) => s.clone(),
                None => {
                    let s = self
                        .repo
                        .find_commit(oid)
                        .map(|c| convert::summary_of(&c))
                        .unwrap_or_default();
                    summaries.insert(oid, s.clone());
                    s
                }
            };
            let (author, timestamp) = hunk
                .final_signature()
                .map(|sig| {
                    (
                        String::from_utf8_lossy(sig.name_bytes()).into_owned(),
                        sig.when().seconds(),
                    )
                })
                .unwrap_or_default();
            let id = oid.to_string();
            hunks.push(BlameHunk {
                start_line: hunk.final_start_line() as u32,
                line_count: hunk.lines_in_hunk() as u32,
                short_id: short_sha(&id),
                commit_id: id,
                author,
                timestamp,
                summary,
            });
        }
        Ok(Blame {
            path: path.to_owned(),
            lines,
            hunks,
        })
    }

    fn head_message(&self) -> Result<Option<String>> {
        Ok(self.head_commit()?.map(|c| {
            String::from_utf8_lossy(c.message_bytes())
                .trim_end()
                .to_owned()
        }))
    }

    fn is_ancestor(&self, ancestor: &str, descendant: &str) -> Result<bool> {
        let (ancestor, descendant) = (Self::oid(ancestor)?, Self::oid(descendant)?);
        Ok(ancestor == descendant || self.repo.graph_descendant_of(descendant, ancestor)?)
    }

    fn has_identity(&self) -> bool {
        self.repo.signature().is_ok()
    }

    fn status(&self) -> Result<WorkingTreeStatus> {
        let mut opts = StatusOptions::new();
        opts.include_untracked(true)
            .recurse_untracked_dirs(true)
            .renames_head_to_index(true)
            .include_ignored(false);
        let statuses = self.repo.statuses(Some(&mut opts))?;
        let mut staged = Vec::new();
        let mut unstaged = Vec::new();
        for entry in statuses.iter() {
            let s = entry.status();
            if s.is_conflicted() {
                continue;
            }
            // `StatusEntry::path` is the *old* path of a rename; prefer the
            // new side of each delta.
            let fallback = String::from_utf8_lossy(entry.path_bytes()).into_owned();
            let change = |kind, delta: Option<git2::DiffDelta<'_>>| {
                let (path, old_path) = delta
                    .map(|d| delta_paths(&d))
                    .unwrap_or_else(|| (fallback.clone(), None));
                FileChange {
                    path,
                    old_path,
                    kind,
                    additions: 0,
                    deletions: 0,
                    binary: false,
                }
            };
            let index_kind = if s.contains(Status::INDEX_NEW) {
                Some(ChangeKind::Added)
            } else if s.contains(Status::INDEX_DELETED) {
                Some(ChangeKind::Deleted)
            } else if s.contains(Status::INDEX_RENAMED) {
                Some(ChangeKind::Renamed)
            } else if s.contains(Status::INDEX_TYPECHANGE) {
                Some(ChangeKind::TypeChange)
            } else if s.contains(Status::INDEX_MODIFIED) {
                Some(ChangeKind::Modified)
            } else {
                None
            };
            if let Some(kind) = index_kind {
                staged.push(change(kind, entry.head_to_index()));
            }
            let workdir_kind = if s.contains(Status::WT_NEW) {
                Some(ChangeKind::Untracked)
            } else if s.contains(Status::WT_DELETED) {
                Some(ChangeKind::Deleted)
            } else if s.contains(Status::WT_RENAMED) {
                Some(ChangeKind::Renamed)
            } else if s.contains(Status::WT_TYPECHANGE) {
                Some(ChangeKind::TypeChange)
            } else if s.contains(Status::WT_MODIFIED) {
                Some(ChangeKind::Modified)
            } else {
                None
            };
            if let Some(kind) = workdir_kind {
                unstaged.push(change(kind, entry.index_to_workdir()));
            }
        }
        staged.sort_by(|a, b| a.path.cmp(&b.path));
        unstaged.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(WorkingTreeStatus {
            staged,
            unstaged,
            conflicted: self.conflicts()?,
            state: self.state()?,
        })
    }

    fn working_file_diff(&self, path: &str, staged: bool) -> Result<FileDiff> {
        let index = self.repo.index()?;
        let head_tree = self.head_tree()?;
        let mut opts = Self::path_diff_options(path);
        let conflicted = index.conflicts()?.filter_map(|c| c.ok()).any(|c| {
            [c.our, c.their, c.ancestor]
                .iter()
                .flatten()
                .any(|e| e.path == path.as_bytes())
        });
        let diff = if staged {
            self.repo
                .diff_tree_to_index(head_tree.as_ref(), Some(&index), Some(&mut opts))?
        } else if conflicted {
            self.repo
                .diff_tree_to_workdir(head_tree.as_ref(), Some(&mut opts))?
        } else {
            self.repo
                .diff_index_to_workdir(Some(&index), Some(&mut opts))?
        };
        match diff.deltas().position(|d| delta_paths(&d).0 == path) {
            Some(idx) => {
                let mut file = convert::file_diff(&diff, idx)?;
                if conflicted {
                    file.kind = ChangeKind::Conflicted;
                }
                Ok(file)
            }
            None => Ok(FileDiff {
                path: path.to_owned(),
                old_path: None,
                kind: ChangeKind::Modified,
                binary: false,
                hunks: Vec::new(),
                truncated: false,
            }),
        }
    }

    fn branches(&self) -> Result<Vec<Branch>> {
        let mut result = Vec::new();
        for item in self.repo.branches(None)? {
            let (branch, branch_type) = item?;
            let reference = branch.get();
            if reference.kind() != Some(ReferenceType::Direct) {
                continue; // e.g. refs/remotes/origin/HEAD
            }
            let Ok(full_name) = reference.name().map(str::to_owned) else {
                continue;
            };
            let Some(name) = branch.name()?.map(str::to_owned) else {
                continue;
            };
            let Ok(commit) = reference.peel_to_commit() else {
                continue;
            };
            let is_remote = branch_type == BranchType::Remote;
            let (mut upstream, mut upstream_gone, mut ahead, mut behind) = (None, false, 0, 0);
            if !is_remote {
                match branch.upstream() {
                    Ok(up) => {
                        upstream = up.name()?.map(str::to_owned);
                        if let Some(up_oid) = up.get().target() {
                            let (a, b) = self.repo.graph_ahead_behind(commit.id(), up_oid)?;
                            ahead = a as u32;
                            behind = b as u32;
                        }
                    }
                    Err(_) => {
                        upstream_gone = self.repo.branch_upstream_name(&full_name).is_ok();
                    }
                }
            }
            let remote = is_remote
                .then(|| self.repo.branch_remote_name(&full_name).ok())
                .flatten()
                .and_then(|buf| buf.as_str().ok().map(str::to_owned));
            result.push(Branch {
                is_head: branch.is_head(),
                target: commit.id().to_string(),
                summary: convert::summary_of(&commit),
                timestamp: commit.time().seconds(),
                name,
                full_name,
                is_remote,
                remote,
                upstream,
                upstream_gone,
                ahead,
                behind,
            });
        }
        result.sort_by(|a, b| a.is_remote.cmp(&b.is_remote).then(a.name.cmp(&b.name)));
        Ok(result)
    }

    fn tags(&self) -> Result<Vec<Tag>> {
        let mut names = Vec::new();
        self.repo.tag_foreach(|oid, name| {
            names.push((oid, String::from_utf8_lossy(name).into_owned()));
            true
        })?;
        let mut tags = Vec::new();
        for (oid, full_name) in names {
            let name = full_name
                .strip_prefix("refs/tags/")
                .unwrap_or(&full_name)
                .to_owned();
            let object = self.repo.find_object(oid, None)?;
            let Ok(target) = object.peel(ObjectType::Commit) else {
                continue;
            };
            let annotated = self.repo.find_tag(oid).ok();
            tags.push(Tag {
                name,
                target: target.id().to_string(),
                annotated: annotated.is_some(),
                message: annotated
                    .as_ref()
                    .and_then(|t| t.message_bytes())
                    .map(|m| String::from_utf8_lossy(m).trim_end().to_owned()),
                tagger: annotated
                    .as_ref()
                    .and_then(|t| t.tagger())
                    .map(|s| convert::signature(&s)),
            });
        }
        tags.sort_by(|a, b| natural_cmp(&b.name, &a.name));
        Ok(tags)
    }

    fn stashes(&self) -> Result<Vec<Stash>> {
        let mut repo = self.reopen()?;
        let mut raw = Vec::new();
        repo.stash_foreach(|index, message, oid| {
            raw.push((index, message.to_owned(), *oid));
            true
        })?;
        Ok(raw
            .into_iter()
            .map(|(index, message, oid)| Stash {
                index: index as u32,
                id: oid.to_string(),
                branch: stash_branch(&message),
                timestamp: repo
                    .find_commit(oid)
                    .map(|c| c.time().seconds())
                    .unwrap_or_default(),
                message,
            })
            .collect())
    }

    fn remotes(&self) -> Result<Vec<Remote>> {
        let names = self.repo.remotes()?;
        let mut remotes = Vec::new();
        for name in names.iter().filter_map(|n| n.ok().flatten()) {
            let remote = self.repo.find_remote(name)?;
            remotes.push(Remote {
                name: name.to_owned(),
                fetch_url: remote.url().ok().map(str::to_owned),
                push_url: remote.pushurl().ok().flatten().map(str::to_owned),
            });
        }
        Ok(remotes)
    }

    fn config_value(&self, key: &str) -> Result<Option<String>> {
        match self.repo.config()?.get_string(key) {
            Ok(value) => Ok(Some(value)),
            Err(err) if err.code() == GitErrorCode::NotFound => Ok(None),
            Err(err) => Err(err.into()),
        }
    }

    fn stage_paths(&self, paths: &[String]) -> Result<()> {
        let mut index = self.repo.index()?;
        for path in paths {
            let full = self.workdir.join(path);
            match full.symlink_metadata() {
                Ok(meta) if meta.is_dir() => {
                    index.add_all([path.as_str()], IndexAddOption::DEFAULT, None)?
                }
                Ok(_) => index.add_path(Path::new(path))?,
                Err(_) => index.remove_path(Path::new(path))?,
            }
        }
        index.write()?;
        Ok(())
    }

    fn unstage_paths(&self, paths: &[String]) -> Result<()> {
        match self.head_commit()? {
            Some(head) => self.repo.reset_default(Some(head.as_object()), paths)?,
            None => {
                let mut index = self.repo.index()?;
                for path in paths {
                    index.remove_path(Path::new(path))?;
                }
                index.write()?;
            }
        }
        Ok(())
    }

    fn apply_hunk(&self, path: &str, hunk: HunkRef, action: HunkAction) -> Result<()> {
        let index = self.repo.index()?;
        let mut opts = Self::path_diff_options(path);
        if action != HunkAction::Stage {
            opts.reverse(true);
        }
        let diff = match action {
            HunkAction::Stage | HunkAction::Discard => self
                .repo
                .diff_index_to_workdir(Some(&index), Some(&mut opts))?,
            HunkAction::Unstage => {
                let head_tree = self.head_tree()?;
                self.repo
                    .diff_tree_to_index(head_tree.as_ref(), Some(&index), Some(&mut opts))?
            }
        };
        let delta = diff.get_delta(0).ok_or(Error::StaleDiff)?;
        let expected = if action == HunkAction::Stage {
            hunk
        } else {
            hunk.reversed()
        };

        // New, deleted and type-changed files have a single hunk covering the
        // whole file: act on the path instead of patching.
        if delta.status() != Delta::Modified {
            let paths = [path.to_owned()];
            return match action {
                HunkAction::Stage => self.stage_paths(&paths),
                HunkAction::Unstage => self.unstage_paths(&paths),
                HunkAction::Discard => self.discard_paths(&paths),
            };
        }

        let patch = Patch::from_diff(&diff, 0)?.ok_or(Error::StaleDiff)?;
        let target = expected.index as usize;
        if target >= patch.num_hunks() {
            return Err(Error::StaleDiff);
        }
        let (found, _) = patch.hunk(target)?;
        let matches = (
            found.old_start(),
            found.old_lines(),
            found.new_start(),
            found.new_lines(),
        ) == (
            expected.old_start,
            expected.old_lines,
            expected.new_start,
            expected.new_lines,
        );
        if !matches {
            return Err(Error::StaleDiff);
        }

        let mut seen = 0usize;
        let mut apply = ApplyOptions::new();
        apply.hunk_callback(move |_| {
            let keep = seen == target;
            seen += 1;
            keep
        });
        let location = match action {
            HunkAction::Discard => ApplyLocation::WorkDir,
            HunkAction::Stage | HunkAction::Unstage => ApplyLocation::Index,
        };
        self.repo.apply(&diff, location, Some(&mut apply))?;
        Ok(())
    }

    fn discard_paths(&self, paths: &[String]) -> Result<()> {
        let index = self.repo.index()?;
        let mut tracked = Vec::new();
        for path in paths {
            let in_index = index.get_path(Path::new(path), 0).is_some();
            if in_index {
                tracked.push(path.as_str());
                continue;
            }
            let full = self.workdir.join(path);
            match full.symlink_metadata() {
                Ok(meta) if meta.is_dir() => std::fs::remove_dir_all(&full)?,
                Ok(_) => std::fs::remove_file(&full)?,
                Err(_) => {}
            }
        }
        if !tracked.is_empty() {
            let mut checkout = CheckoutBuilder::new();
            checkout.force().disable_pathspec_match(true);
            for path in tracked {
                checkout.path(path);
            }
            self.repo.checkout_index(None, Some(&mut checkout))?;
        }
        Ok(())
    }

    fn resolve_conflict(&self, path: &str, side: ConflictSide) -> Result<()> {
        let conflict = self
            .conflicts()?
            .into_iter()
            .find(|c| c.path == path)
            .ok_or_else(|| Error::NotFound(format!("un conflicto en «{path}»")))?;
        let (flag, present) = match side {
            ConflictSide::Ours => ("--ours", conflict.has_ours),
            ConflictSide::Theirs => ("--theirs", conflict.has_theirs),
        };
        if present {
            self.run_cli(&["checkout", flag, "--", path])?;
            self.run_cli(&["add", "--", path])?;
        } else {
            self.run_cli(&["rm", "--quiet", "--", path])?;
        }
        Ok(())
    }

    fn commit(&self, message: &str, amend: bool) -> Result<Sha> {
        let mut args = vec!["commit", "--quiet", "--cleanup=whitespace", "-F", "-"];
        if amend {
            args.push("--amend");
        }
        self.cli
            .run_with_input(&self.workdir, &args, message)
            .map_err(classify_cli_error)?;
        Ok(self.repo.refname_to_id("HEAD")?.to_string())
    }

    fn reset(&self, target: &str, mode: ResetMode) -> Result<()> {
        let commit = self.find_commit(target)?;
        let kind = match mode {
            ResetMode::Soft => ResetType::Soft,
            ResetMode::Mixed => ResetType::Mixed,
            ResetMode::Hard => ResetType::Hard,
        };
        self.repo.reset(commit.as_object(), kind, None)?;
        Ok(())
    }

    fn merge(&self, rev: &str, options: MergeOptions) -> Result<MergeOutcome> {
        let before = self.head_oid()?;
        let mut args = vec!["merge", "--no-edit"];
        if options.no_ff {
            args.push("--no-ff");
        }
        args.push(rev);
        let out = self.cli_output(&args)?;
        if !out.success() {
            let files = self.conflicts()?;
            if !files.is_empty() {
                return Ok(MergeOutcome::Conflicts { files });
            }
            return Err(classify_cli_error(Error::GitCommand {
                command: "merge".to_owned(),
                stderr: super::cli::clean_stderr(&out.stderr),
                code: out.status.code(),
            }));
        }
        let after = self
            .head_commit()?
            .ok_or_else(|| Error::NotFound("HEAD".into()))?;
        Ok(if Some(after.id()) == before {
            MergeOutcome::UpToDate
        } else if after.parent_count() > 1 {
            MergeOutcome::Merged {
                commit: commit_summary(&after),
            }
        } else {
            MergeOutcome::FastForward {
                head: after.id().to_string(),
            }
        })
    }

    fn abort_operation(&self) -> Result<()> {
        let args: &[&str] = match self.state()? {
            RepoState::Clean => return Err(Error::invalid("No hay ninguna operación en curso")),
            RepoState::Merging => &["merge", "--abort"],
            RepoState::Rebasing => &["rebase", "--abort"],
            RepoState::CherryPicking => &["cherry-pick", "--abort"],
            RepoState::Reverting => &["revert", "--abort"],
            RepoState::ApplyingMailbox => &["am", "--abort"],
            RepoState::Bisecting => &["bisect", "reset"],
        };
        self.run_cli(args).map(|_| ())
    }

    fn continue_operation(&self) -> Result<()> {
        let conflicts = self.conflicts()?.len();
        if conflicts > 0 {
            return Err(Error::UnresolvedConflicts(conflicts));
        }
        let args: &[&str] = match self.state()? {
            RepoState::Clean | RepoState::Bisecting => {
                return Err(Error::invalid("No hay ninguna operación que continuar"));
            }
            RepoState::Merging => &["commit", "--no-edit"],
            RepoState::Rebasing => &["rebase", "--continue"],
            RepoState::CherryPicking => &["cherry-pick", "--continue"],
            RepoState::Reverting => &["revert", "--continue"],
            RepoState::ApplyingMailbox => &["am", "--continue"],
        };
        self.run_cli(args).map(|_| ())
    }

    fn create_branch(&self, name: &str, target: &str) -> Result<()> {
        let commit = self.find_commit(target)?;
        self.repo
            .branch(name, &commit, false)
            .map_err(|err| exists(err, format!("una rama llamada «{name}»")))?;
        Ok(())
    }

    fn rename_branch(&self, from: &str, to: &str) -> Result<()> {
        let mut branch = self
            .repo
            .find_branch(from, BranchType::Local)
            .map_err(|err| not_found(err, format!("la rama «{from}»")))?;
        branch
            .rename(to, false)
            .map_err(|err| exists(err, format!("una rama llamada «{to}»")))?;
        Ok(())
    }

    fn delete_branch(&self, name: &str) -> Result<Sha> {
        let mut branch = self
            .repo
            .find_branch(name, BranchType::Local)
            .map_err(|err| not_found(err, format!("la rama «{name}»")))?;
        let target = branch
            .get()
            .target()
            .ok_or_else(|| Error::NotFound(format!("el destino de «{name}»")))?;
        branch.delete()?;
        Ok(target.to_string())
    }

    fn set_upstream(&self, branch: &str, upstream: Option<&str>) -> Result<()> {
        let mut branch = self
            .repo
            .find_branch(branch, BranchType::Local)
            .map_err(|err| not_found(err, format!("la rama «{branch}»")))?;
        branch.set_upstream(upstream)?;
        Ok(())
    }

    fn checkout_branch(&self, name: &str) -> Result<()> {
        let refname = format!("refs/heads/{name}");
        let target = self
            .repo
            .find_reference(&refname)
            .map_err(|err| not_found(err, format!("la rama «{name}»")))?
            .peel(ObjectType::Commit)?;
        let mut checkout = CheckoutBuilder::new();
        checkout.safe();
        self.repo
            .checkout_tree(&target, Some(&mut checkout))
            .map_err(classify_checkout_error)?;
        self.repo.set_head(&refname)?;
        Ok(())
    }

    fn checkout_detached(&self, sha: &str) -> Result<()> {
        let commit = self.find_commit(sha)?;
        let mut checkout = CheckoutBuilder::new();
        checkout.safe();
        self.repo
            .checkout_tree(commit.as_object(), Some(&mut checkout))
            .map_err(classify_checkout_error)?;
        self.repo.set_head_detached(commit.id())?;
        Ok(())
    }

    fn create_tag(&self, name: &str, target: &str, message: Option<&str>) -> Result<Sha> {
        let commit = self.find_commit(target)?;
        let result = match message {
            Some(message) => {
                let tagger = self.repo.signature().map_err(|_| Error::IdentityMissing)?;
                self.repo
                    .tag(name, commit.as_object(), &tagger, message, false)
            }
            None => self.repo.tag_lightweight(name, commit.as_object(), false),
        };
        let oid = result.map_err(|err| exists(err, format!("una etiqueta llamada «{name}»")))?;
        Ok(oid.to_string())
    }

    fn delete_tag(&self, name: &str) -> Result<Sha> {
        let reference = self
            .repo
            .find_reference(&format!("refs/tags/{name}"))
            .map_err(|err| not_found(err, format!("la etiqueta «{name}»")))?;
        let target = reference
            .target()
            .ok_or_else(|| Error::NotFound(format!("el destino de «{name}»")))?;
        self.repo.tag_delete(name)?;
        Ok(target.to_string())
    }

    fn create_reference(&self, full_name: &str, target: &str) -> Result<()> {
        self.repo
            .reference(full_name, Self::oid(target)?, false, "branchly: undo")
            .map_err(|err| exists(err, format!("«{full_name}»")))?;
        Ok(())
    }

    fn reference_target(&self, full_name: &str) -> Result<Option<Sha>> {
        match self.repo.find_reference(full_name) {
            Ok(reference) => Ok(reference.target().map(|t| t.to_string())),
            Err(err) if err.code() == GitErrorCode::NotFound => Ok(None),
            Err(err) => Err(err.into()),
        }
    }

    fn delete_reference(&self, full_name: &str) -> Result<()> {
        self.repo
            .find_reference(full_name)
            .map_err(|err| not_found(err, format!("«{full_name}»")))?
            .delete()?;
        Ok(())
    }

    fn stash_save(&self, message: Option<&str>, include_untracked: bool) -> Result<Sha> {
        let mut repo = self.reopen()?;
        let stasher = repo.signature().map_err(|_| Error::IdentityMissing)?;
        let flags = if include_untracked {
            StashFlags::INCLUDE_UNTRACKED
        } else {
            StashFlags::DEFAULT
        };
        let oid = repo
            .stash_save2(&stasher, message, Some(flags))
            .map_err(|err| match err.code() {
                GitErrorCode::NotFound => Error::invalid("No hay cambios locales para guardar"),
                _ => Error::Git(err),
            })?;
        Ok(oid.to_string())
    }

    fn stash_apply(&self, index: u32, pop: bool) -> Result<()> {
        let mut repo = self.reopen()?;
        let mut opts = StashApplyOptions::new();
        let result = if pop {
            repo.stash_pop(index as usize, Some(&mut opts))
        } else {
            repo.stash_apply(index as usize, Some(&mut opts))
        };
        result.map_err(|err| match err.code() {
            GitErrorCode::NotFound => Error::NotFound(format!("el stash {index}")),
            GitErrorCode::Conflict | GitErrorCode::MergeConflict => {
                Error::WouldOverwriteChanges(err.message().to_owned())
            }
            _ => Error::Git(err),
        })
    }

    fn stash_drop(&self, index: u32) -> Result<()> {
        self.reopen()?
            .stash_drop(index as usize)
            .map_err(|err| not_found(err, format!("el stash {index}")))
    }

    fn stash_store(&self, sha: &str, message: &str) -> Result<()> {
        Self::oid(sha)?;
        self.run_cli(&["stash", "store", "-m", message, sha])
            .map(|_| ())
    }

    fn fetch(&self, op: &mut Operation<'_>) -> Result<String> {
        if self.repo.remotes()?.is_empty() {
            return Err(Error::invalid("No hay remotos configurados"));
        }
        self.cli
            .run_streaming(&self.workdir, ["fetch", "--all", "--progress"], op)
    }

    fn pull(&self, op: &mut Operation<'_>) -> Result<String> {
        let branch = self
            .current_branch_name()?
            .ok_or_else(|| Error::invalid("No estás en ninguna rama (HEAD separado)"))?;
        let has_upstream = self
            .repo
            .branch_upstream_name(&format!("refs/heads/{branch}"))
            .is_ok();
        if !has_upstream {
            return Err(Error::invalid(format!(
                "La rama «{branch}» no tiene una rama remota asociada (upstream)"
            )));
        }
        let mut args = vec!["pull", "--progress"];
        // Without any pull strategy configured, modern git refuses to pull
        // divergent branches. Fall back to git's historical merge behaviour.
        if self.config_value("pull.rebase")?.is_none() && self.config_value("pull.ff")?.is_none() {
            args.push("--no-rebase");
        }
        self.cli
            .run_streaming(&self.workdir, args, op)
            .map_err(classify_cli_error)
    }

    fn push(
        &self,
        remote: &str,
        refspec: &str,
        set_upstream: bool,
        force_with_lease: bool,
        op: &mut Operation<'_>,
    ) -> Result<String> {
        let mut args = vec!["push", "--progress"];
        if set_upstream {
            args.push("--set-upstream");
        }
        if force_with_lease {
            args.push("--force-with-lease");
        }
        args.extend([remote, refspec]);
        self.cli.run_streaming(&self.workdir, args, op)
    }

    fn delete_remote_ref(
        &self,
        remote: &str,
        name: &str,
        op: &mut Operation<'_>,
    ) -> Result<String> {
        self.cli.run_streaming(
            &self.workdir,
            ["push", "--progress", remote, "--delete", name],
            op,
        )
    }
}

fn normalize_dir(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    let trimmed = text.trim_end_matches(['/', '\\']);
    if trimmed.is_empty() {
        path.to_path_buf()
    } else {
        PathBuf::from(trimmed)
    }
}

fn is_unborn(err: &git2::Error) -> bool {
    matches!(
        err.code(),
        GitErrorCode::UnbornBranch | GitErrorCode::NotFound
    )
}

fn not_found(err: git2::Error, what: String) -> Error {
    match err.code() {
        GitErrorCode::NotFound => Error::NotFound(what),
        _ => Error::Git(err),
    }
}

fn exists(err: git2::Error, what: String) -> Error {
    match err.code() {
        GitErrorCode::Exists => Error::AlreadyExists(what),
        GitErrorCode::InvalidSpec => Error::invalid(format!("Nombre inválido: {}", err.message())),
        _ => Error::Git(err),
    }
}

fn classify_checkout_error(err: git2::Error) -> Error {
    if err.class() == ErrorClass::Checkout || err.code() == GitErrorCode::Conflict {
        Error::WouldOverwriteChanges(
            "confirma, descarta o guarda en el stash los cambios antes de cambiar".to_owned(),
        )
    } else {
        Error::Git(err)
    }
}

/// Maps well-known git CLI failures to typed errors.
fn classify_cli_error(err: Error) -> Error {
    match &err {
        Error::GitCommand { stderr, .. } => {
            let lower = stderr.to_lowercase();
            if lower.contains("would be overwritten") {
                Error::WouldOverwriteChanges(stderr.clone())
            } else if lower.contains("please tell me who you are")
                || lower.contains("unable to auto-detect email address")
            {
                Error::IdentityMissing
            } else if lower.contains("nothing to commit")
                || lower.contains("no changes added to commit")
            {
                Error::NothingToCommit
            } else {
                err
            }
        }
        _ => err,
    }
}

/// Splits a commit message into its summary line and body.
pub(crate) fn split_message(message: &str) -> (String, String) {
    let message = message.trim();
    match message.split_once('\n') {
        Some((summary, body)) => (summary.trim().to_owned(), body.trim().to_owned()),
        None => (message.to_owned(), String::new()),
    }
}

/// Extracts the branch from "WIP on main: …" / "On main: …".
fn stash_branch(message: &str) -> Option<String> {
    let rest = message
        .strip_prefix("WIP on ")
        .or_else(|| message.strip_prefix("On "))?;
    let (branch, _) = rest.split_once(':')?;
    Some(branch.to_owned())
}

/// Compares strings treating runs of digits as numbers (v1.10 > v1.9).
fn natural_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    use std::cmp::Ordering;
    let (mut a, mut b) = (a.chars().peekable(), b.chars().peekable());
    loop {
        match (a.peek().copied(), b.peek().copied()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(x), Some(y)) if x.is_ascii_digit() && y.is_ascii_digit() => {
                let take = |it: &mut std::iter::Peekable<std::str::Chars<'_>>| {
                    let mut n = String::new();
                    while let Some(c) = it.peek().copied().filter(char::is_ascii_digit) {
                        n.push(c);
                        it.next();
                    }
                    n
                };
                let (na, nb) = (take(&mut a), take(&mut b));
                let ord = na
                    .trim_start_matches('0')
                    .len()
                    .cmp(&nb.trim_start_matches('0').len())
                    .then_with(|| na.trim_start_matches('0').cmp(nb.trim_start_matches('0')));
                if ord != Ordering::Equal {
                    return ord;
                }
            }
            (Some(x), Some(y)) => {
                if x != y {
                    return x.cmp(&y);
                }
                a.next();
                b.next();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_messages() {
        assert_eq!(
            split_message("Fix bug\n\nDetails here\n"),
            ("Fix bug".into(), "Details here".into())
        );
        assert_eq!(
            split_message("Only summary"),
            ("Only summary".into(), String::new())
        );
    }

    #[test]
    fn parses_stash_branch() {
        assert_eq!(
            stash_branch("WIP on main: abc123 msg").as_deref(),
            Some("main")
        );
        assert_eq!(
            stash_branch("On feature/x: my work").as_deref(),
            Some("feature/x")
        );
        assert_eq!(stash_branch("custom"), None);
    }

    #[test]
    fn natural_order_of_versions() {
        let mut tags = vec!["v1.9", "v1.10", "v1.2"];
        tags.sort_by(|a, b| natural_cmp(a, b));
        assert_eq!(tags, ["v1.2", "v1.9", "v1.10"]);
    }
}
