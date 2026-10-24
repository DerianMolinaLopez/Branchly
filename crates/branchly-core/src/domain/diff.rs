use serde::{Deserialize, Serialize};
use specta::Type;

/// How a file changed between two snapshots.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ChangeKind {
    Added,
    Deleted,
    Modified,
    Renamed,
    Copied,
    TypeChange,
    Untracked,
    Conflicted,
}

/// A changed file inside a commit, the index or the working tree.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    /// Previous path for renames and copies.
    pub old_path: Option<String>,
    pub kind: ChangeKind,
    pub additions: u32,
    pub deletions: u32,
    pub binary: bool,
}

/// The kind of a single diff line.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum LineKind {
    Context,
    Added,
    Deleted,
}

/// A single line of a hunk. `content` never includes the trailing newline.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub kind: LineKind,
    pub old_line: Option<u32>,
    pub new_line: Option<u32>,
    pub content: String,
    /// True when the line is followed by "\ No newline at end of file".
    pub no_newline: bool,
}

/// A contiguous block of changes with its surrounding context.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Hunk {
    pub header: String,
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<DiffLine>,
}

/// Identifies a hunk the UI wants to act on (stage, unstage, discard).
///
/// The ranges are compared against a freshly computed diff so that an action
/// on a stale view is rejected instead of touching the wrong lines.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HunkRef {
    pub index: u32,
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
}

impl HunkRef {
    /// Builds a reference to `hunk`, which sits at position `index` in its diff.
    pub fn of(index: u32, hunk: &Hunk) -> Self {
        Self {
            index,
            old_start: hunk.old_start,
            old_lines: hunk.old_lines,
            new_start: hunk.new_start,
            new_lines: hunk.new_lines,
        }
    }

    /// The same hunk as seen in a diff computed in the opposite direction.
    pub fn reversed(self) -> Self {
        Self {
            index: self.index,
            old_start: self.new_start,
            old_lines: self.new_lines,
            new_start: self.old_start,
            new_lines: self.old_lines,
        }
    }
}

/// The diff of one file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub old_path: Option<String>,
    pub kind: ChangeKind,
    pub binary: bool,
    pub hunks: Vec<Hunk>,
    /// True when the diff was cut short because it was too large to display.
    pub truncated: bool,
}
