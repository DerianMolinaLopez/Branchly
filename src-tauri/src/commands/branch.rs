use branchly_core::domain::{Branch, MergeOptions, MergeOutcome, Mutation};
use branchly_core::services::BranchService;
use tauri::State;

use crate::state::{AppState, CmdResult};

#[tauri::command]
#[specta::specta]
pub async fn list_branches(state: State<'_, AppState>, repo_id: String) -> CmdResult<Vec<Branch>> {
    state
        .run(&repo_id, |ctx| BranchService::new(ctx).list())
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn create_branch(
    state: State<'_, AppState>,
    repo_id: String,
    name: String,
    start: Option<String>,
    checkout: bool,
) -> CmdResult<Mutation<Branch>> {
    state
        .run(&repo_id, move |ctx| {
            BranchService::new(ctx).create(&name, start.as_deref(), checkout)
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn checkout_branch(
    state: State<'_, AppState>,
    repo_id: String,
    name: String,
) -> CmdResult<Mutation<()>> {
    state
        .run(&repo_id, move |ctx| BranchService::new(ctx).checkout(&name))
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn checkout_remote_branch(
    state: State<'_, AppState>,
    repo_id: String,
    name: String,
) -> CmdResult<Mutation<()>> {
    state
        .run(&repo_id, move |ctx| BranchService::new(ctx).checkout_remote(&name))
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn checkout_commit(
    state: State<'_, AppState>,
    repo_id: String,
    sha: String,
) -> CmdResult<Mutation<()>> {
    state
        .run(&repo_id, move |ctx| BranchService::new(ctx).checkout_commit(&sha))
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn rename_branch(
    state: State<'_, AppState>,
    repo_id: String,
    from: String,
    to: String,
) -> CmdResult<Mutation<()>> {
    state
        .run(&repo_id, move |ctx| BranchService::new(ctx).rename(&from, &to))
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn delete_branch(
    state: State<'_, AppState>,
    repo_id: String,
    name: String,
    force: bool,
) -> CmdResult<Mutation<()>> {
    state
        .run(&repo_id, move |ctx| BranchService::new(ctx).delete(&name, force))
        .await
}

/// Merges branch `source` into the current branch.
#[tauri::command]
#[specta::specta]
pub async fn merge_branch(
    state: State<'_, AppState>,
    repo_id: String,
    source: String,
    options: MergeOptions,
) -> CmdResult<Mutation<MergeOutcome>> {
    state
        .run(&repo_id, move |ctx| BranchService::new(ctx).merge(&source, options))
        .await
}
