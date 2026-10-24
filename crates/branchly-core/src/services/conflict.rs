use super::{Context, validate_path};
use crate::domain::ConflictSide;
use crate::error::Result;

/// Resolving conflicts and finishing or aborting the operation that caused
/// them (merge, rebase, cherry-pick…).
pub struct ConflictService<'a>(Context<'a>);

impl<'a> ConflictService<'a> {
    pub fn new(ctx: Context<'a>) -> Self {
        Self(ctx)
    }

    /// Keeps one side of the conflict and marks the file as resolved.
    pub fn resolve(&self, path: &str, side: ConflictSide) -> Result<()> {
        validate_path(path)?;
        let _guard = self.0.session.write_guard();
        self.0.repo.resolve_conflict(path, side)
    }

    /// Marks a file as resolved after editing it by hand.
    pub fn mark_resolved(&self, path: &str) -> Result<()> {
        validate_path(path)?;
        let _guard = self.0.session.write_guard();
        self.0.repo.stage_paths(&[path.to_owned()])
    }

    pub fn abort(&self) -> Result<()> {
        let _guard = self.0.session.write_guard();
        self.0.repo.abort_operation()
    }

    pub fn continue_operation(&self) -> Result<()> {
        let _guard = self.0.session.write_guard();
        self.0.repo.continue_operation()
    }
}
