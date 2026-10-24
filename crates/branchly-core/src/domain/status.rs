use serde::{Deserialize, Serialize};
use specta::Type;

use super::{FileChange, RepoState};

/// A file with unresolved merge conflicts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ConflictFile {
    pub path: String,
    /// False when "ours" deleted the file.
    pub has_ours: bool,
    /// False when "theirs" deleted the file.
    pub has_theirs: bool,
}

/// The state of the index and the working tree.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WorkingTreeStatus {
    pub staged: Vec<FileChange>,
    pub unstaged: Vec<FileChange>,
    pub conflicted: Vec<ConflictFile>,
    pub state: RepoState,
}

impl WorkingTreeStatus {
    /// True when there is nothing to commit, stash or resolve.
    pub fn is_clean(&self) -> bool {
        self.staged.is_empty() && self.unstaged.is_empty() && self.conflicted.is_empty()
    }
}

/// Side of a conflict to keep when resolving a file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ConflictSide {
    Ours,
    Theirs,
}
