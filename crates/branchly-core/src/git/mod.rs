//! Access to Git.
//!
//! [`GitRepository`] is the only way services talk to a repository. The
//! production implementation, [`Git2Repository`], reads and edits the
//! repository in-process with libgit2 and delegates to the [`GitCli`] adapter
//! for everything that must honour the user's Git setup: network transports
//! (credentials, ssh-agent, credential helpers), hooks and commit signing.

mod cli;
mod convert;
mod git2_repo;
mod progress;

use std::path::Path;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

pub use cli::GitCli;
pub use git2_repo::Git2Repository;
pub use progress::parse_progress_line;

use crate::domain::{
    Blame, Branch, CommitDetail, CommitSummary, ConflictSide, FileDiff, FileHistoryEntry, HeadInfo,
    HunkRef, MergeOptions, MergeOutcome, Progress, RefLabel, Remote, RepoState, ResetMode, Sha,
    Stash, Tag, WorkingTreeStatus,
};
use crate::error::Result;

/// A commit as loaded for the graph: compact and without derived data.
#[derive(Debug, Clone)]
pub struct CommitRecord {
    pub id: git2::Oid,
    pub parents: Vec<git2::Oid>,
    /// Full message, trimmed; the summary is its first line.
    pub message: Box<str>,
    pub author_name: Box<str>,
    pub author_email: Box<str>,
    pub time: i64,
    pub offset_minutes: i32,
}

impl CommitRecord {
    /// First line of the message.
    pub fn summary(&self) -> &str {
        self.message.lines().next().unwrap_or_default().trim()
    }
}

/// What to do with a single hunk of a working-tree diff.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HunkAction {
    /// Copy the hunk from the working tree into the index.
    Stage,
    /// Revert the hunk in the index back to HEAD.
    Unstage,
    /// Revert the hunk in the working tree back to the index.
    Discard,
}

/// Cooperative cancellation flag shared between a command and its caller.
#[derive(Debug, Clone, Default)]
pub struct CancelToken(Arc<AtomicBool>);

impl CancelToken {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

/// Progress reporting and cancellation for long-running operations.
pub struct Operation<'a> {
    pub cancel: CancelToken,
    pub on_progress: &'a mut dyn FnMut(Progress),
}

impl<'a> Operation<'a> {
    pub fn new(cancel: CancelToken, on_progress: &'a mut dyn FnMut(Progress)) -> Self {
        Self {
            cancel,
            on_progress,
        }
    }
}

/// Abstraction over a single repository with a working tree.
///
/// Object ids cross this boundary as hex strings and paths as
/// repository-relative strings with `/` separators. Implementations must not
/// cache state between calls: callers rely on every method observing the
/// current on-disk state.
pub trait GitRepository: Send {
    /// Absolute path of the working tree.
    fn workdir(&self) -> &Path;

    // ----- Inspection -------------------------------------------------------

    fn head(&self) -> Result<HeadInfo>;
    fn state(&self) -> Result<RepoState>;
    /// A value that changes whenever HEAD or any branch or tag moves.
    fn refs_fingerprint(&self) -> Result<String>;
    /// Labels for every branch, remote branch and tag, keyed by commit id.
    fn ref_labels(&self) -> Result<Vec<(Sha, RefLabel)>>;
    /// Every commit reachable from HEAD, branches, remote branches and tags,
    /// in topological order (children before parents), newest first.
    fn walk_all(&self) -> Result<Vec<CommitRecord>>;
    fn resolve_commit(&self, rev: &str) -> Result<Sha>;
    fn commit_summary(&self, sha: &str) -> Result<CommitSummary>;
    fn commit_detail(&self, sha: &str) -> Result<CommitDetail>;
    fn commit_file_diff(&self, sha: &str, path: &str, old_path: Option<&str>) -> Result<FileDiff>;
    fn file_history(&self, path: &str, limit: usize) -> Result<Vec<FileHistoryEntry>>;
    fn blame(&self, path: &str) -> Result<Blame>;
    /// Full message of the HEAD commit, if any.
    fn head_message(&self) -> Result<Option<String>>;
    fn is_ancestor(&self, ancestor: &str, descendant: &str) -> Result<bool>;
    fn has_identity(&self) -> bool;

