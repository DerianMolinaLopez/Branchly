//! Classification of file-system events for automatic refreshes.
//!
//! The watcher itself lives in the app crate; this module decides what a
//! changed path means for the UI so the frontend can refresh only what is
//! affected, and filters out noise (object writes, lock files, ignored files).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;

/// Which parts of the repository changed in a batch of events.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ChangeSet {
    /// Files in the working tree.
    pub workdir: bool,
    /// The index (staging area).
    pub index: bool,
    /// HEAD, branches, tags, stashes or the operation state (merge…).
    pub refs: bool,
}

impl ChangeSet {
    pub fn is_empty(&self) -> bool {
        !(self.workdir || self.index || self.refs)
    }

    pub fn merge(&mut self, other: ChangeSet) {
        self.workdir |= other.workdir;
        self.index |= other.index;
        self.refs |= other.refs;
    }
}

/// Classifies paths of one repository.
pub struct ChangeClassifier {
    repo: Option<git2::Repository>,
    workdir: PathBuf,
    git_dir: PathBuf,
}

impl ChangeClassifier {
    pub fn new(workdir: &Path) -> Self {
        let repo = git2::Repository::open(workdir).ok();
        let git_dir = repo
            .as_ref()
            .map(|r| r.path().to_path_buf())
            .unwrap_or_else(|| workdir.join(".git"));
        Self {
            repo,
            workdir: workdir.to_path_buf(),
            git_dir: normalize(&git_dir),
        }
    }

    pub fn git_dir(&self) -> &Path {
        &self.git_dir
    }

    pub fn classify(&self, path: &Path) -> ChangeSet {
        if let Ok(rel) = path.strip_prefix(&self.git_dir) {
            return classify_git_path(rel);
        }
        let Ok(rel) = path.strip_prefix(&self.workdir) else {
            return ChangeSet::default();
        };
        if rel.as_os_str().is_empty() {
            return ChangeSet::default();
        }
        let ignored = self
            .repo
            .as_ref()
            .and_then(|r| r.is_path_ignored(rel).ok())
            .unwrap_or(false);
        ChangeSet {
            workdir: !ignored,
            ..ChangeSet::default()
        }
    }
}

/// Classifies a path relative to the `.git` directory.
pub fn classify_git_path(rel: &Path) -> ChangeSet {
    let name = rel.to_string_lossy().replace('\\', "/");
    if name.ends_with(".lock") {
        return ChangeSet::default();
    }
    let first = name.split('/').next().unwrap_or_default();
    match first {
        "index" => ChangeSet {
            index: true,
            ..ChangeSet::default()
        },
        "HEAD" | "ORIG_HEAD" | "FETCH_HEAD" | "MERGE_HEAD" | "CHERRY_PICK_HEAD" | "REVERT_HEAD"
        | "packed-refs" | "refs" | "rebase-merge" | "rebase-apply" | "sequencer" => ChangeSet {
            refs: true,
            ..ChangeSet::default()
        },
        // objects/, logs/, hooks/, config, COMMIT_EDITMSG, …: no visible effect.
        _ => ChangeSet::default(),
    }
}

fn normalize(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    PathBuf::from(text.trim_end_matches(['/', '\\']))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn git_paths() {
        let c = |p: &str| classify_git_path(Path::new(p));
        assert!(c("index").index);
        assert!(c("HEAD").refs);
        assert!(c("refs/heads/main").refs);
        assert!(c("packed-refs").refs);
        assert!(c("MERGE_HEAD").refs);
        assert!(c("index.lock").is_empty());
        assert!(c("refs/heads/main.lock").is_empty());
        assert!(c("objects/ab/cdef").is_empty());
        assert!(c("logs/HEAD").is_empty());
    }

    #[test]
    fn workdir_paths_respect_gitignore() {
        let dir = tempfile::tempdir().unwrap();
        git2::Repository::init(dir.path()).unwrap();
        std::fs::write(dir.path().join(".gitignore"), "target/\n").unwrap();
        let classifier = ChangeClassifier::new(dir.path());
        assert!(classifier.classify(&dir.path().join("src/main.rs")).workdir);
        assert!(
            classifier
                .classify(&dir.path().join("target/out.o"))
                .is_empty()
        );
        assert!(classifier.classify(&dir.path().join(".git/index")).index);
        assert!(classifier.classify(Path::new("/elsewhere/file")).is_empty());
    }
}
