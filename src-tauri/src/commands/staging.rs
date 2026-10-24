use branchly_core::domain::{ConflictSide, FileDiff, HunkRef, WorkingTreeStatus};
use branchly_core::services::{ConflictService, StagingService};
use tauri::State;

use crate::state::{AppState, CmdResult};

#[tauri::command]
#[specta::specta]
pub async fn get_status(
    state: State<'_, AppState>,
    repo_id: String,
) -> CmdResult<WorkingTreeStatus> {
    state
        .run(&repo_id, |ctx| StagingService::new(ctx).status())
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn get_working_diff(
    state: State<'_, AppState>,
    repo_id: String,
    path: String,
    staged: bool,
) -> CmdResult<FileDiff> {
    state
        .run(&repo_id, move |ctx| {
            StagingService::new(ctx).diff(&path, staged)
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn stage_files(
    state: State<'_, AppState>,
    repo_id: String,
    paths: Vec<String>,
) -> CmdResult<()> {
    state
        .run(&repo_id, move |ctx| StagingService::new(ctx).stage(&paths))
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn unstage_files(
    state: State<'_, AppState>,
    repo_id: String,
    paths: Vec<String>,
) -> CmdResult<()> {
    state
        .run(&repo_id, move |ctx| {
            StagingService::new(ctx).unstage(&paths)
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn stage_all(state: State<'_, AppState>, repo_id: String) -> CmdResult<()> {
    state
        .run(&repo_id, |ctx| StagingService::new(ctx).stage_all())
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn unstage_all(state: State<'_, AppState>, repo_id: String) -> CmdResult<()> {
    state
        .run(&repo_id, |ctx| StagingService::new(ctx).unstage_all())
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn discard_files(
    state: State<'_, AppState>,
    repo_id: String,
    paths: Vec<String>,
) -> CmdResult<()> {
    state
        .run(&repo_id, move |ctx| {
            StagingService::new(ctx).discard(&paths)
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn discard_all(state: State<'_, AppState>, repo_id: String) -> CmdResult<()> {
    state
        .run(&repo_id, |ctx| StagingService::new(ctx).discard_all())
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn stage_hunk(
    state: State<'_, AppState>,
    repo_id: String,
    path: String,
    hunk: HunkRef,
) -> CmdResult<()> {
    state
        .run(&repo_id, move |ctx| {
            StagingService::new(ctx).stage_hunk(&path, hunk)
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn unstage_hunk(
    state: State<'_, AppState>,
    repo_id: String,
    path: String,
    hunk: HunkRef,
) -> CmdResult<()> {
    state
        .run(&repo_id, move |ctx| {
            StagingService::new(ctx).unstage_hunk(&path, hunk)
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn discard_hunk(
    state: State<'_, AppState>,
    repo_id: String,
    path: String,
    hunk: HunkRef,
) -> CmdResult<()> {
    state
        .run(&repo_id, move |ctx| {
            StagingService::new(ctx).discard_hunk(&path, hunk)
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn resolve_conflict(
    state: State<'_, AppState>,
    repo_id: String,
    path: String,
    side: ConflictSide,
) -> CmdResult<()> {
    state
        .run(&repo_id, move |ctx| {
            ConflictService::new(ctx).resolve(&path, side)
        })
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn mark_resolved(
    state: State<'_, AppState>,
    repo_id: String,
    path: String,
) -> CmdResult<()> {
    state
        .run(&repo_id, move |ctx| {
            ConflictService::new(ctx).mark_resolved(&path)
        })
        .await
}

/// Aborts the merge, rebase, cherry-pick… in progress.
#[tauri::command]
#[specta::specta]
pub async fn abort_operation(state: State<'_, AppState>, repo_id: String) -> CmdResult<()> {
    state
        .run(&repo_id, |ctx| ConflictService::new(ctx).abort())
        .await
}

/// Concludes the merge, rebase, cherry-pick… in progress.
#[tauri::command]
#[specta::specta]
pub async fn continue_operation(state: State<'_, AppState>, repo_id: String) -> CmdResult<()> {
    state
        .run(&repo_id, |ctx| {
            ConflictService::new(ctx).continue_operation()
        })
        .await
}
