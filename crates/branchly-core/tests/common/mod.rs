//! Helpers to build throwaway repositories for integration tests.
#![allow(dead_code)]

use std::path::{Path, PathBuf};
use std::process::Command;

use branchly_core::git::{Git2Repository, GitRepository};
use branchly_core::services::Context;
use branchly_core::session::RepoSession;
use tempfile::TempDir;

/// Runs git in `dir`, panicking with its stderr on failure.
pub fn git(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .current_dir(dir)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("LC_ALL", "C")
        .output()
        .expect("git is installed");
    assert!(
        out.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_owned()
}

/// Repository-level settings that isolate tests from the user's global
/// config (identity, signing, hooks).
pub fn isolate(dir: &Path) {
    let hooks = dir.join(".git").join("no-hooks");
    std::fs::create_dir_all(&hooks).unwrap();
    for (key, value) in [
        ("user.name", "Test User"),
        ("user.email", "test@example.com"),
        ("commit.gpgsign", "false"),
        ("tag.gpgsign", "false"),
        ("core.autocrlf", "false"),
        ("pull.rebase", "false"),
        ("core.hooksPath", hooks.to_str().unwrap()),
    ] {
        git(dir, &["config", key, value]);
    }
}

pub struct TestRepo {
    pub dir: TempDir,
    pub session: RepoSession,
}

impl TestRepo {
    /// An empty repository on branch `main`.
    pub fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        git(dir.path(), &["init", "-q", "-b", "main"]);
        isolate(dir.path());
        let session = RepoSession::open("test".into(), dir.path()).unwrap();
        Self { dir, session }
    }

    /// A repository with one commit containing `README.md`.
    pub fn with_commit() -> Self {
        let repo = Self::new();
        repo.write("README.md", "# Hello\n");
        repo.commit_all("Initial commit");
        repo
    }

    /// Wraps an existing working tree (e.g. a clone).
    pub fn open(dir: TempDir) -> Self {
        isolate(dir.path());
        let session = RepoSession::open("test".into(), dir.path()).unwrap();
        Self { dir, session }
    }

    pub fn path(&self) -> &Path {
        self.dir.path()
    }

    pub fn file(&self, rel: &str) -> PathBuf {
        self.path().join(rel)
    }

    pub fn write(&self, rel: &str, content: &str) {
        let path = self.file(rel);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).unwrap();
        }
        std::fs::write(path, content).unwrap();
    }

    pub fn read(&self, rel: &str) -> String {
        std::fs::read_to_string(self.file(rel)).unwrap()
    }

    pub fn git(&self, args: &[&str]) -> String {
        git(self.path(), args)
    }

    /// Stages everything and commits; returns the new commit id.
    pub fn commit_all(&self, message: &str) -> String {
        self.git(&["add", "-A"]);
        self.git(&["commit", "-q", "-m", message]);
        self.head()
    }

    pub fn head(&self) -> String {
        self.git(&["rev-parse", "HEAD"])
    }

    pub fn repo(&self) -> Git2Repository {
        self.session.repo().unwrap()
    }

    /// Runs `f` with a service context over a fresh repository handle.
    pub fn with<T>(&self, f: impl FnOnce(Context<'_>) -> T) -> T {
        let repo = self.repo();
        let repo: &dyn GitRepository = &repo;
        f(Context::new(&self.session, repo))
    }
}

/// A file of `n` numbered lines.
pub fn lines(n: usize) -> String {
    (1..=n).map(|i| format!("line {i}\n")).collect()
}
