mod common;

use branchly_core::ErrorCode;
use branchly_core::domain::{ChangeKind, HunkRef, LineKind};
use branchly_core::services::StagingService;
use common::{TestRepo, lines};

/// A committed 30-line file with two separate edits (lines 2 and 28),
/// which produce two hunks with the default 3 lines of context.
fn repo_with_two_hunks() -> TestRepo {
    let repo = TestRepo::with_commit();
    repo.write("file.txt", &lines(30));
    repo.commit_all("Add file");
    let edited = lines(30)
        .replace("line 2\n", "line 2 changed\n")
        .replace("line 28\n", "line 28 changed\n");
    repo.write("file.txt", &edited);
    repo
}

#[test]
fn status_reports_staged_unstaged_and_untracked_files() {
    let repo = TestRepo::with_commit();
    repo.write("README.md", "# Changed\n");
    repo.write("new/file.txt", "new\n");
    repo.write("staged.txt", "staged\n");
    repo.git(&["add", "staged.txt"]);

    let status = repo.with(|ctx| StagingService::new(ctx).status()).unwrap();
    assert_eq!(status.staged.len(), 1);
    assert_eq!(status.staged[0].path, "staged.txt");
    assert_eq!(status.staged[0].kind, ChangeKind::Added);
    let unstaged: Vec<_> = status
        .unstaged
        .iter()
        .map(|f| (f.path.as_str(), f.kind))
        .collect();
    assert_eq!(
        unstaged,
        [
            ("README.md", ChangeKind::Modified),
            ("new/file.txt", ChangeKind::Untracked)
        ]
    );
}

#[test]
fn staged_renames_report_both_paths() {
    let repo = TestRepo::with_commit();
    repo.write("old.txt", &lines(20));
    repo.commit_all("Add old");
    repo.git(&["mv", "old.txt", "new.txt"]);
    let status = repo.with(|ctx| StagingService::new(ctx).status()).unwrap();
    assert_eq!(status.staged.len(), 1);
    assert_eq!(status.staged[0].kind, ChangeKind::Renamed);
    assert_eq!(status.staged[0].path, "new.txt");
    assert_eq!(status.staged[0].old_path.as_deref(), Some("old.txt"));
}

#[test]
fn stage_and_unstage_files() {
    let repo = TestRepo::with_commit();
    repo.write("README.md", "# Changed\n");
    repo.write("untracked.txt", "u\n");
    std::fs::write(repo.file("README.md"), "# Changed\n").unwrap();

    repo.with(|ctx| StagingService::new(ctx).stage(&["README.md".into(), "untracked.txt".into()]))
        .unwrap();
    let status = repo.with(|ctx| StagingService::new(ctx).status()).unwrap();
    assert_eq!(status.staged.len(), 2);
    assert!(status.unstaged.is_empty());

    repo.with(|ctx| StagingService::new(ctx).unstage(&["untracked.txt".into()]))
        .unwrap();
    let status = repo.with(|ctx| StagingService::new(ctx).status()).unwrap();
    assert_eq!(status.staged.len(), 1);
    assert_eq!(status.unstaged[0].kind, ChangeKind::Untracked);

    repo.with(|ctx| StagingService::new(ctx).unstage_all())
        .unwrap();
    repo.with(|ctx| StagingService::new(ctx).stage_all())
        .unwrap();
    let status = repo.with(|ctx| StagingService::new(ctx).status()).unwrap();
    assert_eq!(status.staged.len(), 2);
}

#[test]
fn stage_a_deleted_file() {
    let repo = TestRepo::with_commit();
    std::fs::remove_file(repo.file("README.md")).unwrap();
    repo.with(|ctx| StagingService::new(ctx).stage(&["README.md".into()]))
        .unwrap();
    let status = repo.with(|ctx| StagingService::new(ctx).status()).unwrap();
    assert_eq!(status.staged[0].kind, ChangeKind::Deleted);
}

