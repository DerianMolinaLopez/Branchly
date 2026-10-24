mod common;

use branchly_core::ErrorCode;
use branchly_core::domain::{ChangeKind, LineKind, ResetMode};
use branchly_core::git::GitRepository;
use branchly_core::services::{CommitService, StagingService, UndoService};
use common::{TestRepo, lines};

#[test]
fn commits_staged_changes() {
    let repo = TestRepo::with_commit();
    repo.write("src/lib.rs", "pub fn answer() -> u32 { 42 }\n");
    repo.with(|ctx| StagingService::new(ctx).stage(&["src/lib.rs".into()]))
        .unwrap();

    let result = repo
        .with(|ctx| CommitService::new(ctx).commit("Add answer\n\nWith a body.", false))
        .unwrap();
    assert_eq!(result.value.summary, "Add answer");
    assert_eq!(result.value.id, repo.head());
    assert!(result.undo.is_some());
    assert_eq!(
        repo.git(&["log", "-1", "--format=%B"]),
        "Add answer\n\nWith a body."
    );

    let status = repo.with(|ctx| StagingService::new(ctx).status()).unwrap();
    assert!(status.is_clean());
}

#[test]
fn rejects_empty_messages_and_empty_commits() {
    let repo = TestRepo::with_commit();
    let err = repo
        .with(|ctx| CommitService::new(ctx).commit("   ", false))
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::InvalidInput);

    let err = repo
        .with(|ctx| CommitService::new(ctx).commit("Nothing", false))
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::NothingToCommit);
}

#[test]
fn first_commit_in_an_empty_repository() {
    let repo = TestRepo::new();
    assert!(repo.repo().head().unwrap().unborn);
    repo.write("a.txt", "a\n");
    repo.with(|ctx| StagingService::new(ctx).stage(&["a.txt".into()]))
        .unwrap();
    let result = repo
        .with(|ctx| CommitService::new(ctx).commit("Root", false))
        .unwrap();
    assert!(result.value.parents.is_empty());
    // There is nothing to go back to for a root commit.
    assert!(result.undo.is_none());
}

#[test]
fn amend_rewrites_head_and_can_be_undone() {
    let repo = TestRepo::with_commit();
    let original = repo.head();
    repo.write("README.md", "# Hello\nMore\n");
    repo.with(|ctx| StagingService::new(ctx).stage(&["README.md".into()]))
        .unwrap();

    let amended = repo
        .with(|ctx| CommitService::new(ctx).commit("Initial commit (amended)", true))
        .unwrap();
    assert_ne!(amended.value.id, original);
    assert!(amended.value.parents.is_empty());
    assert_eq!(repo.git(&["rev-list", "--count", "HEAD"]), "1");

    let undo = amended.undo.unwrap();
    repo.with(|ctx| UndoService::new(ctx).undo(undo.id))
        .unwrap();
    assert_eq!(repo.head(), original);
    // The amended content is kept staged.
    let status = repo.with(|ctx| StagingService::new(ctx).status()).unwrap();
    assert_eq!(status.staged.len(), 1);
}

#[test]
fn undo_commit_is_a_soft_reset_and_refuses_when_head_moved() {
    let repo = TestRepo::with_commit();
    let base = repo.head();
    repo.write("b.txt", "b\n");
    repo.with(|ctx| StagingService::new(ctx).stage(&["b.txt".into()]))
        .unwrap();
    let commit = repo
        .with(|ctx| CommitService::new(ctx).commit("Add b", false))
        .unwrap();
    let handle = commit.undo.unwrap();

    // Someone commits from the terminal in the meantime.
    repo.write("c.txt", "c\n");
    repo.commit_all("External commit");
    let err = repo
        .with(|ctx| UndoService::new(ctx).undo(handle.id))
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::UnsafeOperation);

    // A fresh commit can be undone.
    repo.write("d.txt", "d\n");
    repo.with(|ctx| StagingService::new(ctx).stage(&["d.txt".into()]))
        .unwrap();
    let before = repo.head();
    let commit = repo
        .with(|ctx| CommitService::new(ctx).commit("Add d", false))
        .unwrap();
    repo.with(|ctx| UndoService::new(ctx).undo(commit.undo.unwrap().id))
        .unwrap();
    assert_eq!(repo.head(), before);
    assert_ne!(repo.head(), base);
    let status = repo.with(|ctx| StagingService::new(ctx).status()).unwrap();
    assert_eq!(status.staged[0].path, "d.txt");
}

#[test]
fn undo_handles_are_single_use_and_only_the_latest_is_valid() {
    let repo = TestRepo::with_commit();
    let mut handles = Vec::new();
    for name in ["x", "y"] {
        repo.write(name, name);
        repo.with(|ctx| StagingService::new(ctx).stage(&[name.into()]))
            .unwrap();
        let c = repo
            .with(|ctx| CommitService::new(ctx).commit(name, false))
            .unwrap();
        handles.push(c.undo.unwrap());
    }
    let err = repo
        .with(|ctx| UndoService::new(ctx).undo(handles[0].id))
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::UnsafeOperation);
    repo.with(|ctx| UndoService::new(ctx).undo(handles[1].id))
        .unwrap();
    assert!(
        repo.with(|ctx| UndoService::new(ctx).undo(handles[1].id))
            .is_err()
    );
}

