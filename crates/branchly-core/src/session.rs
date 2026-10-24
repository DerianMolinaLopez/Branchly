//! Per-repository session state.
//!
//! A [`RepoSession`] exists for each repository opened in the app. It never
//! holds an open libgit2 handle between calls (handles are cheap to open and
//! are not `Sync`); instead it owns what is worth keeping between calls: the
//! computed commit graph, the last undoable operation and a write lock that
//! serialises mutations of the index and refs.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use crate::domain::{RepoId, RepoInfo, UndoHandle};
use crate::error::{Error, Result};
use crate::git::{Git2Repository, GitRepository};
use crate::graph::GraphCache;
use crate::services::UndoAction;

struct UndoEntry {
    id: u32,
    action: UndoAction,
}

pub struct RepoSession {
    id: RepoId,
    workdir: PathBuf,
    graph: Mutex<Option<Arc<GraphCache>>>,
    undo: Mutex<Option<UndoEntry>>,
    undo_counter: AtomicU32,
    write: Mutex<()>,
}

impl RepoSession {
    /// Opens the repository containing `path`.
    pub fn open(id: RepoId, path: &Path) -> Result<Self> {
        let repo = Git2Repository::open(path)?;
        Ok(Self {
            id,
            workdir: repo.workdir().to_path_buf(),
            graph: Mutex::new(None),
            undo: Mutex::new(None),
            undo_counter: AtomicU32::new(0),
            write: Mutex::new(()),
        })
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn workdir(&self) -> &Path {
        &self.workdir
    }

    /// Resolves a repository-relative path to an absolute one, rejecting
    /// paths that would escape the working tree.
    pub fn resolve_path(&self, relative: &str) -> Result<PathBuf> {
        crate::services::validate_path(relative)?;
        Ok(self.workdir.join(relative))
    }

    /// Opens a fresh handle to the repository.
    pub fn repo(&self) -> Result<Git2Repository> {
        Git2Repository::open(&self.workdir).map_err(|err| match err {
            Error::PathNotFound(_) | Error::NotARepository(_) => Error::RepoNotOpen,
            other => other,
        })
    }

    pub fn info(&self, repo: &dyn GitRepository) -> Result<RepoInfo> {
        Ok(RepoInfo {
            id: self.id.clone(),
            name: display_name(&self.workdir),
            path: self.workdir.to_string_lossy().into_owned(),
            head: repo.head()?,
            state: repo.state()?,
        })
    }

    /// The commit graph, rebuilt only when a reference moved.
    pub fn graph(&self, repo: &dyn GitRepository) -> Result<Arc<GraphCache>> {
        let fingerprint = repo.refs_fingerprint()?;
        let mut slot = lock(&self.graph);
        if let Some(graph) = slot.as_ref()
            && graph.fingerprint() == fingerprint
        {
            return Ok(Arc::clone(graph));
        }
        let graph = Arc::new(GraphCache::build(repo, fingerprint)?);
        *slot = Some(Arc::clone(&graph));
        Ok(graph)
    }

    /// Serialises mutations of this repository made by the app.
    pub fn write_guard(&self) -> MutexGuard<'_, ()> {
        lock(&self.write)
    }

    /// Remembers `action` as the way to undo the operation just performed,
    /// replacing any previous one.
    pub fn record_undo(&self, action: Option<UndoAction>) -> Option<UndoHandle> {
        let action = action?;
        let mut slot = lock(&self.undo);
        let id = self.undo_counter.fetch_add(1, Ordering::Relaxed) + 1;
        let handle = UndoHandle {
            id,
            label: action.label(),
        };
        *slot = Some(UndoEntry { id, action });
        Some(handle)
    }

    /// Takes the undo action for handle `id` if it is still the latest one.
    pub fn take_undo(&self, id: u32) -> Result<UndoAction> {
        let mut slot = lock(&self.undo);
        match slot.take() {
            Some(entry) if entry.id == id => Ok(entry.action),
            other => {
                *slot = other;
                Err(Error::UnsafeOperation(
                    "Esta acción ya no se puede deshacer porque se realizaron otras operaciones"
                        .to_owned(),
                ))
            }
        }
    }
}

/// The folder name of a repository, used as its display name.
pub fn display_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

/// Locks a mutex, recovering from poisoning: the protected data is always
/// left consistent because every critical section is a simple replacement.
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}