#[test]
fn unstage_in_an_empty_repository() {
    let repo = TestRepo::new();
    repo.write("a.txt", "a\n");
    repo.with(|ctx| StagingService::new(ctx).stage(&["a.txt".into()]))
        .unwrap();
    repo.with(|ctx| StagingService::new(ctx).unstage(&["a.txt".into()]))
        .unwrap();
    let status = repo.with(|ctx| StagingService::new(ctx).status()).unwrap();
    assert!(status.staged.is_empty());
    assert_eq!(status.unstaged.len(), 1);
}

#[test]
fn working_diff_shows_hunks_with_line_numbers() {
    let repo = repo_with_two_hunks();
    let diff = repo
        .with(|ctx| StagingService::new(ctx).diff("file.txt", false))
        .unwrap();
    assert_eq!(diff.hunks.len(), 2);
    let first = &diff.hunks[0];
    let deleted = first
        .lines
        .iter()
        .find(|l| l.kind == LineKind::Deleted)
        .unwrap();
    assert_eq!(
        (deleted.content.as_str(), deleted.old_line),
        ("line 2", Some(2))
    );
    let added = first
        .lines
        .iter()
        .find(|l| l.kind == LineKind::Added)
        .unwrap();
    assert_eq!(
        (added.content.as_str(), added.new_line),
        ("line 2 changed", Some(2))
    );
}

#[test]
fn untracked_files_have_a_diff_with_their_content() {
    let repo = TestRepo::with_commit();
    repo.write("new.txt", "hello\nworld\n");
    let diff = repo
        .with(|ctx| StagingService::new(ctx).diff("new.txt", false))
        .unwrap();
    assert_eq!(diff.kind, ChangeKind::Untracked);
    assert_eq!(diff.hunks.len(), 1);
    assert_eq!(diff.hunks[0].lines.len(), 2);
}

#[test]
fn stage_a_single_hunk() {
    let repo = repo_with_two_hunks();
    let diff = repo
        .with(|ctx| StagingService::new(ctx).diff("file.txt", false))
        .unwrap();
    let second = HunkRef::of(1, &diff.hunks[1]);
    repo.with(|ctx| StagingService::new(ctx).stage_hunk("file.txt", second))
        .unwrap();

    let staged = repo
        .with(|ctx| StagingService::new(ctx).diff("file.txt", true))
        .unwrap();
    assert_eq!(staged.hunks.len(), 1);
    assert!(
        staged.hunks[0]
            .lines
            .iter()
            .any(|l| l.content == "line 28 changed")
    );
    let unstaged = repo
        .with(|ctx| StagingService::new(ctx).diff("file.txt", false))
        .unwrap();
    assert_eq!(unstaged.hunks.len(), 1);
    assert!(
        unstaged.hunks[0]
            .lines
            .iter()
            .any(|l| l.content == "line 2 changed")
    );
    // The working tree is untouched.
    assert!(repo.read("file.txt").contains("line 2 changed"));
}

#[test]
fn unstage_a_single_hunk() {
    let repo = repo_with_two_hunks();
    repo.git(&["add", "file.txt"]);
    let staged = repo
        .with(|ctx| StagingService::new(ctx).diff("file.txt", true))
        .unwrap();
    assert_eq!(staged.hunks.len(), 2);
    let first = HunkRef::of(0, &staged.hunks[0]);
    repo.with(|ctx| StagingService::new(ctx).unstage_hunk("file.txt", first))
        .unwrap();

    let staged = repo
        .with(|ctx| StagingService::new(ctx).diff("file.txt", true))
        .unwrap();
    assert_eq!(staged.hunks.len(), 1);
    assert!(
        staged.hunks[0]
            .lines
            .iter()
            .any(|l| l.content == "line 28 changed")
    );
    let unstaged = repo
        .with(|ctx| StagingService::new(ctx).diff("file.txt", false))
        .unwrap();
    assert_eq!(unstaged.hunks.len(), 1);
    assert!(
        unstaged.hunks[0]
            .lines
            .iter()
            .any(|l| l.content == "line 2 changed")
    );
}

