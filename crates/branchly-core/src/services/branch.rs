use super::{CheckoutTarget, Context, UndoAction, validate_branch_name, validate_sha};
use crate::domain::{Branch, MergeOptions, MergeOutcome, Mutation, short_sha};
use crate::error::{Error, Result};

pub struct BranchService<'a>(Context<'a>);

impl<'a> BranchService<'a> {
    pub fn new(ctx: Context<'a>) -> Self {
        Self(ctx)
    }

    pub fn list(&self) -> Result<Vec<Branch>> {
        self.0.repo.branches()
    }

    /// Creates `name` at `start` (default: HEAD), optionally checking it out.
    pub fn create(
        &self,
        name: &str,
        start: Option<&str>,
        checkout: bool,
    ) -> Result<Mutation<Branch>> {
        validate_branch_name(name)?;
        let repo = self.0.repo;
        let _guard = self.0.session.write_guard();
        let target = match start {
            Some(start) => {
                validate_sha(start)?;
                repo.resolve_commit(start)?
            }
            None => repo
                .head()?
                .target
                .ok_or_else(|| Error::invalid("Haz el primer commit antes de crear ramas"))?,
        };
        let previous = self.checkout_target()?;
        repo.create_branch(name, &target)?;
        let full_name = format!("refs/heads/{name}");
        let delete = UndoAction::DeleteRef {
            label: format!("Crear la rama «{name}»"),
            full_name,
            expected: target.clone(),
        };
        let undo = if checkout {
            if let Err(err) = repo.checkout_branch(name) {
                let _ = repo.delete_branch(name);
                return Err(err);
            }
            UndoAction::Sequence {
                label: format!("Crear y cambiar a «{name}»"),
                steps: vec![
                    UndoAction::Checkout {
                        label: String::new(),
                        target: previous,
                        expected_head: Some(target.clone()),
                    },
                    delete,
                ],
            }
        } else {
            delete
        };
        let branch = self.find_local(name)?;
        Ok(Mutation {
            value: branch,
            undo: self.0.session.record_undo(Some(undo)),
        })
    }

    /// Checks out a local branch.
    pub fn checkout(&self, name: &str) -> Result<Mutation<()>> {
        validate_branch_name(name)?;
        let repo = self.0.repo;
        let _guard = self.0.session.write_guard();
        let previous = self.checkout_target()?;
        if previous == CheckoutTarget::Branch(name.to_owned()) {
            return Ok(Mutation {
                value: (),
                undo: None,
            });
        }
        repo.checkout_branch(name)?;
        let undo = UndoAction::Checkout {
            label: format!("Cambiar a «{name}»"),
            target: previous,
            expected_head: repo.head()?.target,
        };
        Ok(Mutation {
            value: (),
            undo: self.0.session.record_undo(Some(undo)),
        })
    }

    /// Checks out a remote-tracking branch, creating (or reusing) the local
    /// branch that tracks it, like `git switch <name>` does.
    pub fn checkout_remote(&self, remote_branch: &str) -> Result<Mutation<()>> {
        let repo = self.0.repo;
        let branch = repo
            .branches()?
            .into_iter()
            .find(|b| b.is_remote && b.name == remote_branch)
            .ok_or_else(|| Error::NotFound(format!("la rama remota «{remote_branch}»")))?;
        let remote = branch.remote.clone().unwrap_or_default();
        let local = remote_branch
            .strip_prefix(&format!("{remote}/"))
            .unwrap_or(remote_branch)
            .to_owned();
        validate_branch_name(&local)?;
        if repo
            .reference_target(&format!("refs/heads/{local}"))?
            .is_some()
        {
            return self.checkout(&local);
        }

        let _guard = self.0.session.write_guard();
        let previous = self.checkout_target()?;
        repo.create_branch(&local, &branch.target)?;
        repo.set_upstream(&local, Some(remote_branch))?;
        if let Err(err) = repo.checkout_branch(&local) {
            let _ = repo.delete_branch(&local);
            return Err(err);
        }
        let undo = UndoAction::Sequence {
            label: format!("Cambiar a «{local}»"),
            steps: vec![
                UndoAction::Checkout {
                    label: String::new(),
                    target: previous,
                    expected_head: Some(branch.target.clone()),
                },
                UndoAction::DeleteRef {
                    label: String::new(),
                    full_name: format!("refs/heads/{local}"),
                    expected: branch.target,
                },
            ],
        };
        Ok(Mutation {
            value: (),
            undo: self.0.session.record_undo(Some(undo)),
        })
    }

