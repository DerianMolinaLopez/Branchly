//! Network operations against a local bare repository (no network needed).

mod common;

use branchly_core::ErrorCode;
use branchly_core::domain::{Progress, PushOptions};
use branchly_core::git::{CancelToken, GitRepository, Operation};
use branchly_core::services::{BranchService, RemoteService, RepositoryService, TagService};
use common::{TestRepo, git};
use tempfile::TempDir;

/// A bare "server" seeded with one commit on `main`, plus a clone of it.
fn server_and_clone() -> (TempDir, TestRepo) {
    let server = tempfile::tempdir().unwrap();
    git(server.path(), &["init", "-q", "--bare", "-b", "main"]);
    let seed = TestRepo::with_commit();
    seed.git(&["remote", "add", "origin", server.path().to_str().unwrap()]);
    seed.git(&["push", "-q", "origin", "main"]);

    let parent = tempfile::tempdir().unwrap();
    let dest = parent.path().join("clone");
    let mut events = Vec::new();
    let mut sink = |p: Progress| events.push(p);
    let mut op = Operation::new(CancelToken::new(), &mut sink);
    let url = server.path().to_str().unwrap();
    let workdir = RepositoryService::clone(url, &dest, &mut op).unwrap();
    assert_eq!(workdir, dest);
    // Keep the clone in a TempDir that owns it.
    let owned = tempfile::Builder::new().tempdir().unwrap();
    std::fs::remove_dir(owned.path()).unwrap();
    std::fs::rename(&dest, owned.path()).unwrap();
    (server, TestRepo::open(owned))
}

