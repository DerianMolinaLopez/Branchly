use serde::{Deserialize, Serialize};
use specta::Type;

use super::{FileChange, RefLabel, Sha};

/// Author or committer identity together with the moment it was recorded.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Signature {
    pub name: String,
    pub email: String,
    /// Seconds since the Unix epoch.
    pub timestamp: i64,
    /// Offset from UTC in minutes.
    pub offset_minutes: i32,
}

/// The lightweight view of a commit used in lists and the graph.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CommitSummary {
    pub id: Sha,
    pub short_id: String,
    pub summary: String,
    pub author: Signature,
    pub parents: Vec<Sha>,
}

/// Everything shown in the commit detail panel.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetail {
    pub id: Sha,
    pub short_id: String,
    pub summary: String,
    /// Message body without the summary line; empty when absent.
    pub body: String,
    pub author: Signature,
    pub committer: Signature,
    pub parents: Vec<Sha>,
    pub refs: Vec<RefLabel>,
    pub files: Vec<FileChange>,
    pub stats: DiffStats,
    /// True when the file list was capped for very large commits.
    pub files_truncated: bool,
}

/// Aggregated line statistics of a diff.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DiffStats {
    pub files_changed: u32,
    pub additions: u32,
    pub deletions: u32,
}

/// Which commit field a search query is matched against.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SearchField {
    All,
    Message,
    Author,
    Hash,
}

/// One commit in the history of a single file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FileHistoryEntry {
    pub commit: CommitSummary,
    pub change: super::ChangeKind,
    /// The path the file had in this commit.
    pub path: String,
}

/// Blame information for a file at HEAD.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Blame {
    pub path: String,
    pub lines: Vec<String>,
    pub hunks: Vec<BlameHunk>,
}

/// A run of consecutive lines last changed by the same commit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BlameHunk {
    /// 1-based first line of the hunk in the current file.
    pub start_line: u32,
    pub line_count: u32,
    pub commit_id: Sha,
    pub short_id: String,
    pub author: String,
    pub timestamp: i64,
    pub summary: String,
}
