use serde::{Deserialize, Serialize};

use super::Context;
use crate::domain::{ResetMode, Sha, short_sha};
use crate::error::{Error, Result};

/// Where HEAD pointed before a checkout.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum CheckoutTarget {
    Branch(String),
    Detached(Sha),
}

/// How to revert a local operation, with the state it expects to find.
///
/// Every variant records what the repository must look like for the undo to
/// be safe; if something changed in between (another commit, a ref moved
/// externally…) the undo is refused instead of guessing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum UndoAction {
    /// `git reset --soft restore` while HEAD is still `expected_head`.
    /// Undoes commits, amends and soft/mixed resets without losing changes.
    SoftReset {
        label: String,
        expected_head: Sha,
        restore: Sha,
    },
    /// `git reset --hard restore`, only if the working tree is clean.
    /// Undoes merges and fast-forwards.
    HardReset {
        label: String,
        expected_head: Sha,
        restore: Sha,
    },
    /// Deletes a ref the operation created, if it did not move.
    DeleteRef {
        label: String,
        full_name: String,
        expected: Sha,
    },
    /// Recreates a ref the operation deleted.
    CreateRef {
        label: String,
        full_name: String,
        target: Sha,
        upstream: Option<String>,
    },
    RenameBranch {
        label: String,
        from: String,
        to: String,
    },
    Checkout {
        label: String,
        target: CheckoutTarget,
        expected_head: Option<Sha>,
    },
    StoreStash {
        label: String,
        id: Sha,
        message: String,
    },
    /// Several steps undone in order (e.g. checkout back, then delete branch).
    Sequence {
        label: String,
        steps: Vec<UndoAction>,
    },
}

impl UndoAction {
    pub fn label(&self) -> String {
        match self {
            Self::SoftReset { label, .. }
            | Self::HardReset { label, .. }
            | Self::DeleteRef { label, .. }
            | Self::CreateRef { label, .. }
            | Self::RenameBranch { label, .. }
            | Self::Checkout { label, .. }
            | Self::StoreStash { label, .. }
            | Self::Sequence { label, .. } => label.clone(),
        }
    }
}

pub struct UndoService<'a>(Context<'a>);

impl<'a> UndoService<'a> {
    pub fn new(ctx: Context<'a>) -> Self {
        Self(ctx)
    }

    /// Undoes the operation identified by `handle` and returns a description.
    pub fn undo(&self, handle: u32) -> Result<String> {
        let action = self.0.session.take_undo(handle)?;
        let _guard = self.0.session.write_guard();
        self.execute(&action)?;
        Ok(format!("Se deshizo: {}", action.label()))
    }

    fn execute(&self, action: &UndoAction) -> Result<()> {
        let repo = self.0.repo;
        match action {
            UndoAction::SoftReset {
                expected_head,
                restore,
                ..
            } => {
                self.expect_head(expected_head)?;
                repo.reset(restore, ResetMode::Soft)
            }
            UndoAction::HardReset {
                expected_head,
                restore,
                ..
            } => {
                self.expect_head(expected_head)?;
                if !repo.status()?.is_clean() {
                    return Err(Error::UnsafeOperation(
                        "Hay cambios sin confirmar: no es seguro deshacer esta operación"
                            .to_owned(),
                    ));
                }
                repo.reset(restore, ResetMode::Hard)
            }
            UndoAction::DeleteRef {
                full_name,
                expected,
                ..
            } => {
                let current = repo.reference_target(full_name)?;
                if current.as_deref() != Some(expected.as_str()) {
                    return Err(Error::UnsafeOperation(format!(
                        "«{full_name}» cambió desde la operación original"
                    )));
                }
                if let Some(branch) = full_name.strip_prefix("refs/heads/")
                    && repo.head()?.branch.as_deref() == Some(branch)
                {
                    return Err(Error::UnsafeOperation(format!(
                        "No se puede eliminar «{branch}» porque es la rama actual"
                    )));
                }
                repo.delete_reference(full_name)
            }
            UndoAction::CreateRef {
                full_name,
                target,
                upstream,
                ..
            } => {
                repo.create_reference(full_name, target)?;
                if let (Some(branch), Some(upstream)) =
                    (full_name.strip_prefix("refs/heads/"), upstream)
                {
                    // The remote branch may be gone; the branch itself is back.
                    let _ = repo.set_upstream(branch, Some(upstream));
                }
                Ok(())
            }
            UndoAction::RenameBranch { from, to, .. } => repo.rename_branch(from, to),
            UndoAction::Checkout {
                target,
                expected_head,
                ..
            } => {
                if let Some(expected) = expected_head {
                    self.expect_head(expected)?;
                }
                match target {
                    CheckoutTarget::Branch(name) => repo.checkout_branch(name),
                    CheckoutTarget::Detached(sha) => repo.checkout_detached(sha),
                }
            }
            UndoAction::StoreStash { id, message, .. } => repo.stash_store(id, message),
            UndoAction::Sequence { steps, .. } => {
                steps.iter().try_for_each(|step| self.execute(step))
            }
        }
    }

    fn expect_head(&self, expected: &str) -> Result<()> {
        let head = self.0.repo.head()?.target;
        if head.as_deref() == Some(expected) {
            Ok(())
        } else {
            Err(Error::UnsafeOperation(format!(
                "HEAD ya no apunta a {}: no es seguro deshacer",
                short_sha(expected)
            )))
        }
    }
}
