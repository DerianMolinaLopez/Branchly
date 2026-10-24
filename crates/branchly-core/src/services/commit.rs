use super::{Context, UndoAction, validate_path, validate_sha};
use crate::domain::{
    Blame, CommitDetail, CommitSummary, FileDiff, FileHistoryEntry, Mutation, RepoState, ResetMode,
    short_sha,
};
use crate::error::{Error, Result};

/// Maximum number of entries returned by a file history request.
pub const MAX_FILE_HISTORY: usize = 2_000;

pub struct CommitService<'a>(Context<'a>);

impl<'a> CommitService<'a> {
    pub fn new(ctx: Context<'a>) -> Self {
        Self(ctx)
    }

    pub fn detail(&self, sha: &str) -> Result<CommitDetail> {
        validate_sha(sha)?;
        self.0.repo.commit_detail(sha)
    }

    pub fn file_diff(&self, sha: &str, path: &str, old_path: Option<&str>) -> Result<FileDiff> {
        validate_sha(sha)?;
        validate_path(path)?;
        if let Some(old) = old_path {
            validate_path(old)?;
        }
        self.0.repo.commit_file_diff(sha, path, old_path)
    }

    pub fn file_history(&self, path: &str) -> Result<Vec<FileHistoryEntry>> {
        validate_path(path)?;
        self.0.repo.file_history(path, MAX_FILE_HISTORY)
    }

    pub fn blame(&self, path: &str) -> Result<Blame> {
        validate_path(path)?;
        self.0.repo.blame(path)
    }

    /// Message of the HEAD commit, used to prefill the editor when amending.
    pub fn head_message(&self) -> Result<Option<String>> {
        self.0.repo.head_message()
    }

    /// Commits the staged changes, or amends HEAD with them.
    pub fn commit(&self, message: &str, amend: bool) -> Result<Mutation<CommitSummary>> {
        let message = message.trim();
        if message.is_empty() {
            return Err(Error::invalid("El mensaje del commit no puede estar vacío"));
        }
        let repo = self.0.repo;
        if !repo.has_identity() {
            return Err(Error::IdentityMissing);
        }
        let _guard = self.0.session.write_guard();
        let head = repo.head()?;
        let status = repo.status()?;
        if !status.conflicted.is_empty() {
            return Err(Error::UnresolvedConflicts(status.conflicted.len()));
        }
        if amend && head.unborn {
            return Err(Error::invalid("Todavía no hay ningún commit que modificar"));
        }
        if !amend && status.staged.is_empty() && status.state != RepoState::Merging {
            return Err(Error::NothingToCommit);
        }

        let created = repo.commit(message, amend)?;
        let summary = repo.commit_summary(&created)?;
        let undo = head.target.map(|previous| {
            let label = if amend {
                format!("Amend de {}", short_sha(&created))
            } else {
                format!("Commit {}", short_sha(&created))
            };
            UndoAction::SoftReset {
                label,
                expected_head: created.clone(),
                restore: previous,
            }
        });
        Ok(Mutation {
            value: summary,
            undo: self.0.session.record_undo(undo),
        })
    }

    /// Moves the current branch (or detached HEAD) to `target`.
    pub fn reset(&self, target: &str, mode: ResetMode) -> Result<Mutation<()>> {
        validate_sha(target)?;
        let repo = self.0.repo;
        let _guard = self.0.session.write_guard();
        let previous = repo
            .head()?
            .target
            .ok_or_else(|| Error::invalid("Todavía no hay ningún commit"))?;
        let target = repo.resolve_commit(target)?;
        repo.reset(&target, mode)?;
        // A hard reset discards changes that cannot be brought back.
        let undo = (mode != ResetMode::Hard && previous != target).then(|| UndoAction::SoftReset {
            label: format!("Reset a {}", short_sha(&target)),
            expected_head: target.clone(),
            restore: previous,
        });
        Ok(Mutation {
            value: (),
            undo: self.0.session.record_undo(undo),
        })
    }
}
