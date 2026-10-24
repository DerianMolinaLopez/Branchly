//! Tauri commands: thin adapters from IPC to the core services.
//!
//! A command only converts its arguments, picks the session and delegates to
//! a service on a blocking thread. No Git logic lives here.

pub mod branch;
pub mod commit;
pub mod graph;
pub mod remote;
pub mod repository;
pub mod staging;
pub mod stash;
pub mod system;
pub mod tag;

use branchly_core::domain::Progress;
use branchly_core::git::Operation;
use branchly_core::services::Context;
use tauri::ipc::Channel;

use crate::state::{AppState, CmdResult};

/// Forwards progress to the frontend, skipping repeated updates so a fast
/// transfer does not flood the IPC channel.
pub(crate) fn progress_sink(channel: Channel<Progress>) -> impl FnMut(Progress) {
    let mut last: Option<(String, Option<u8>, String)> = None;
    move |progress: Progress| {
        let key = if progress.percent.is_some() {
            (progress.phase.clone(), progress.percent, String::new())
        } else {
            (progress.phase.clone(), None, progress.message.clone())
        };
        if last.as_ref() != Some(&key) {
            last = Some(key);
            let _ = channel.send(progress);
        }
    }
}

/// Runs a cancellable, progress-reporting operation on a repository.
pub(crate) async fn run_operation<T, F>(
    state: &AppState,
    repo_id: &str,
    op_id: String,
    channel: Channel<Progress>,
    f: F,
) -> CmdResult<T>
where
    T: Send + 'static,
    F: FnOnce(Context<'_>, &mut Operation<'_>) -> branchly_core::Result<T> + Send + 'static,
{
    let token = state.begin_operation(&op_id);
    let result = state
        .run(repo_id, move |ctx| {
            let mut sink = progress_sink(channel);
            let mut op = Operation::new(token, &mut sink);
            f(ctx, &mut op)
        })
        .await;
    state.end_operation(&op_id);
    result
}
