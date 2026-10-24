use serde::{Deserialize, Serialize};
use specta::Type;

use super::{CommitSummary, ConflictFile, Sha};

/// Progress of a long-running operation (clone, fetch, pull, push).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    /// Phase reported by git, e.g. "Receiving objects".
    pub phase: String,
    /// Percentage of the current phase, when git reports one.
    pub percent: Option<u8>,
    /// The raw progress line, for display.
    pub message: String,
}

/// Handle to the last undoable operation, returned alongside its result.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UndoHandle {
    pub id: u32,
    /// Human readable description, e.g. "Commit a1b2c3d".
    pub label: String,
}

/// The result of a mutation, possibly undoable.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Mutation<T> {
    pub value: T,
    pub undo: Option<UndoHandle>,
}

/// Outcome of a merge (or of the merge step of a pull).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum MergeOutcome {
    UpToDate,
    FastForward { head: Sha },
    Merged { commit: CommitSummary },
    Conflicts { files: Vec<ConflictFile> },
}

/// Options for `merge`.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MergeOptions {
    /// Always create a merge commit, even when a fast-forward is possible.
    pub no_ff: bool,
}

/// Options for `push`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PushOptions {
    /// Remote to push to when the branch has no upstream yet.
    pub remote: Option<String>,
    pub force_with_lease: bool,
}

/// What a reset does to the index and the working tree.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ResetMode {
    /// Move the branch only; changes stay staged.
    Soft,
    /// Move the branch and reset the index; changes stay in the working tree.
    Mixed,
    /// Move the branch and discard all changes.
    Hard,
}

/// Summary of a network operation, shown in the result notification.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RemoteOutcome {
    /// Condensed, human readable output of git.
    pub message: String,
    /// Set by `pull` when the merge/rebase step stopped on conflicts.
    pub conflicts: Vec<ConflictFile>,
}
