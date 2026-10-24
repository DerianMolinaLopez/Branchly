mod common;

use branchly_core::ErrorCode;
use branchly_core::git::GitRepository;
use branchly_core::services::{StashService, TagService, UndoService};
use common::TestRepo;

#[test]
fn stash_save_list_apply_pop_and_drop() {
    let repo = TestRepo::with_commit();
    repo.write("README.md", "# Work in progress\n");
    let stash = repo
        .with(|ctx| StashService::new(ctx).save(Some("my work"), false))
        .unwrap();
    assert_eq!(stash.index, 0);
    assert!(stash.message.contains("my work"));
    assert_eq!(stash.branch.as_deref(), Some("main"));
    assert_eq!(repo.read("README.md"), "# Hello\n");

    repo.write("README.md", "# Second\n");
    repo.with(|ctx| StashService::new(ctx).save(None, false))
        .unwrap();
    let list = repo.with(|ctx| StashService::new(ctx).list()).unwrap();
    assert_eq!(list.len(), 2);
    assert!(list[1].message.contains("my work"));

    // Apply keeps the entry, pop removes it.
    repo.with(|ctx| StashService::new(ctx).apply(1)).unwrap();
    assert_eq!(repo.read("README.md"), "# Work in progress\n");
    assert_eq!(
        repo.with(|ctx| StashService::new(ctx).list())
            .unwrap()
            .len(),
        2
    );
    repo.git(&["checkout", "--", "README.md"]);

    repo.with(|ctx| StashService::new(ctx).pop(0)).unwrap();
    assert_eq!(repo.read("README.md"), "# Second\n");
    assert_eq!(
        repo.with(|ctx| StashService::new(ctx).list())
            .unwrap()
            .len(),
        1
    );

    let err = repo.with(|ctx| StashService::new(ctx).drop(5)).unwrap_err();
    assert_eq!(err.code(), ErrorCode::NotFound);
}

#[test]
fn stash_untracked_files_only_when_asked() {
    let repo = TestRepo::with_commit();
    repo.write("untracked.txt", "u\n");
    let err = repo
        .with(|ctx| StashService::new(ctx).save(None, false))
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::InvalidInput);

    repo.with(|ctx| StashService::new(ctx).save(None, true))
        .unwrap();
    assert!(!repo.file("untracked.txt").exists());
    repo.with(|ctx| StashService::new(ctx).pop(0)).unwrap();
    assert!(repo.file("untracked.txt").exists());
}

#[test]
fn dropped_stash_can_be_restored_with_undo() {
    let repo = TestRepo::with_commit();
    repo.write("README.md", "# Precious\n");
    let stash = repo
        .with(|ctx| StashService::new(ctx).save(Some("precious"), false))
        .unwrap();
    let dropped = repo.with(|ctx| StashService::new(ctx).drop(0)).unwrap();
    assert!(
        repo.with(|ctx| StashService::new(ctx).list())
            .unwrap()
            .is_empty()
    );

    repo.with(|ctx| UndoService::new(ctx).undo(dropped.undo.unwrap().id))
        .unwrap();
    let list = repo.with(|ctx| StashService::new(ctx).list()).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].id, stash.id);
    repo.with(|ctx| StashService::new(ctx).pop(0)).unwrap();
    assert_eq!(repo.read("README.md"), "# Precious\n");
}

#[test]
fn applying_a_conflicting_stash_fails_without_losing_it() {
    let repo = TestRepo::with_commit();
    repo.write("README.md", "# Stashed\n");
    repo.with(|ctx| StashService::new(ctx).save(None, false))
        .unwrap();
    repo.write("README.md", "# Local\n");
    assert!(repo.with(|ctx| StashService::new(ctx).pop(0)).is_err());
    assert_eq!(
        repo.with(|ctx| StashService::new(ctx).list())
            .unwrap()
            .len(),
        1
    );
    assert_eq!(repo.read("README.md"), "# Local\n");
}

#[test]
fn lightweight_and_annotated_tags() {
    let repo = TestRepo::with_commit();
    let first = repo.head();
    repo.write("a.txt", "a\n");
    let second = repo.commit_all("Second");

    let light = repo
        .with(|ctx| TagService::new(ctx).create("v1.0", &first, None))
        .unwrap();
    assert!(!light.value.annotated);
    assert_eq!(light.value.target, first);

    let annotated = repo
        .with(|ctx| TagService::new(ctx).create("v1.10", &second, Some("Release 1.10")))
        .unwrap();
    assert!(annotated.value.annotated);
    assert_eq!(annotated.value.message.as_deref(), Some("Release 1.10"));
    assert_eq!(annotated.value.tagger.as_ref().unwrap().name, "Test User");

    let names: Vec<_> = repo
        .with(|ctx| TagService::new(ctx).list())
        .unwrap()
        .into_iter()
        .map(|t| t.name)
        .collect();
    assert_eq!(names, ["v1.10", "v1.0"]);

    let err = repo
        .with(|ctx| TagService::new(ctx).create("v1.0", &second, None))
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::AlreadyExists);
}

#[test]
fn deleting_an_annotated_tag_can_be_undone() {
    let repo = TestRepo::with_commit();
    let head = repo.head();
    repo.with(|ctx| TagService::new(ctx).create("release", &head, Some("Notes")))
        .unwrap();
    let deleted = repo
        .with(|ctx| TagService::new(ctx).delete("release"))
        .unwrap();
    assert!(
        repo.with(|ctx| TagService::new(ctx).list())
            .unwrap()
            .is_empty()
    );

    repo.with(|ctx| UndoService::new(ctx).undo(deleted.undo.unwrap().id))
        .unwrap();
    let tags = repo.with(|ctx| TagService::new(ctx).list()).unwrap();
    assert_eq!(tags.len(), 1);
    assert!(tags[0].annotated);
    assert_eq!(tags[0].message.as_deref(), Some("Notes"));
}

#[test]
fn creating_a_tag_can_be_undone() {
    let repo = TestRepo::with_commit();
    let head = repo.head();
    let created = repo
        .with(|ctx| TagService::new(ctx).create("tmp", &head, None))
        .unwrap();
    repo.with(|ctx| UndoService::new(ctx).undo(created.undo.unwrap().id))
        .unwrap();
    assert!(
        repo.repo()
            .reference_target("refs/tags/tmp")
            .unwrap()
            .is_none()
    );
}