#[test]
fn commit_detail_lists_files_and_stats() {
    let repo = TestRepo::with_commit();
    repo.write("README.md", "# Hello\nworld\n");
    repo.write("new.txt", "one\ntwo\n");
    let sha = repo.commit_all("Second\n\nBody text");

    let detail = repo
        .with(|ctx| CommitService::new(ctx).detail(&sha))
        .unwrap();
    assert_eq!(detail.summary, "Second");
    assert_eq!(detail.body, "Body text");
    assert_eq!(detail.parents.len(), 1);
    assert_eq!(detail.stats.files_changed, 2);
    assert_eq!(detail.stats.additions, 3);
    assert_eq!(detail.stats.deletions, 0);
    let new = detail.files.iter().find(|f| f.path == "new.txt").unwrap();
    assert_eq!(new.kind, ChangeKind::Added);
    assert_eq!(new.additions, 2);
    assert!(detail.refs.iter().any(|r| r.name == "main" && r.is_head));

    let diff = repo
        .with(|ctx| CommitService::new(ctx).file_diff(&sha, "README.md", None))
        .unwrap();
    assert_eq!(diff.hunks.len(), 1);
    let added: Vec<_> = diff.hunks[0]
        .lines
        .iter()
        .filter(|l| l.kind == LineKind::Added)
        .map(|l| l.content.as_str())
        .collect();
    assert_eq!(added, ["world"]);
}

#[test]
fn renames_are_detected_in_commit_details() {
    let repo = TestRepo::with_commit();
    repo.write("old.txt", &lines(20));
    repo.commit_all("Add old");
    repo.git(&["mv", "old.txt", "new.txt"]);
    let sha = repo.commit_all("Rename");
    let detail = repo
        .with(|ctx| CommitService::new(ctx).detail(&sha))
        .unwrap();
    assert_eq!(detail.files.len(), 1);
    assert_eq!(detail.files[0].kind, ChangeKind::Renamed);
    assert_eq!(detail.files[0].old_path.as_deref(), Some("old.txt"));
    let diff = repo
        .with(|ctx| CommitService::new(ctx).file_diff(&sha, "new.txt", Some("old.txt")))
        .unwrap();
    assert_eq!(diff.kind, ChangeKind::Renamed);
}

#[test]
fn file_history_lists_commits_touching_a_file() {
    let repo = TestRepo::with_commit();
    repo.write("a.txt", "1\n");
    let first = repo.commit_all("a: create");
    repo.write("b.txt", "unrelated\n");
    repo.commit_all("b: create");
    repo.write("a.txt", "1\n2\n");
    let second = repo.commit_all("a: update");
    std::fs::remove_file(repo.file("a.txt")).unwrap();
    let third = repo.commit_all("a: delete");

    let history = repo
        .with(|ctx| CommitService::new(ctx).file_history("a.txt"))
        .unwrap();
    let ids: Vec<_> = history.iter().map(|e| e.commit.id.as_str()).collect();
    assert_eq!(ids, [third.as_str(), second.as_str(), first.as_str()]);
    let kinds: Vec<_> = history.iter().map(|e| e.change).collect();
    assert_eq!(
        kinds,
        [ChangeKind::Deleted, ChangeKind::Modified, ChangeKind::Added]
    );
}

#[test]
fn blame_attributes_lines_to_commits() {
    let repo = TestRepo::with_commit();
    repo.write("poem.txt", "roses\nviolets\n");
    let first = repo.commit_all("First lines");
    repo.write("poem.txt", "roses\nviolets\nsugar\n");
    let second = repo.commit_all("Third line");

    let blame = repo
        .with(|ctx| CommitService::new(ctx).blame("poem.txt"))
        .unwrap();
    assert_eq!(blame.lines, ["roses", "violets", "sugar"]);
    assert_eq!(blame.hunks.len(), 2);
    assert_eq!(blame.hunks[0].commit_id, first);
    assert_eq!(
        (blame.hunks[0].start_line, blame.hunks[0].line_count),
        (1, 2)
    );
    assert_eq!(blame.hunks[1].commit_id, second);
    assert_eq!(blame.hunks[1].summary, "Third line");
    assert_eq!(blame.hunks[1].author, "Test User");

    let err = repo
        .with(|ctx| CommitService::new(ctx).blame("missing.txt"))
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::NotFound);
}

#[test]
fn soft_reset_keeps_changes_and_can_be_undone() {
    let repo = TestRepo::with_commit();
    let base = repo.head();
    repo.write("a.txt", "a\n");
    let tip = repo.commit_all("Add a");

    let reset = repo
        .with(|ctx| CommitService::new(ctx).reset(&base, ResetMode::Soft))
        .unwrap();
    assert_eq!(repo.head(), base);
    let status = repo.with(|ctx| StagingService::new(ctx).status()).unwrap();
    assert_eq!(status.staged[0].path, "a.txt");

    repo.with(|ctx| UndoService::new(ctx).undo(reset.undo.unwrap().id))
        .unwrap();
    assert_eq!(repo.head(), tip);
}

#[test]
fn hard_reset_is_not_undoable() {
    let repo = TestRepo::with_commit();
    let base = repo.head();
    repo.write("a.txt", "a\n");
    repo.commit_all("Add a");
    let reset = repo
        .with(|ctx| CommitService::new(ctx).reset(&base, ResetMode::Hard))
        .unwrap();
    assert!(reset.undo.is_none());
    assert!(!repo.file("a.txt").exists());
}