fn op_run<T>(f: impl FnOnce(&mut Operation<'_>) -> T) -> (T, Vec<Progress>) {
    let mut events = Vec::new();
    let mut sink = |p: Progress| events.push(p);
    let mut op = Operation::new(CancelToken::new(), &mut sink);
    let result = f(&mut op);
    drop(op);
    (result, events)
}

#[test]
fn clone_validates_its_input() {
    let mut sink = |_: Progress| {};
    let mut op = Operation::new(CancelToken::new(), &mut sink);
    let dir = tempfile::tempdir().unwrap();
    let err = RepositoryService::clone("", &dir.path().join("x"), &mut op).unwrap_err();
    assert_eq!(err.code(), ErrorCode::InvalidInput);
    let err =
        RepositoryService::clone("--upload-pack=evil", &dir.path().join("x"), &mut op).unwrap_err();
    assert_eq!(err.code(), ErrorCode::InvalidInput);
    std::fs::write(dir.path().join("file"), "x").unwrap();
    let err =
        RepositoryService::clone("https://example.com/r.git", dir.path(), &mut op).unwrap_err();
    assert_eq!(err.code(), ErrorCode::AlreadyExists);
    let err =
        RepositoryService::clone("/nonexistent/repo", &dir.path().join("y"), &mut op).unwrap_err();
    assert_eq!(err.code(), ErrorCode::GitCommandFailed);
}

#[test]
fn cancelled_operations_stop() {
    let cancel = CancelToken::new();
    cancel.cancel();
    let mut sink = |_: Progress| {};
    let mut op = Operation::new(cancel, &mut sink);
    let (server, _) = server_and_clone();
    let dir = tempfile::tempdir().unwrap();
    let err = RepositoryService::clone(
        server.path().to_str().unwrap(),
        &dir.path().join("c"),
        &mut op,
    )
    .unwrap_err();
    assert_eq!(err.code(), ErrorCode::Cancelled);
}

#[test]
fn push_publishes_new_branches_and_tracks_them() {
    let (_server, clone) = server_and_clone();
    clone
        .with(|ctx| BranchService::new(ctx).create("topic", None, true))
        .unwrap();
    clone.write("t.txt", "t\n");
    clone.commit_all("Topic work");

    let (outcome, _) =
        op_run(|op| clone.with(|ctx| RemoteService::new(ctx).push(&PushOptions::default(), op)));
    outcome.unwrap();
    let branches = clone.with(|ctx| BranchService::new(ctx).list()).unwrap();
    let topic = branches.iter().find(|b| b.name == "topic").unwrap();
    assert_eq!(topic.upstream.as_deref(), Some("origin/topic"));
    assert_eq!((topic.ahead, topic.behind), (0, 0));
    assert!(
        branches
            .iter()
            .any(|b| b.is_remote && b.name == "origin/topic")
    );
}

#[test]
fn ahead_behind_fetch_and_pull() {
    let (server, clone) = server_and_clone();
    // Another developer pushes a commit.
    let other_parent = tempfile::tempdir().unwrap();
    let other = other_parent.path().join("other");
    git(
        other_parent.path(),
        &["clone", "-q", server.path().to_str().unwrap(), "other"],
    );
    common::isolate(&other);
    std::fs::write(other.join("remote.txt"), "r\n").unwrap();
    git(&other, &["add", "-A"]);
    git(&other, &["commit", "-q", "-m", "Remote work"]);
    git(&other, &["push", "-q", "origin", "main"]);

    // A local commit makes the branches diverge.
    clone.write("local.txt", "l\n");
    clone.commit_all("Local work");
    let main = |clone: &TestRepo| {
        clone
            .with(|ctx| BranchService::new(ctx).list())
            .unwrap()
            .into_iter()
            .find(|b| b.name == "main")
            .unwrap()
    };
    assert_eq!((main(&clone).ahead, main(&clone).behind), (1, 0));

    let (fetched, _) = op_run(|op| clone.with(|ctx| RemoteService::new(ctx).fetch(op)));
    fetched.unwrap();
    assert_eq!((main(&clone).ahead, main(&clone).behind), (1, 1));

    let (pulled, _) = op_run(|op| clone.with(|ctx| RemoteService::new(ctx).pull(op)));
    let pulled = pulled.unwrap();
    assert!(pulled.conflicts.is_empty());
    assert!(clone.file("remote.txt").exists());
    assert_eq!((main(&clone).ahead, main(&clone).behind), (2, 0));

    let (pushed, _) =
        op_run(|op| clone.with(|ctx| RemoteService::new(ctx).push(&PushOptions::default(), op)));
    pushed.unwrap();
    assert_eq!((main(&clone).ahead, main(&clone).behind), (0, 0));
}

#[test]
fn pull_conflicts_are_reported_not_raised() {
    let (server, clone) = server_and_clone();
    let other_parent = tempfile::tempdir().unwrap();
    let other = other_parent.path().join("other");
    git(
        other_parent.path(),
        &["clone", "-q", server.path().to_str().unwrap(), "other"],
    );
    common::isolate(&other);
    std::fs::write(other.join("README.md"), "# Remote\n").unwrap();
    git(&other, &["commit", "-qam", "Remote readme"]);
    git(&other, &["push", "-q", "origin", "main"]);

    clone.write("README.md", "# Local\n");
    clone.commit_all("Local readme");
    let (pulled, _) = op_run(|op| clone.with(|ctx| RemoteService::new(ctx).pull(op)));
    let pulled = pulled.unwrap();
    assert_eq!(pulled.conflicts.len(), 1);
    assert_eq!(pulled.conflicts[0].path, "README.md");
}

#[test]
fn checkout_remote_branch_creates_a_tracking_branch() {
    let (server, clone) = server_and_clone();
    let seed_parent = tempfile::tempdir().unwrap();
    let other = seed_parent.path().join("other");
    git(
        seed_parent.path(),
        &["clone", "-q", server.path().to_str().unwrap(), "other"],
    );
    common::isolate(&other);
    git(&other, &["checkout", "-q", "-b", "shared"]);
    std::fs::write(other.join("s.txt"), "s\n").unwrap();
    git(&other, &["add", "-A"]);
    git(&other, &["commit", "-q", "-m", "Shared"]);
    git(&other, &["push", "-q", "origin", "shared"]);

    let (fetched, _) = op_run(|op| clone.with(|ctx| RemoteService::new(ctx).fetch(op)));
    fetched.unwrap();
    let result = clone
        .with(|ctx| BranchService::new(ctx).checkout_remote("origin/shared"))
        .unwrap();
    let head = clone.repo().head().unwrap();
    assert_eq!(head.branch.as_deref(), Some("shared"));
    let shared = clone
        .with(|ctx| BranchService::new(ctx).list())
        .unwrap()
        .into_iter()
        .find(|b| b.name == "shared")
        .unwrap();
    assert_eq!(shared.upstream.as_deref(), Some("origin/shared"));
    assert!(result.undo.is_some());

    // Deleting the remote branch through the service.
    clone
        .with(|ctx| BranchService::new(ctx).checkout("main"))
        .unwrap();
    let (deleted, _) = op_run(|op| {
        clone.with(|ctx| RemoteService::new(ctx).delete_remote_branch("origin/shared", op))
    });
    deleted.unwrap();
    assert!(
        clone
            .repo()
            .reference_target("refs/remotes/origin/shared")
            .unwrap()
            .is_none()
    );
}

#[test]
fn push_and_delete_tags() {
    let (server, clone) = server_and_clone();
    let head = clone.head();
    clone
        .with(|ctx| TagService::new(ctx).create("v1.0", &head, Some("Release")))
        .unwrap();
    let (pushed, _) =
        op_run(|op| clone.with(|ctx| RemoteService::new(ctx).push_tag("v1.0", None, op)));
    pushed.unwrap();
    assert_eq!(git(server.path(), &["tag", "--list"]), "v1.0");
    let (deleted, _) =
        op_run(|op| clone.with(|ctx| RemoteService::new(ctx).delete_remote_tag("v1.0", None, op)));
    deleted.unwrap();
    assert_eq!(git(server.path(), &["tag", "--list"]), "");
}

#[test]
fn fetch_without_remotes_and_pull_without_upstream_fail_clearly() {
    let repo = TestRepo::with_commit();
    let (fetched, _) = op_run(|op| repo.with(|ctx| RemoteService::new(ctx).fetch(op)));
    assert_eq!(fetched.unwrap_err().code(), ErrorCode::InvalidInput);
    let (pulled, _) = op_run(|op| repo.with(|ctx| RemoteService::new(ctx).pull(op)));
    assert_eq!(pulled.unwrap_err().code(), ErrorCode::InvalidInput);
    let (pushed, _) =
        op_run(|op| repo.with(|ctx| RemoteService::new(ctx).push(&PushOptions::default(), op)));
    assert_eq!(pushed.unwrap_err().code(), ErrorCode::InvalidInput);
}

#[test]
fn init_creates_an_empty_repository() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("fresh");
    let workdir = RepositoryService::init(&path).unwrap();
    assert_eq!(workdir, path);
    let repo = branchly_core::git::Git2Repository::open(&path).unwrap();
    assert!(repo.head().unwrap().unborn);
    let err = RepositoryService::init(&path).unwrap_err();
    assert_eq!(err.code(), ErrorCode::AlreadyExists);
    let err = RepositoryService::init(std::path::Path::new("relative/path")).unwrap_err();
    assert_eq!(err.code(), ErrorCode::InvalidInput);
}

#[test]
fn opening_something_that_is_not_a_repository() {
    let dir = tempfile::tempdir().unwrap();
    let err = branchly_core::session::RepoSession::open("x".into(), dir.path())
        .err()
        .unwrap();
    assert_eq!(err.code(), ErrorCode::NotARepository);
    let err = branchly_core::session::RepoSession::open("x".into(), &dir.path().join("missing"))
        .err()
        .unwrap();
    assert_eq!(err.code(), ErrorCode::PathNotFound);
}
