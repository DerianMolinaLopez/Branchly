use branchly_core::domain::{
    Blame, CommitDetail, CommitSummary, FileDiff, FileHistoryEntry, Mutation, ResetMode,
};
use branchly_core::services::{CommitService, UndoService};
use tauri::State;

use crate::state::{AppState, CmdResult};

#[tauri::command]
#[specta::specta]
pub async fn get_commit_detail(
    state: State<'_, AppState>,
    repo_id: String,
    sha: String,
) -> CmdResult<CommitDetail> {
    state
        .run(&repo_id, move |ctx| CommitService::new(ctx).detail(&sha))
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn get_commit_file_diff(
    state: State<'_, AppState>,
    repo_id: String,
    sha: String,
    path: String,
    old_path: Option<String>,
) -> CmdResult<FileDiff> {
    state
        .run(&repo_id, move |ctx| {
            CommitService::new(ctx).file_diff(&sha, &path, old_path.as_deref())
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn get_file_history(
    state: State<'_, AppState>,
    repo_id: String,
    path: String,
) -> CmdResult<Vec<FileHistoryEntry>> {
    state
        .run(&repo_id, move |ctx| {
            CommitService::new(ctx).file_history(&path)
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn get_blame(
    state: State<'_, AppState>,
    repo_id: String,
    path: String,
) -> CmdResult<Blame> {
    state
        .run(&repo_id, move |ctx| CommitService::new(ctx).blame(&path))
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn get_head_message(
    state: State<'_, AppState>,
    repo_id: String,
) -> CmdResult<Option<String>> {
    state
        .run(&repo_id, |ctx| CommitService::new(ctx).head_message())
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn create_commit(
    state: State<'_, AppState>,
    repo_id: String,
    message: String,
    amend: bool,
) -> CmdResult<Mutation<CommitSummary>> {
    state
        .run(&repo_id, move |ctx| {
            CommitService::new(ctx).commit(&message, amend)
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn reset_to(
    state: State<'_, AppState>,
    repo_id: String,
    sha: String,
    mode: ResetMode,
) -> CmdResult<Mutation<()>> {
    state
        .run(&repo_id, move |ctx| {
            CommitService::new(ctx).reset(&sha, mode)
        })
        .await
}

/// Undoes the operation identified by `handle`; returns a description.
#[tauri::command]
#[specta::specta]
pub async fn undo(state: State<'_, AppState>, repo_id: String, handle: u32) -> CmdResult<String> {
    state
        .run(&repo_id, move |ctx| UndoService::new(ctx).undo(handle))
        .await
}
