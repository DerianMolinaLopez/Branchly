use super::{Context, UndoAction, validate_sha, validate_tag_name};
use crate::domain::{Mutation, Tag};
use crate::error::{Error, Result};

pub struct TagService<'a>(Context<'a>);

impl<'a> TagService<'a> {
    pub fn new(ctx: Context<'a>) -> Self {
        Self(ctx)
    }

    pub fn list(&self) -> Result<Vec<Tag>> {
        self.0.repo.tags()
    }

    /// Creates a tag at `target`; annotated when `message` is not empty.
    pub fn create(&self, name: &str, target: &str, message: Option<&str>) -> Result<Mutation<Tag>> {
        validate_tag_name(name)?;
        validate_sha(target)?;
        let message = message.map(str::trim).filter(|m| !m.is_empty());
        let repo = self.0.repo;
        let _guard = self.0.session.write_guard();
        let target = repo.resolve_commit(target)?;
        let reference = repo.create_tag(name, &target, message)?;
        let tag = repo
            .tags()?
            .into_iter()
            .find(|t| t.name == name)
            .ok_or_else(|| Error::NotFound(format!("la etiqueta «{name}»")))?;
        let undo = UndoAction::DeleteRef {
            label: format!("Crear la etiqueta «{name}»"),
            full_name: format!("refs/tags/{name}"),
            expected: reference,
        };
        Ok(Mutation {
            value: tag,
            undo: self.0.session.record_undo(Some(undo)),
        })
    }

    pub fn delete(&self, name: &str) -> Result<Mutation<()>> {
        validate_tag_name(name)?;
        let _guard = self.0.session.write_guard();
        let target = self.0.repo.delete_tag(name)?;
        // Re-pointing the ref at the same object also restores annotated
        // tags: the tag object itself is still in the object database.
        let undo = UndoAction::CreateRef {
            label: format!("Eliminar la etiqueta «{name}»"),
            full_name: format!("refs/tags/{name}"),
            target,
            upstream: None,
        };
        Ok(Mutation {
            value: (),
            undo: self.0.session.record_undo(Some(undo)),
        })
    }
}
