use super::{Context, UndoAction};
use crate::domain::{Mutation, Stash};
use crate::error::{Error, Result};

pub struct StashService<'a>(Context<'a>);

impl<'a> StashService<'a> {
    pub fn new(ctx: Context<'a>) -> Self {
        Self(ctx)
    }

    pub fn list(&self) -> Result<Vec<Stash>> {
        self.0.repo.stashes()
    }

    pub fn save(&self, message: Option<&str>, include_untracked: bool) -> Result<Stash> {
        let message = message.map(str::trim).filter(|m| !m.is_empty());
        let _guard = self.0.session.write_guard();
        let id = self.0.repo.stash_save(message, include_untracked)?;
        self.0
            .repo
            .stashes()?
            .into_iter()
            .find(|s| s.id == id)
            .ok_or_else(|| Error::NotFound("el stash recién creado".to_owned()))
    }

    pub fn apply(&self, index: u32) -> Result<()> {
        let _guard = self.0.session.write_guard();
        self.find(index)?;
        self.0.repo.stash_apply(index, false)
    }

    pub fn pop(&self, index: u32) -> Result<()> {
        let _guard = self.0.session.write_guard();
        self.find(index)?;
        self.0.repo.stash_apply(index, true)
    }

    pub fn drop(&self, index: u32) -> Result<Mutation<()>> {
        let _guard = self.0.session.write_guard();
        let stash = self.find(index)?;
        self.0.repo.stash_drop(index)?;
        let undo = UndoAction::StoreStash {
            label: format!("Eliminar «{}»", stash.message),
            id: stash.id,
            message: stash.message,
        };
        Ok(Mutation {
            value: (),
            undo: self.0.session.record_undo(Some(undo)),
        })
    }

    fn find(&self, index: u32) -> Result<Stash> {
        self.0
            .repo
            .stashes()?
            .into_iter()
            .find(|s| s.index == index)
            .ok_or_else(|| Error::NotFound(format!("el stash {index}")))
    }
}