#[test]
fn discard_a_single_hunk() {
    let repo = repo_with_two_hunks();
    let diff = repo
        .with(|ctx| StagingService::new(ctx).diff("file.txt", false))
        .unwrap();
    let first = HunkRef::of(0, &diff.hunks[0]);
    repo.with(|ctx| StagingService::new(ctx).discard_hunk("file.txt", first))
        .unwrap();
    let content = repo.read("file.txt");
    assert!(!content.contains("line 2 changed"));
    assert!(content.contains("line 2\n"));
    assert!(content.contains("line 28 changed"));
}

#[test]
fn hunk_actions_on_new_files_act_on_the_whole_file() {
    let repo = TestRepo::with_commit();
    repo.write("new.txt", "a\nb\n");
    let diff = repo
        .with(|ctx| StagingService::new(ctx).diff("new.txt", false))
        .unwrap();
    repo.with(|ctx| StagingService::new(ctx).stage_hunk("new.txt", HunkRef::of(0, &diff.hunks[0])))
        .unwrap();
    let status = repo.with(|ctx| StagingService::new(ctx).status()).unwrap();
    assert_eq!(status.staged[0].kind, ChangeKind::Added);

    let staged = repo
        .with(|ctx| StagingService::new(ctx).diff("new.txt", true))
        .unwrap();
    repo.with(|ctx| {
        StagingService::new(ctx).unstage_hunk("new.txt", HunkRef::of(0, &staged.hunks[0]))
    })
    .unwrap();
    let status = repo.with(|ctx| StagingService::new(ctx).status()).unwrap();
    assert!(status.staged.is_empty());
    assert_eq!(status.unstaged[0].kind, ChangeKind::Untracked);
}

#[test]
fn stale_hunks_are_rejected() {
    let repo = repo_with_two_hunks();
    let diff = repo
        .with(|ctx| StagingService::new(ctx).diff("file.txt", false))
        .unwrap();
    let mut hunk = HunkRef::of(0, &diff.hunks[0]);
    hunk.new_lines += 1;
    let err = repo
        .with(|ctx| StagingService::new(ctx).stage_hunk("file.txt", hunk))
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::StaleDiff);

    let out_of_range = HunkRef {
        index: 9,
        ..HunkRef::of(0, &diff.hunks[0])
    };
    let err = repo
        .with(|ctx| StagingService::new(ctx).stage_hunk("file.txt", out_of_range))
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::StaleDiff);
}

#[test]
fn discard_restores_tracked_files_and_deletes_untracked_ones() {
    let repo = TestRepo::with_commit();
    repo.write("README.md", "# Broken\n");
    repo.write("junk/tmp.txt", "junk\n");
    repo.with(|ctx| StagingService::new(ctx).discard(&["README.md".into(), "junk/tmp.txt".into()]))
        .unwrap();
    assert_eq!(repo.read("README.md"), "# Hello\n");
    assert!(!repo.file("junk/tmp.txt").exists());

    repo.write("README.md", "# Again\n");
    repo.write("other.txt", "x\n");
    repo.with(|ctx| StagingService::new(ctx).discard_all())
        .unwrap();
    let status = repo.with(|ctx| StagingService::new(ctx).status()).unwrap();
    assert!(status.is_clean());
}

#[test]
fn discard_only_reverts_unstaged_changes() {
    let repo = TestRepo::with_commit();
    repo.write("README.md", "# Staged\n");
    repo.git(&["add", "README.md"]);
    repo.write("README.md", "# Staged then edited\n");
    repo.with(|ctx| StagingService::new(ctx).discard(&["README.md".into()]))
        .unwrap();
    assert_eq!(repo.read("README.md"), "# Staged\n");
}

#[test]
fn rejects_paths_outside_the_repository() {
    let repo = TestRepo::with_commit();
    for path in ["../evil", "/etc/passwd", ".git/config", ""] {
        let err = repo
            .with(|ctx| StagingService::new(ctx).discard(&[path.into()]))
            .unwrap_err();
        assert_eq!(err.code(), ErrorCode::InvalidInput, "{path}");
    }
}
