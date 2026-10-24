//! Watches open repositories and tells the frontend what changed.
//!
//! Events are debounced (so a `git checkout` touching thousands of files
//! produces a single notification), classified by [`ChangeClassifier`] and
//! dropped when they only touch ignored files or Git internals.

use std::path::Path;
use std::time::Duration;

use branchly_core::watch::{ChangeClassifier, ChangeSet};
use notify::RecursiveMode;
use notify_debouncer_full::{DebounceEventResult, Debouncer, RecommendedCache, new_debouncer};
use tauri::AppHandle;
use tauri_specta::Event;

use crate::events::RepoChanged;

const DEBOUNCE: Duration = Duration::from_millis(300);

/// Stops watching when dropped.
pub struct RepoWatcher {
    _debouncer: Debouncer<notify::RecommendedWatcher, RecommendedCache>,
}

impl RepoWatcher {
    pub fn start(app: AppHandle, repo_id: String, workdir: &Path) -> notify::Result<Self> {
        let classifier = ChangeClassifier::new(workdir);
        let git_dir = classifier.git_dir().to_path_buf();
        let mut debouncer = new_debouncer(DEBOUNCE, None, move |result: DebounceEventResult| {
            let Ok(events) = result else { return };
            let mut changes = ChangeSet::default();
            for event in &events {
                if event.kind.is_access() {
                    continue;
                }
                for path in &event.paths {
                    changes.merge(classifier.classify(path));
                }
            }
            if !changes.is_empty() {
                let _ = RepoChanged {
                    repo_id: repo_id.clone(),
                    changes,
                }
                .emit(&app);
            }
        })?;
        debouncer.watch(workdir, RecursiveMode::Recursive)?;
        // A linked worktree keeps its git dir outside the working tree.
        if !git_dir.starts_with(workdir) {
            debouncer.watch(&git_dir, RecursiveMode::Recursive)?;
        }
        Ok(Self {
            _debouncer: debouncer,
        })
    }
}