    /// Detaches HEAD at `sha`.
    pub fn checkout_commit(&self, sha: &str) -> Result<Mutation<()>> {
        validate_sha(sha)?;
        let repo = self.0.repo;
        let _guard = self.0.session.write_guard();
        let previous = self.checkout_target()?;
        let target = repo.resolve_commit(sha)?;
        repo.checkout_detached(&target)?;
        let undo = UndoAction::Checkout {
            label: format!("Checkout de {}", short_sha(&target)),
            target: previous,
            expected_head: Some(target),
        };
        Ok(Mutation {
            value: (),
            undo: self.0.session.record_undo(Some(undo)),
        })
    }

    pub fn rename(&self, from: &str, to: &str) -> Result<Mutation<()>> {
        validate_branch_name(from)?;
        validate_branch_name(to)?;
        if from == to {
            return Ok(Mutation {
                value: (),
                undo: None,
            });
        }
        let _guard = self.0.session.write_guard();
        self.0.repo.rename_branch(from, to)?;
        let undo = UndoAction::RenameBranch {
            label: format!("Renombrar «{from}» a «{to}»"),
            from: to.to_owned(),
            to: from.to_owned(),
        };
        Ok(Mutation {
            value: (),
            undo: self.0.session.record_undo(Some(undo)),
        })
    }

    /// Deletes a local branch. Unless `force` is set, refuses to delete a
    /// branch whose commits are not reachable from HEAD or its upstream.
    pub fn delete(&self, name: &str, force: bool) -> Result<Mutation<()>> {
        validate_branch_name(name)?;
        let repo = self.0.repo;
        let _guard = self.0.session.write_guard();
        let branch = self.find_local(name)?;
        if branch.is_head {
            return Err(Error::UnsafeOperation(format!(
                "No puedes eliminar «{name}» porque es la rama actual"
            )));
        }
        if !force && !self.is_merged(&branch)? {
            return Err(Error::BranchNotMerged(name.to_owned()));
        }
        let target = repo.delete_branch(name)?;
        let undo = UndoAction::CreateRef {
            label: format!("Eliminar la rama «{name}»"),
            full_name: branch.full_name,
            target,
            upstream: branch.upstream,
        };
        Ok(Mutation {
            value: (),
            undo: self.0.session.record_undo(Some(undo)),
        })
    }

    /// Merges branch `source` (short name, local or remote) into HEAD.
    pub fn merge(&self, source: &str, options: MergeOptions) -> Result<Mutation<MergeOutcome>> {
        let repo = self.0.repo;
        let branch = repo
            .branches()?
            .into_iter()
            .find(|b| b.name == source)
            .ok_or_else(|| Error::NotFound(format!("la rama «{source}»")))?;
        let _guard = self.0.session.write_guard();
        let head = repo.head()?;
        let current = head
            .branch
            .filter(|_| !head.detached)
            .ok_or_else(|| Error::invalid("Cambia a una rama antes de fusionar"))?;
        if branch.is_head {
            return Err(Error::invalid(
                "No se puede fusionar una rama consigo misma",
            ));
        }
        let previous = head
            .target
            .ok_or_else(|| Error::invalid("Haz el primer commit antes de fusionar"))?;

        let outcome = repo.merge(&branch.name, options)?;
        let undo = match &outcome {
            MergeOutcome::FastForward { head } => Some(head.clone()),
            MergeOutcome::Merged { commit } => Some(commit.id.clone()),
            MergeOutcome::UpToDate | MergeOutcome::Conflicts { .. } => None,
        }
        .map(|new_head| UndoAction::HardReset {
            label: format!("Fusionar «{source}» en «{current}»"),
            expected_head: new_head,
            restore: previous,
        });
        Ok(Mutation {
            value: outcome,
            undo: self.0.session.record_undo(undo),
        })
    }

    fn find_local(&self, name: &str) -> Result<Branch> {
        self.0
            .repo
            .branches()?
            .into_iter()
            .find(|b| !b.is_remote && b.name == name)
            .ok_or_else(|| Error::NotFound(format!("la rama «{name}»")))
    }

    fn is_merged(&self, branch: &Branch) -> Result<bool> {
        let repo = self.0.repo;
        if let Some(head) = repo.head()?.target
            && repo.is_ancestor(&branch.target, &head)?
        {
            return Ok(true);
        }
        if let Some(upstream) = &branch.upstream
            && let Some(up) = repo.reference_target(&format!("refs/remotes/{upstream}"))?
        {
            return repo.is_ancestor(&branch.target, &up);
        }
        Ok(false)
    }

    fn checkout_target(&self) -> Result<CheckoutTarget> {
        let head = self.0.repo.head()?;
        match (head.branch, head.target) {
            (Some(branch), _) if !head.detached => Ok(CheckoutTarget::Branch(branch)),
            (_, Some(sha)) => Ok(CheckoutTarget::Detached(sha)),
            _ => Err(Error::invalid(
                "Haz el primer commit antes de cambiar de rama",
            )),
        }
    }
}
