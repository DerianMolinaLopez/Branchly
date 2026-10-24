//! Events pushed from the backend to the frontend.

use branchly_core::watch::ChangeSet;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;

/// Something changed on disk in an open repository.
#[derive(Debug, Clone, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct RepoChanged {
    pub repo_id: String,
    pub changes: ChangeSet,
}
