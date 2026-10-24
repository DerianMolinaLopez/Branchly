use branchly_core::domain::{Mutation, Tag};
use branchly_core::services::TagService;
use tauri::State;

use crate::state::{AppState, CmdResult};

#[tauri::command]
#[specta::specta]
pub async fn list_tags(state: State<'_, AppState>, repo_id: String) -> CmdResult<Vec<Tag>> {
    state.run(&repo_id, |ctx| TagService::new(ctx).list()).await
}

#[tauri::command]
#[specta::specta]
pub async fn create_tag(
    state: State<'_, AppState>,
    repo_id: String,
    name: String,
    target: String,
    message: Option<String>,
) -> CmdResult<Mutation<Tag>> {
    state
        .run(&repo_id, move |ctx| {
            TagService::new(ctx).create(&name, &target, message.as_deref())
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_tag(
    state: State<'_, AppState>,
    repo_id: String,
    name: String,
) -> CmdResult<Mutation<()>> {
    state
        .run(&repo_id, move |ctx| TagService::new(ctx).delete(&name))
        .await
}
