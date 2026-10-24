//! Application state shared by all commands.

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use branchly_core::git::{CancelToken, GitRepository};
use branchly_core::recent::RecentStore;
use branchly_core::services::Context;
use branchly_core::session::{RepoSession, display_name};
use branchly_core::{Error, ErrorPayload};
use tauri::AppHandle;

use crate::watcher::RepoWatcher;

pub type CmdResult<T> = Result<T, ErrorPayload>;

struct OpenRepo {
    session: Arc<RepoSession>,
    _watcher: Option<RepoWatcher>,
}

pub struct AppState {
    repos: RwLock<HashMap<String, OpenRepo>>,
    operations: Mutex<HashMap<String, CancelToken>>,
    next_id: AtomicU64,
    launch_path: Mutex<Option<String>>,
    pub recent: RecentStore,
}

impl AppState {
    pub fn new(recent: RecentStore, launch_path: Option<String>) -> Self {
        Self {
            launch_path: Mutex::new(launch_path),
            repos: RwLock::new(HashMap::new()),
            operations: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
            recent,
        }
    }

    /// The repository passed on the command line, returned only once.
    pub fn take_launch_path(&self) -> Option<String> {
        lock(&self.launch_path).take()
    }

    pub fn session(&self, repo_id: &str) -> Result<Arc<RepoSession>, Error> {
        read(&self.repos)
            .get(repo_id)
            .map(|open| Arc::clone(&open.session))
            .ok_or(Error::RepoNotOpen)
    }

    /// Opens (or reuses) a session for the repository containing `path`,
    /// starts watching it and records it as recent.
    pub fn open(&self, app: &AppHandle, path: &Path) -> Result<Arc<RepoSession>, Error> {
        let probe = RepoSession::open(String::new(), path)?;
        if let Some(existing) = read(&self.repos)
            .values()
            .find(|open| open.session.workdir() == probe.workdir())
        {
            return Ok(Arc::clone(&existing.session));
        }

        let id = format!("repo-{}", self.next_id.fetch_add(1, Ordering::Relaxed));
        let session = Arc::new(RepoSession::open(id.clone(), probe.workdir())?);
        let watcher = match RepoWatcher::start(app.clone(), id.clone(), session.workdir()) {
            Ok(watcher) => Some(watcher),
            Err(err) => {
                // The app keeps working without auto-refresh.
                eprintln!(
                    "branchly: could not watch {}: {err}",
                    session.workdir().display()
                );
                None
            }
        };
        let _ = self
            .recent
            .touch(&display_name(session.workdir()), session.workdir());
        write(&self.repos).insert(
            id,
            OpenRepo {
                session: Arc::clone(&session),
                _watcher: watcher,
            },
        );
        Ok(session)
    }

    pub fn close(&self, repo_id: &str) {
        write(&self.repos).remove(repo_id);
    }

    /// Runs `f` on a blocking thread with a fresh repository handle.
    pub async fn run<T, F>(&self, repo_id: &str, f: F) -> CmdResult<T>
    where
        T: Send + 'static,
        F: FnOnce(Context<'_>) -> branchly_core::Result<T> + Send + 'static,
    {
        let session = self.session(repo_id)?;
        blocking(move || {
            let repo = session.repo()?;
            let repo: &dyn GitRepository = &repo;
            f(Context::new(&session, repo))
        })
        .await
    }

    /// Registers a cancellable operation under the id chosen by the frontend.
    pub fn begin_operation(&self, op_id: &str) -> CancelToken {
        let token = CancelToken::new();
        lock(&self.operations).insert(op_id.to_owned(), token.clone());
        token
    }

    pub fn end_operation(&self, op_id: &str) {
        lock(&self.operations).remove(op_id);
    }

    pub fn cancel_operation(&self, op_id: &str) -> bool {
        match lock(&self.operations).get(op_id) {
            Some(token) => {
                token.cancel();
                true
            }
            None => false,
        }
    }
}

/// Runs blocking work (libgit2, the git CLI, file IO) off the async runtime.
pub async fn blocking<T, F>(f: F) -> CmdResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> branchly_core::Result<T> + Send + 'static,
{
    match tauri::async_runtime::spawn_blocking(f).await {
        Ok(result) => result.map_err(ErrorPayload::from),
        Err(err) => Err(ErrorPayload::from(Error::Io(std::io::Error::other(
            err.to_string(),
        )))),
    }
}

fn read<T>(lock: &RwLock<T>) -> std::sync::RwLockReadGuard<'_, T> {
    lock.read().unwrap_or_else(|e| e.into_inner())
}

fn write<T>(lock: &RwLock<T>) -> std::sync::RwLockWriteGuard<'_, T> {
    lock.write().unwrap_or_else(|e| e.into_inner())
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}