    fn status(&self) -> Result<WorkingTreeStatus>;
    fn working_file_diff(&self, path: &str, staged: bool) -> Result<FileDiff>;

    fn branches(&self) -> Result<Vec<Branch>>;
    fn tags(&self) -> Result<Vec<Tag>>;
    fn stashes(&self) -> Result<Vec<Stash>>;
    fn remotes(&self) -> Result<Vec<Remote>>;
    /// The config value of `key`, if set.
    fn config_value(&self, key: &str) -> Result<Option<String>>;

    // ----- Index and working tree -------------------------------------------

    fn stage_paths(&self, paths: &[String]) -> Result<()>;
    fn unstage_paths(&self, paths: &[String]) -> Result<()>;
    fn apply_hunk(&self, path: &str, hunk: HunkRef, action: HunkAction) -> Result<()>;
    /// Reverts unstaged changes; untracked files are deleted.
    fn discard_paths(&self, paths: &[String]) -> Result<()>;
    fn resolve_conflict(&self, path: &str, side: ConflictSide) -> Result<()>;

    // ----- History ----------------------------------------------------------

    /// Commits the index (or amends HEAD) and returns the new commit id.
    fn commit(&self, message: &str, amend: bool) -> Result<Sha>;
    fn reset(&self, target: &str, mode: ResetMode) -> Result<()>;
    /// Merges `rev` into the current branch.
    fn merge(&self, rev: &str, options: MergeOptions) -> Result<MergeOutcome>;
    /// Aborts the merge, rebase, cherry-pick… in progress.
    fn abort_operation(&self) -> Result<()>;
    /// Concludes the merge, rebase, cherry-pick… in progress.
    fn continue_operation(&self) -> Result<()>;

    // ----- References -------------------------------------------------------

    fn create_branch(&self, name: &str, target: &str) -> Result<()>;
    fn rename_branch(&self, from: &str, to: &str) -> Result<()>;
    /// Deletes a local branch and returns the commit it pointed to.
    fn delete_branch(&self, name: &str) -> Result<Sha>;
    fn set_upstream(&self, branch: &str, upstream: Option<&str>) -> Result<()>;
    fn checkout_branch(&self, name: &str) -> Result<()>;
    fn checkout_detached(&self, sha: &str) -> Result<()>;
    /// Creates a tag and returns the object its reference points to (the tag
    /// object for annotated tags, the commit for lightweight ones).
    fn create_tag(&self, name: &str, target: &str, message: Option<&str>) -> Result<Sha>;
    /// Deletes a tag and returns the object the reference pointed to.
    fn delete_tag(&self, name: &str) -> Result<Sha>;
    /// Creates `full_name` pointing at `target`; fails if it already exists.
    fn create_reference(&self, full_name: &str, target: &str) -> Result<()>;
    /// The object a direct reference points to, or `None` if it is missing.
    fn reference_target(&self, full_name: &str) -> Result<Option<Sha>>;
    fn delete_reference(&self, full_name: &str) -> Result<()>;
    /// Stashes local changes and returns the stash commit id.
    fn stash_save(&self, message: Option<&str>, include_untracked: bool) -> Result<Sha>;
    fn stash_apply(&self, index: u32, pop: bool) -> Result<()>;
    fn stash_drop(&self, index: u32) -> Result<()>;
    /// Re-adds a dropped stash commit to the stash list.
    fn stash_store(&self, sha: &str, message: &str) -> Result<()>;

    // ----- Network (git CLI) ------------------------------------------------

    fn fetch(&self, op: &mut Operation<'_>) -> Result<String>;
    fn pull(&self, op: &mut Operation<'_>) -> Result<String>;
    /// Pushes `refspec` to `remote`, optionally setting the upstream.
    fn push(
        &self,
        remote: &str,
        refspec: &str,
        set_upstream: bool,
        force_with_lease: bool,
        op: &mut Operation<'_>,
    ) -> Result<String>;
    fn delete_remote_ref(&self, remote: &str, name: &str, op: &mut Operation<'_>)
    -> Result<String>;
}
