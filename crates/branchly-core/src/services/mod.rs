//! Use cases.
//!
//! Services validate input, enforce safety rules (e.g. refusing to delete the
//! current branch), orchestrate several repository calls and decide which
//! operations can be undone. They only talk to Git through
//! [`GitRepository`](crate::git::GitRepository).

mod branch;
mod commit;
mod conflict;
mod graph;
mod remote;
mod repository;
mod staging;
mod stash;
mod tag;
mod undo;

use std::path::{Component, Path};

pub use branch::BranchService;
pub use commit::CommitService;
pub use conflict::ConflictService;
pub use graph::GraphService;
pub use remote::RemoteService;
pub use repository::RepositoryService;
pub use staging::StagingService;
pub use stash::StashService;
pub use tag::TagService;
pub use undo::{CheckoutTarget, UndoAction, UndoService};

use crate::error::{Error, Result};
use crate::git::GitRepository;
use crate::session::RepoSession;

/// What every repository-bound service needs.
#[derive(Clone, Copy)]
pub struct Context<'a> {
    pub session: &'a RepoSession,
    pub repo: &'a dyn GitRepository,
}

impl<'a> Context<'a> {
    pub fn new(session: &'a RepoSession, repo: &'a dyn GitRepository) -> Self {
        Self { session, repo }
    }
}

/// Rejects paths that are empty, absolute or escape the working tree.
pub fn validate_path(path: &str) -> Result<()> {
    let p = Path::new(path);
    let escapes = p.components().any(|c| {
        matches!(
            c,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    });
    let in_git_dir = p.components().next() == Some(Component::Normal(".git".as_ref()));
    if path.trim().is_empty() || p.is_absolute() || escapes || in_git_dir {
        return Err(Error::invalid(format!("Ruta no válida: «{path}»")));
    }
    Ok(())
}

pub(crate) fn validate_paths(paths: &[String]) -> Result<()> {
    if paths.is_empty() {
        return Err(Error::invalid("No se indicó ningún archivo"));
    }
    paths.iter().try_for_each(|p| validate_path(p))
}

/// Validates a branch name as `git check-ref-format --branch` would.
pub(crate) fn validate_branch_name(name: &str) -> Result<()> {
    let valid = !name.is_empty()
        && !name.starts_with('-')
        && name != "HEAD"
        && git2::Branch::name_is_valid(name).unwrap_or(false);
    if valid {
        Ok(())
    } else {
        Err(Error::invalid(format!(
            "«{name}» no es un nombre de rama válido"
        )))
    }
}

pub(crate) fn validate_tag_name(name: &str) -> Result<()> {
    if !name.is_empty() && !name.starts_with('-') && git2::Tag::is_valid_name(name) {
        Ok(())
    } else {
        Err(Error::invalid(format!(
            "«{name}» no es un nombre de etiqueta válido"
        )))
    }
}

pub(crate) fn validate_remote_name(name: &str) -> Result<()> {
    if !name.starts_with('-') && git2::Remote::is_valid_name(name) {
        Ok(())
    } else {
        Err(Error::invalid(format!(
            "«{name}» no es un nombre de remoto válido"
        )))
    }
}

/// Accepts full or abbreviated (≥ 4 chars) hexadecimal object ids.
pub(crate) fn validate_sha(sha: &str) -> Result<()> {
    if (4..=64).contains(&sha.len()) && sha.chars().all(|c| c.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err(Error::invalid(format!(
            "«{sha}» no es un identificador de commit válido"
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_validation() {
        assert!(validate_path("src/main.rs").is_ok());
        assert!(validate_path("a b/ñ.txt").is_ok());
        assert!(validate_path("").is_err());
        assert!(validate_path("../outside").is_err());
        assert!(validate_path("a/../../b").is_err());
        assert!(validate_path("/etc/passwd").is_err());
        assert!(validate_path(".git/config").is_err());
    }

    #[test]
    fn branch_name_validation() {
        assert!(validate_branch_name("feature/login").is_ok());
        assert!(validate_branch_name("-oops").is_err());
        assert!(validate_branch_name("with space").is_err());
        assert!(validate_branch_name("a..b").is_err());
        assert!(validate_branch_name("HEAD").is_err());
        assert!(validate_branch_name("").is_err());
    }

    #[test]
    fn sha_validation() {
        assert!(validate_sha("a1b2c3d").is_ok());
        assert!(validate_sha("HEAD").is_err());
        assert!(validate_sha("--all").is_err());
    }
}
