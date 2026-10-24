use std::path::PathBuf;

use branchly_core::domain::{Progress, RecentRepo, RepoInfo};
use branchly_core::git::Operation;
use branchly_core::services::RepositoryService;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};

use super::progress_sink;
use crate::state::{AppState, CmdResult, blocking};

/// Opens the repository containing `path`.
#[tauri::command]
#[specta::specta]
pub async fn open_repository(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> CmdResult<RepoInfo> {
    let session = state.open(&app, &PathBuf::from(path))?;
    blocking(move || {
        let repo = session.repo()?;
        session.info(&repo)
    })
    .await
}

/// Creates an empty repository in `path` and opens it.
#[tauri::command]
#[specta::specta]
pub async fn init_repository(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> CmdResult<RepoInfo> {
    let workdir = blocking(move || RepositoryService::init(&PathBuf::from(path))).await?;
    open_repository(app, state, workdir.to_string_lossy().into_owned()).await
}

/// Clones `url` into `dest`, reporting progress, and opens the result.
#[tauri::command]
#[specta::specta]
pub async fn clone_repository(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
    dest: String,
    op_id: String,
    on_progress: Channel<Progress>,
) -> CmdResult<RepoInfo> {
    let token = state.begin_operation(&op_id);
    let result = blocking(move || {
        let mut sink = progress_sink(on_progress);
        let mut op = Operation::new(token, &mut sink);
        RepositoryService::clone(&url, &PathBuf::from(dest), &mut op)
    })
    .await;
    state.end_operation(&op_id);
    open_repository(app, state, result?.to_string_lossy().into_owned()).await
}

/// Suggested folder name for cloning `url`.
#[tauri::command]
#[specta::specta]
pub fn suggest_clone_folder(url: String) -> Option<String> {
    RepositoryService::folder_name_for(&url)
}

#[tauri::command]
#[specta::specta]
pub fn close_repository(state: State<'_, AppState>, repo_id: String) {
    state.close(&repo_id);
}

#[tauri::command]
#[specta::specta]
pub async fn get_repo_info(state: State<'_, AppState>, repo_id: String) -> CmdResult<RepoInfo> {
    state
        .run(&repo_id, |ctx| ctx.session.info(ctx.repo))
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn list_recent_repos(state: State<'_, AppState>) -> CmdResult<Vec<RecentRepo>> {
    Ok(state.recent.list())
}

#[tauri::command]
#[specta::specta]
pub async fn remove_recent_repo(state: State<'_, AppState>, path: String) -> CmdResult<()> {
    Ok(state.recent.remove(&path)?)
}

/// Requests cancellation of a running clone/fetch/pull/push.
#[tauri::command]
#[specta::specta]
pub fn cancel_operation(state: State<'_, AppState>, op_id: String) -> bool {
    state.cancel_operation(&op_id)
}
