use branchly_core::domain::{Mutation, Stash};
use branchly_core::services::StashService;
use tauri::State;

use crate::state::{AppState, CmdResult};

#[tauri::command]
#[specta::specta]
pub async fn list_stashes(state: State<'_, AppState>, repo_id: String) -> CmdResult<Vec<Stash>> {
    state
        .run(&repo_id, |ctx| StashService::new(ctx).list())
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn stash_save(
    state: State<'_, AppState>,
    repo_id: String,
    message: Option<String>,
    include_untracked: bool,
) -> CmdResult<Stash> {
    state
        .run(&repo_id, move |ctx| {
            StashService::new(ctx).save(message.as_deref(), include_untracked)
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn stash_apply(state: State<'_, AppState>, repo_id: String, index: u32) -> CmdResult<()> {
    state
        .run(&repo_id, move |ctx| StashService::new(ctx).apply(index))
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn stash_pop(state: State<'_, AppState>, repo_id: String, index: u32) -> CmdResult<()> {
    state
        .run(&repo_id, move |ctx| StashService::new(ctx).pop(index))
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn stash_drop(
    state: State<'_, AppState>,
    repo_id: String,
    index: u32,
) -> CmdResult<Mutation<()>> {
    state
        .run(&repo_id, move |ctx| StashService::new(ctx).drop(index))
        .await
}
