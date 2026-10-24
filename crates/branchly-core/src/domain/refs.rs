use serde::{Deserialize, Serialize};
use specta::Type;

use super::{Sha, Signature};

/// The namespace a reference lives in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum RefKind {
    LocalBranch,
    RemoteBranch,
    Tag,
    /// A detached HEAD.
    Head,
}

/// A reference decorating a commit in the graph or the detail panel.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RefLabel {
    /// Short name such as `main`, `origin/main` or `v1.0`.
    pub name: String,
    /// Full name such as `refs/heads/main`.
    pub full_name: String,
    pub kind: RefKind,
    /// True for the branch HEAD points to (or the detached HEAD itself).
    pub is_head: bool,
}

/// A local or remote-tracking branch.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub full_name: String,
    pub is_remote: bool,
    pub is_head: bool,
    pub target: Sha,
    /// For remote branches, the remote name (`origin`).
    pub remote: Option<String>,
    /// Short name of the upstream of a local branch (`origin/main`).
    pub upstream: Option<String>,
    /// True when the configured upstream no longer exists.
    pub upstream_gone: bool,
    pub ahead: u32,
    pub behind: u32,
    pub summary: String,
    pub timestamp: i64,
}

/// A tag, peeled to the commit it marks.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub name: String,
    pub target: Sha,
    pub annotated: bool,
    pub message: Option<String>,
    pub tagger: Option<Signature>,
}

/// A stash entry. `index` is its position in `stash@{n}`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Stash {
    pub index: u32,
    pub id: Sha,
    pub message: String,
    /// The branch the stash was created on, parsed from its message.
    pub branch: Option<String>,
    pub timestamp: i64,
}

/// A configured remote.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Remote {
    pub name: String,
    pub fetch_url: Option<String>,
    pub push_url: Option<String>,
}
