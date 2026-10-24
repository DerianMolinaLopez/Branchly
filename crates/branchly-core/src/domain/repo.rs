use serde::{Deserialize, Serialize};
use specta::Type;

use super::Sha;

/// Opaque identifier of a repository opened in this session.
pub type RepoId = String;

/// Where HEAD points.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct HeadInfo {
    /// Short name of the current branch; `None` when detached.
    pub branch: Option<String>,
    pub detached: bool,
    /// The commit HEAD resolves to; `None` on an unborn branch.
    pub target: Option<Sha>,
    /// True right after `git init`, before the first commit.
    pub unborn: bool,
}

/// An operation that is in progress and must be finished or aborted.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum RepoState {
    Clean,
    Merging,
    Rebasing,
    CherryPicking,
    Reverting,
    Bisecting,
    ApplyingMailbox,
}

/// Summary of an open repository.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub id: RepoId,
    pub name: String,
    pub path: String,
    pub head: HeadInfo,
    pub state: RepoState,
}

/// An entry of the "recent repositories" list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RecentRepo {
    pub name: String,
    pub path: String,
    /// Seconds since the Unix epoch.
    pub last_opened: i64,
    /// False when the folder no longer exists or is not a repository.
    pub available: bool,
}
