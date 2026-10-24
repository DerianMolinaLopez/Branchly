use std::path::{Path, PathBuf};

use crate::error::{Error, Result};
use crate::git::{Git2Repository, GitCli, GitRepository, Operation};

/// Creating repositories (init, clone) before a session exists.
pub struct RepositoryService;

impl RepositoryService {
    /// Initialises an empty repository in `path` and returns its working tree.
    pub fn init(path: &Path) -> Result<PathBuf> {
        require_absolute(path)?;
        let repo = Git2Repository::init(path)?;
        Ok(repo.workdir().to_path_buf())
    }

    /// Clones `url` into `dest` and returns the new working tree.
    pub fn clone(url: &str, dest: &Path, op: &mut Operation<'_>) -> Result<PathBuf> {
        let url = url.trim();
        if url.is_empty() {
            return Err(Error::invalid("Indica la URL del repositorio"));
        }
        if url.starts_with('-') || url.chars().any(char::is_whitespace) {
            return Err(Error::invalid("La URL del repositorio no es válida"));
        }
        require_absolute(dest)?;
        let parent = dest
            .parent()
            .ok_or_else(|| Error::invalid("La carpeta de destino no es válida"))?;
        if !parent.is_dir() {
            return Err(Error::PathNotFound(parent.to_path_buf()));
        }
        if dest.exists() {
            let empty = dest.is_dir() && std::fs::read_dir(dest)?.next().is_none();
            if !empty {
                return Err(Error::AlreadyExists(format!(
                    "la carpeta «{}» y no está vacía",
                    dest.display()
                )));
            }
        }
        GitCli::new().clone_repo(url, dest, op)?;
        Ok(Git2Repository::open(dest)?.workdir().to_path_buf())
    }

    /// Suggests a folder name for a clone URL (`…/repo.git` → `repo`).
    pub fn folder_name_for(url: &str) -> Option<String> {
        let trimmed = url.trim().trim_end_matches('/');
        let last = trimmed.rsplit(['/', ':', '\\']).next()?;
        let name = last.strip_suffix(".git").unwrap_or(last);
        (!name.is_empty()).then(|| name.to_owned())
    }
}

fn require_absolute(path: &Path) -> Result<()> {
    if path.is_absolute() {
        Ok(())
    } else {
        Err(Error::invalid("La ruta debe ser absoluta"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_names_from_urls() {
        let name = RepositoryService::folder_name_for;
        assert_eq!(
            name("https://github.com/user/repo.git").as_deref(),
            Some("repo")
        );
        assert_eq!(
            name("git@github.com:user/my-app.git").as_deref(),
            Some("my-app")
        );
        assert_eq!(name("https://example.com/repo/").as_deref(), Some("repo"));
        assert_eq!(name("").as_deref(), None);
    }
}
