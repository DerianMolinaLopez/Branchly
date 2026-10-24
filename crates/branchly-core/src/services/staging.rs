use super::{Context, validate_path, validate_paths};
use crate::domain::{FileDiff, HunkRef, WorkingTreeStatus};
use crate::error::Result;
use crate::git::HunkAction;

pub struct StagingService<'a>(Context<'a>);

impl<'a> StagingService<'a> {
    pub fn new(ctx: Context<'a>) -> Self {
        Self(ctx)
    }

    pub fn status(&self) -> Result<WorkingTreeStatus> {
        self.0.repo.status()
    }

    pub fn diff(&self, path: &str, staged: bool) -> Result<FileDiff> {
        validate_path(path)?;
        self.0.repo.working_file_diff(path, staged)
    }

    pub fn stage(&self, paths: &[String]) -> Result<()> {
        validate_paths(paths)?;
        let _guard = self.0.session.write_guard();
        self.0.repo.stage_paths(paths)
    }

    pub fn unstage(&self, paths: &[String]) -> Result<()> {
        validate_paths(paths)?;
        let _guard = self.0.session.write_guard();
        self.0.repo.unstage_paths(paths)
    }

    /// Stages every unstaged change. Conflicted files are left alone: they
    /// must be resolved explicitly.
    pub fn stage_all(&self) -> Result<()> {
        let _guard = self.0.session.write_guard();
        let status = self.0.repo.status()?;
        let paths: Vec<String> = status.unstaged.into_iter().map(|f| f.path).collect();
        if paths.is_empty() {
            return Ok(());
        }
        self.0.repo.stage_paths(&paths)
    }

    pub fn unstage_all(&self) -> Result<()> {
        let _guard = self.0.session.write_guard();
        let status = self.0.repo.status()?;
        let mut paths: Vec<String> = Vec::new();
        for file in status.staged {
            paths.extend(file.old_path);
            paths.push(file.path);
        }
        if paths.is_empty() {
            return Ok(());
        }
        self.0.repo.unstage_paths(&paths)
    }

    /// Reverts unstaged changes to the given files; untracked files are deleted.
    pub fn discard(&self, paths: &[String]) -> Result<()> {
        validate_paths(paths)?;
        let _guard = self.0.session.write_guard();
        self.0.repo.discard_paths(paths)
    }

    pub fn discard_all(&self) -> Result<()> {
        let _guard = self.0.session.write_guard();
        let status = self.0.repo.status()?;
        let paths: Vec<String> = status.unstaged.into_iter().map(|f| f.path).collect();
        if paths.is_empty() {
            return Ok(());
        }
        self.0.repo.discard_paths(&paths)
    }

    pub fn stage_hunk(&self, path: &str, hunk: HunkRef) -> Result<()> {
        self.hunk(path, hunk, HunkAction::Stage)
    }

    pub fn unstage_hunk(&self, path: &str, hunk: HunkRef) -> Result<()> {
        self.hunk(path, hunk, HunkAction::Unstage)
    }

    pub fn discard_hunk(&self, path: &str, hunk: HunkRef) -> Result<()> {
        self.hunk(path, hunk, HunkAction::Discard)
    }

    fn hunk(&self, path: &str, hunk: HunkRef, action: HunkAction) -> Result<()> {
        validate_path(path)?;
        let _guard = self.0.session.write_guard();
        self.0.repo.apply_hunk(path, hunk, action)
    }
}
