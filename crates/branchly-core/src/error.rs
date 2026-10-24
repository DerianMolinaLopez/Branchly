//! Typed errors of the core crate.
//!
//! Every variant maps to a stable [`ErrorCode`] the frontend can branch on and
//! a message written for end users (the UI is in Spanish).

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use specta::Type;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("«{}» no es un repositorio Git", .0.display())]
    NotARepository(PathBuf),

    #[error("La ruta «{}» no existe", .0.display())]
    PathNotFound(PathBuf),

    #[error("El repositorio no está abierto")]
    RepoNotOpen,

    #[error("{0}")]
    InvalidInput(String),

    #[error("No se encontró {0}")]
    NotFound(String),

    #[error("No hay cambios preparados para hacer commit")]
    NothingToCommit,

    #[error(
        "Tu identidad de Git no está configurada. Ejecuta `git config --global user.name` \
         y `git config --global user.email`."
    )]
    IdentityMissing,

    #[error("Tus cambios locales se sobrescribirían: {0}")]
    WouldOverwriteChanges(String),

    #[error("La rama «{0}» tiene commits que no están fusionados")]
    BranchNotMerged(String),

    #[error("Ya existe {0}")]
    AlreadyExists(String),

    #[error("Hay {0} archivo(s) con conflictos sin resolver")]
    UnresolvedConflicts(usize),

    #[error("El diff cambió desde que se mostró; vuelve a intentarlo")]
    StaleDiff,

    #[error("El historial cambió mientras se cargaba; actualizando")]
    StaleGraph,

    #[error("{0}")]
    UnsafeOperation(String),

    #[error("Operación cancelada")]
    Cancelled,

    #[error("No se encontró el ejecutable `git`. Instala Git y asegúrate de que esté en el PATH.")]
    GitNotFound,

    #[error("{stderr}")]
    GitCommand {
        command: String,
        stderr: String,
        code: Option<i32>,
    },

    #[error("Error de Git: {}", .0.message())]
    Git(#[from] git2::Error),

    #[error("Error de E/S: {0}")]
    Io(#[from] std::io::Error),
}

/// Stable, machine readable error codes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    NotARepository,
    PathNotFound,
    RepoNotOpen,
    InvalidInput,
    NotFound,
    NothingToCommit,
    IdentityMissing,
    WouldOverwriteChanges,
    BranchNotMerged,
    AlreadyExists,
    UnresolvedConflicts,
    StaleDiff,
    StaleGraph,
    UnsafeOperation,
    Cancelled,
    GitNotFound,
    GitCommandFailed,
    Git,
    Io,
}

impl Error {
    pub fn code(&self) -> ErrorCode {
        match self {
            Self::NotARepository(_) => ErrorCode::NotARepository,
            Self::PathNotFound(_) => ErrorCode::PathNotFound,
            Self::RepoNotOpen => ErrorCode::RepoNotOpen,
            Self::InvalidInput(_) => ErrorCode::InvalidInput,
            Self::NotFound(_) => ErrorCode::NotFound,
            Self::NothingToCommit => ErrorCode::NothingToCommit,
            Self::IdentityMissing => ErrorCode::IdentityMissing,
            Self::WouldOverwriteChanges(_) => ErrorCode::WouldOverwriteChanges,
            Self::BranchNotMerged(_) => ErrorCode::BranchNotMerged,
            Self::AlreadyExists(_) => ErrorCode::AlreadyExists,
            Self::UnresolvedConflicts(_) => ErrorCode::UnresolvedConflicts,
            Self::StaleDiff => ErrorCode::StaleDiff,
            Self::StaleGraph => ErrorCode::StaleGraph,
            Self::UnsafeOperation(_) => ErrorCode::UnsafeOperation,
            Self::Cancelled => ErrorCode::Cancelled,
            Self::GitNotFound => ErrorCode::GitNotFound,
            Self::GitCommand { .. } => ErrorCode::GitCommandFailed,
            Self::Git(_) => ErrorCode::Git,
            Self::Io(_) => ErrorCode::Io,
        }
    }

    pub(crate) fn invalid(message: impl Into<String>) -> Self {
        Self::InvalidInput(message.into())
    }
}

/// The serialised form of an [`Error`] sent across the IPC boundary.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ErrorPayload {
    pub code: ErrorCode,
    pub message: String,
    /// Extra technical detail (e.g. the failing git command), if any.
    pub detail: Option<String>,
}

impl From<&Error> for ErrorPayload {
    fn from(error: &Error) -> Self {
        let detail = match error {
            Error::GitCommand { command, code, .. } => Some(match code {
                Some(code) => format!("git {command} (código {code})"),
                None => format!("git {command}"),
            }),
            Error::Git(err) => Some(format!("{:?}/{:?}", err.class(), err.code())),
            _ => None,
        };
        Self {
            code: error.code(),
            message: error.to_string(),
            detail,
        }
    }
}

impl From<Error> for ErrorPayload {
    fn from(error: Error) -> Self {
        Self::from(&error)
    }
}
