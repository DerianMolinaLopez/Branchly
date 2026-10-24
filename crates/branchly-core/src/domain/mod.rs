//! Domain types shared by every layer and exported to TypeScript.
//!
//! These types are plain data: they carry no `git2` handles so they can cross
//! threads and the IPC boundary freely. Object ids are hex strings at this
//! level; internal hot paths (the graph) keep `git2::Oid`s instead.

mod commit;
mod diff;
mod graph;
mod ops;
mod refs;
mod repo;
mod status;

pub use commit::*;
pub use diff::*;
pub use graph::*;
pub use ops::*;
pub use refs::*;
pub use repo::*;
pub use status::*;

/// A full 40-character hexadecimal object id.
pub type Sha = String;

/// Length of abbreviated object ids shown in the UI.
pub const SHORT_SHA_LEN: usize = 7;

/// Returns the abbreviated form of a hex object id.
pub fn short_sha(sha: &str) -> String {
    sha.chars().take(SHORT_SHA_LEN).collect()
}
