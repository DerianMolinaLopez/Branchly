use branchly_core::git::GitCli;
use branchly_core::{Error, ErrorPayload};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::state::{AppState, CmdResult, blocking};

/// The installed git version, or `None` when git is not available.
#[tauri::command]
#[specta::specta]
pub async fn get_git_version() -> CmdResult<Option<String>> {
    blocking(|| match GitCli::new().version() {
        Ok(version) => Ok(Some(version)),
        Err(Error::GitNotFound) => Ok(None),
        Err(err) => Err(err),
    })
    .await
}

/// Opens a file of the repository with the system's default application.
#[tauri::command]
#[specta::specta]
pub fn open_in_editor(
    app: AppHandle,
    state: State<'_, AppState>,
    repo_id: String,
    path: String,
) -> CmdResult<()> {
    let full = state.session(&repo_id)?.resolve_path(&path)?;
    app.opener()
        .open_path(full.to_string_lossy(), None::<&str>)
        .map_err(opener_error)
}

/// Shows a file (or the repository folder) in the system file manager.
#[tauri::command]
#[specta::specta]
pub fn reveal_in_file_manager(
    app: AppHandle,
    state: State<'_, AppState>,
    repo_id: String,
    path: Option<String>,
) -> CmdResult<()> {
    let session = state.session(&repo_id)?;
    let target = match path {
        Some(path) => session.resolve_path(&path)?,
        None => session.workdir().to_path_buf(),
    };
    app.opener()
        .reveal_item_in_dir(target)
        .map_err(opener_error)
}

fn opener_error(err: tauri_plugin_opener::Error) -> ErrorPayload {
    ErrorPayload::from(Error::Io(std::io::Error::other(err.to_string())))
}
