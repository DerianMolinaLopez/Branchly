use branchly_core::domain::{GraphInfo, GraphRow, SearchField};
use branchly_core::services::GraphService;
use tauri::State;

use crate::state::{AppState, CmdResult};

#[tauri::command]
#[specta::specta]
pub async fn get_graph_info(state: State<'_, AppState>, repo_id: String) -> CmdResult<GraphInfo> {
    state
        .run(&repo_id, |ctx| GraphService::new(ctx).info())
        .await
}

#[tauri::command]
#[specta::specta]
pub async fn get_graph_rows(
    state: State<'_, AppState>,
    repo_id: String,
    fingerprint: String,
    offset: u32,
    limit: u32,
) -> CmdResult<Vec<GraphRow>> {
    state
        .run(&repo_id, move |ctx| {
            GraphService::new(ctx).rows(&fingerprint, offset, limit)
        })
        .await
}

/// Rows of the commits matching `query`.
#[tauri::command]
#[specta::specta]
pub async fn search_commits(
    state: State<'_, AppState>,
    repo_id: String,
    query: String,
    field: SearchField,
) -> CmdResult<Vec<u32>> {
    state
        .run(&repo_id, move |ctx| GraphService::new(ctx).search(&query, field))
        .await
}

/// Row of a commit in the graph, if present.
#[tauri::command]
#[specta::specta]
pub async fn locate_commit(
    state: State<'_, AppState>,
    repo_id: String,
    sha: String,
) -> CmdResult<Option<u32>> {
    state
        .run(&repo_id, move |ctx| GraphService::new(ctx).locate(&sha))
        .await
}
