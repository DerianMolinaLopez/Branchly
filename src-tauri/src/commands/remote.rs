use branchly_core::domain::{Progress, PushOptions, Remote, RemoteOutcome};
use branchly_core::services::RemoteService;
use tauri::State;
use tauri::ipc::Channel;

use super::run_operation;
use crate::state::{AppState, CmdResult};

#[tauri::command]
#[specta::specta]
pub async fn list_remotes(state: State<'_, AppState>, repo_id: String) -> CmdResult<Vec<Remote>> {
    state
        .run(&repo_id, |ctx| RemoteService::new(ctx).list())
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn fetch(
    state: State<'_, AppState>,
    repo_id: String,
    op_id: String,
    on_progress: Channel<Progress>,
) -> CmdResult<RemoteOutcome> {
    run_operation(&state, &repo_id, op_id, on_progress, |ctx, op| {
        RemoteService::new(ctx).fetch(op)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn pull(
    state: State<'_, AppState>,
    repo_id: String,
    op_id: String,
    on_progress: Channel<Progress>,
) -> CmdResult<RemoteOutcome> {
    run_operation(&state, &repo_id, op_id, on_progress, |ctx, op| {
        RemoteService::new(ctx).pull(op)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn push(
    state: State<'_, AppState>,
    repo_id: String,
    options: PushOptions,
    op_id: String,
    on_progress: Channel<Progress>,
) -> CmdResult<RemoteOutcome> {
    run_operation(&state, &repo_id, op_id, on_progress, move |ctx, op| {
        RemoteService::new(ctx).push(&options, op)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_remote_branch(
    state: State<'_, AppState>,
    repo_id: String,
    name: String,
    op_id: String,
    on_progress: Channel<Progress>,
) -> CmdResult<RemoteOutcome> {
    run_operation(&state, &repo_id, op_id, on_progress, move |ctx, op| {
        RemoteService::new(ctx).delete_remote_branch(&name, op)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn push_tag(
    state: State<'_, AppState>,
    repo_id: String,
    name: String,
    remote: Option<String>,
    op_id: String,
    on_progress: Channel<Progress>,
) -> CmdResult<RemoteOutcome> {
    run_operation(&state, &repo_id, op_id, on_progress, move |ctx, op| {
        RemoteService::new(ctx).push_tag(&name, remote.as_deref(), op)
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_remote_tag(
    state: State<'_, AppState>,
    repo_id: String,
    name: String,
    remote: Option<String>,
    op_id: String,
    on_progress: Channel<Progress>,
) -> CmdResult<RemoteOutcome> {
    run_operation(&state, &repo_id, op_id, on_progress, move |ctx, op| {
        RemoteService::new(ctx).delete_remote_tag(&name, remote.as_deref(), op)
    })
    .await
}
