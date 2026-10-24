use super::{Context, validate_remote_name, validate_tag_name};
use crate::domain::{PushOptions, Remote, RemoteOutcome};
use crate::error::{Error, Result};
use crate::git::Operation;

/// Network operations. They run through the git CLI so the user's
/// credentials, ssh-agent and credential helpers apply unchanged.
pub struct RemoteService<'a>(Context<'a>);

impl<'a> RemoteService<'a> {
    pub fn new(ctx: Context<'a>) -> Self {
        Self(ctx)
    }

    pub fn list(&self) -> Result<Vec<Remote>> {
        self.0.repo.remotes()
    }

    pub fn fetch(&self, op: &mut Operation<'_>) -> Result<RemoteOutcome> {
        let output = self.0.repo.fetch(op)?;
        Ok(outcome(&output, "Todo está al día"))
    }

    /// Pulls the current branch. Conflicts are reported in the outcome
    /// rather than as an error, so the UI can offer to resolve them.
    pub fn pull(&self, op: &mut Operation<'_>) -> Result<RemoteOutcome> {
        let _guard = self.0.session.write_guard();
        match self.0.repo.pull(op) {
            Ok(output) => Ok(outcome(&output, "La rama ya estaba actualizada")),
            Err(err @ Error::GitCommand { .. }) => {
                let conflicts = self.0.repo.status()?.conflicted;
                if conflicts.is_empty() {
                    Err(err)
                } else {
                    Ok(RemoteOutcome {
                        message: "El pull terminó con conflictos".to_owned(),
                        conflicts,
                    })
                }
            }
            Err(err) => Err(err),
        }
    }

    /// Pushes the current branch to its upstream, or publishes it on
    /// `options.remote` (default: `origin` or the only remote) when it has none.
    pub fn push(&self, options: &PushOptions, op: &mut Operation<'_>) -> Result<RemoteOutcome> {
        let repo = self.0.repo;
        let head = repo.head()?;
        let branch = head
            .branch
            .filter(|_| !head.detached && !head.unborn)
            .ok_or_else(|| Error::invalid("Cambia a una rama con commits antes de hacer push"))?;

        let configured_remote = repo.config_value(&format!("branch.{branch}.remote"))?;
        let configured_merge = repo.config_value(&format!("branch.{branch}.merge"))?;
        let output = match (configured_remote, configured_merge) {
            (Some(remote), Some(merge)) if remote != "." => {
                let refspec = format!("refs/heads/{branch}:{merge}");
                repo.push(&remote, &refspec, false, options.force_with_lease, op)?
            }
            _ => {
                let remote = self.default_remote(options.remote.as_deref())?;
                repo.push(&remote, &branch, true, options.force_with_lease, op)?
            }
        };
        Ok(outcome(&output, "Push completado"))
    }

    /// Deletes `remote_branch` (e.g. `origin/feature`) on its remote.
    pub fn delete_remote_branch(
        &self,
        remote_branch: &str,
        op: &mut Operation<'_>,
    ) -> Result<RemoteOutcome> {
        let repo = self.0.repo;
        let branch = repo
            .branches()?
            .into_iter()
            .find(|b| b.is_remote && b.name == remote_branch)
            .ok_or_else(|| Error::NotFound(format!("la rama remota «{remote_branch}»")))?;
        let remote = branch
            .remote
            .ok_or_else(|| Error::NotFound(format!("el remoto de «{remote_branch}»")))?;
        let name = remote_branch
            .strip_prefix(&format!("{remote}/"))
            .ok_or_else(|| Error::invalid(format!("«{remote_branch}» no es una rama remota")))?;
        let output = repo.delete_remote_ref(&remote, &format!("refs/heads/{name}"), op)?;
        Ok(outcome(&output, "Rama remota eliminada"))
    }

    pub fn push_tag(
        &self,
        tag: &str,
        remote: Option<&str>,
        op: &mut Operation<'_>,
    ) -> Result<RemoteOutcome> {
        validate_tag_name(tag)?;
        let remote = self.default_remote(remote)?;
        let refspec = format!("refs/tags/{tag}");
        let output = self.0.repo.push(&remote, &refspec, false, false, op)?;
        Ok(outcome(&output, "Etiqueta publicada"))
    }

    pub fn delete_remote_tag(
        &self,
        tag: &str,
        remote: Option<&str>,
        op: &mut Operation<'_>,
    ) -> Result<RemoteOutcome> {
        validate_tag_name(tag)?;
        let remote = self.default_remote(remote)?;
        let output = self
            .0
            .repo
            .delete_remote_ref(&remote, &format!("refs/tags/{tag}"), op)?;
        Ok(outcome(&output, "Etiqueta remota eliminada"))
    }

    fn default_remote(&self, requested: Option<&str>) -> Result<String> {
        let remotes = self.0.repo.remotes()?;
        if let Some(name) = requested {
            validate_remote_name(name)?;
            return remotes
                .iter()
                .find(|r| r.name == name)
                .map(|r| r.name.clone())
                .ok_or_else(|| Error::NotFound(format!("el remoto «{name}»")));
        }
        match remotes.as_slice() {
            [] => Err(Error::invalid("No hay remotos configurados")),
            [only] => Ok(only.name.clone()),
            many => many
                .iter()
                .find(|r| r.name == "origin")
                .map(|r| r.name.clone())
                .ok_or_else(|| Error::invalid("Hay varios remotos: elige uno")),
        }
    }
}

/// Condenses git's output into a short notification message.
fn outcome(output: &str, fallback: &str) -> RemoteOutcome {
    let lines: Vec<&str> = output
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with("hint:"))
        .collect();
    let message = if lines.is_empty() {
        fallback.to_owned()
    } else {
        lines[lines.len().saturating_sub(6)..].join("\n")
    };
    RemoteOutcome {
        message,
        conflicts: Vec::new(),
    }
}
