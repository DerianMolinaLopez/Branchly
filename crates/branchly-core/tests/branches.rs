mod common;

use branchly_core::ErrorCode;
use branchly_core::domain::{ConflictSide, MergeOptions, MergeOutcome, RepoState};
use branchly_core::git::GitRepository;
use branchly_core::services::{BranchService, ConflictService, StagingService, UndoService};
use common::TestRepo;

#[test]
fn create_checkout_rename_and_list_branches() {
    let repo = TestRepo::with_commit();
    let created = repo
        .with(|ctx| BranchService::new(ctx).create("feature/login", None, false))
        .unwrap();
    assert_eq!(created.value.name, "feature/login");
    assert_eq!(created.value.target, repo.head());
    assert!(!created.value.is_head);

    repo.with(|ctx| BranchService::new(ctx).checkout("feature/login"))
        .unwrap();
    assert_eq!(
        repo.repo().head().unwrap().branch.as_deref(),
        Some("feature/login")
    );

    repo.with(|ctx| BranchService::new(ctx).rename("feature/login", "feature/auth"))
        .unwrap();
    let names: Vec<_> = repo
        .with(|ctx| BranchService::new(ctx).list())
        .unwrap()
        .into_iter()
        .map(|b| (b.name, b.is_head))
        .collect();
    assert_eq!(
        names,
        [("feature/auth".into(), true), ("main".into(), false)]
    );
}

#[test]
fn create_and_checkout_can_be_undone_in_one_step() {
    let repo = TestRepo::with_commit();
    let created = repo
        .with(|ctx| BranchService::new(ctx).create("topic", None, true))
        .unwrap();
    assert!(created.value.is_head);
    repo.with(|ctx| UndoService::new(ctx).undo(created.undo.unwrap().id))
        .unwrap();
    let head = repo.repo().head().unwrap();
    assert_eq!(head.branch.as_deref(), Some("main"));
    assert!(
        repo.repo()
            .reference_target("refs/heads/topic")
            .unwrap()
            .is_none()
    );
}

#[test]
fn invalid_and_duplicate_branch_names_are_rejected() {
    let repo = TestRepo::with_commit();
    for name in ["bad name", "-x", "a..b", "trailing/"] {
        let err = repo
            .with(|ctx| BranchService::new(ctx).create(name, None, false))
            .unwrap_err();
        assert_eq!(err.code(), ErrorCode::InvalidInput, "{name}");
    }
    let err = repo
        .with(|ctx| BranchService::new(ctx).create("main", None, false))
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::AlreadyExists);
}

#[test]
fn checkout_refuses_to_overwrite_local_changes() {
    let repo = TestRepo::with_commit();
    repo.git(&["checkout", "-q", "-b", "other"]);
    repo.write("README.md", "# Other\n");
    repo.commit_all("Change on other");
    repo.git(&["checkout", "-q", "main"]);
    repo.write("README.md", "# Local edit\n");

    let err = repo
        .with(|ctx| BranchService::new(ctx).checkout("other"))
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::WouldOverwriteChanges);
    assert_eq!(repo.read("README.md"), "# Local edit\n");
    assert_eq!(repo.repo().head().unwrap().branch.as_deref(), Some("main"));
}

#[test]
fn checkout_keeps_unrelated_local_changes() {
    let repo = TestRepo::with_commit();
    repo.git(&["branch", "other"]);
    repo.write("notes.txt", "wip\n");
    repo.with(|ctx| BranchService::new(ctx).checkout("other"))
        .unwrap();
    assert_eq!(repo.read("notes.txt"), "wip\n");
}

#[test]
fn checkout_commit_detaches_head_and_undo_returns() {
    let repo = TestRepo::with_commit();
    let first = repo.head();
    repo.write("a.txt", "a\n");
    repo.commit_all("Second");
    let result = repo
        .with(|ctx| BranchService::new(ctx).checkout_commit(&first))
        .unwrap();
    let head = repo.repo().head().unwrap();
    assert!(head.detached);
    assert_eq!(head.target.as_deref(), Some(first.as_str()));

    repo.with(|ctx| UndoService::new(ctx).undo(result.undo.unwrap().id))
        .unwrap();
    assert_eq!(repo.repo().head().unwrap().branch.as_deref(), Some("main"));
}

#[test]
fn deleting_requires_merged_or_force_and_can_be_undone() {
    let repo = TestRepo::with_commit();
    repo.git(&["checkout", "-q", "-b", "wip"]);
    repo.write("wip.txt", "wip\n");
    let wip_tip = repo.commit_all("WIP");
    repo.git(&["checkout", "-q", "main"]);

    let err = repo
        .with(|ctx| BranchService::new(ctx).delete("main", true))
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::UnsafeOperation);

    let err = repo
        .with(|ctx| BranchService::new(ctx).delete("wip", false))
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::BranchNotMerged);

    let deleted = repo
        .with(|ctx| BranchService::new(ctx).delete("wip", true))
        .unwrap();
    assert!(
        repo.repo()
            .reference_target("refs/heads/wip")
            .unwrap()
            .is_none()
    );

    repo.with(|ctx| UndoService::new(ctx).undo(deleted.undo.unwrap().id))
        .unwrap();
    assert_eq!(
        repo.repo()
            .reference_target("refs/heads/wip")
            .unwrap()
            .as_deref(),
        Some(wip_tip.as_str())
    );

    // A merged branch is deleted without force.
    repo.git(&["branch", "merged"]);
    repo.with(|ctx| BranchService::new(ctx).delete("merged", false))
        .unwrap();
}

#[test]
fn fast_forward_merge_and_undo() {
    let repo = TestRepo::with_commit();
    let base = repo.head();
    repo.git(&["checkout", "-q", "-b", "feature"]);
    repo.write("f.txt", "f\n");
    let tip = repo.commit_all("Feature work");
    repo.git(&["checkout", "-q", "main"]);

    let merged = repo
        .with(|ctx| BranchService::new(ctx).merge("feature", MergeOptions::default()))
        .unwrap();
    assert_eq!(
        merged.value,
        MergeOutcome::FastForward { head: tip.clone() }
    );
    assert_eq!(repo.head(), tip);

    repo.with(|ctx| UndoService::new(ctx).undo(merged.undo.unwrap().id))
        .unwrap();
    assert_eq!(repo.head(), base);
    assert!(!repo.file("f.txt").exists());
}

#[test]
fn no_ff_merge_creates_a_merge_commit() {
    let repo = TestRepo::with_commit();
    repo.git(&["checkout", "-q", "-b", "feature"]);
    repo.write("f.txt", "f\n");
    repo.commit_all("Feature work");
    repo.git(&["checkout", "-q", "main"]);

    let merged = repo
        .with(|ctx| BranchService::new(ctx).merge("feature", MergeOptions { no_ff: true }))
        .unwrap();
    let MergeOutcome::Merged { commit } = merged.value else {
        panic!("expected a merge commit, got {:?}", merged.value);
    };
    assert_eq!(commit.parents.len(), 2);
    assert_eq!(commit.summary, "Merge branch 'feature'");

    let again = repo
        .with(|ctx| BranchService::new(ctx).merge("feature", MergeOptions::default()))
        .unwrap();
    assert_eq!(again.value, MergeOutcome::UpToDate);
    assert!(again.undo.is_none());
}

/// `main` and `feature` both edit the first line of README.md.
fn conflicting_repo() -> TestRepo {
    let repo = TestRepo::with_commit();
    repo.git(&["checkout", "-q", "-b", "feature"]);
    repo.write("README.md", "# Theirs\n");
    repo.write("feature-only.txt", "f\n");
    repo.commit_all("Feature edit");
    repo.git(&["checkout", "-q", "main"]);
    repo.write("README.md", "# Ours\n");
    repo.commit_all("Main edit");
    repo
}

#[test]
fn merge_with_conflicts_reports_files_and_can_be_resolved() {
    let repo = conflicting_repo();
    let merged = repo
        .with(|ctx| BranchService::new(ctx).merge("feature", MergeOptions::default()))
        .unwrap();
    let MergeOutcome::Conflicts { files } = merged.value else {
        panic!("expected conflicts");
    };
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].path, "README.md");
    assert!(files[0].has_ours && files[0].has_theirs);
    assert!(merged.undo.is_none());

    let status = repo.with(|ctx| StagingService::new(ctx).status()).unwrap();
    assert_eq!(status.state, RepoState::Merging);
    assert_eq!(status.conflicted.len(), 1);
    assert!(repo.read("README.md").contains("<<<<<<<"));

    // Continuing with unresolved conflicts is refused.
    let err = repo
        .with(|ctx| ConflictService::new(ctx).continue_operation())
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::UnresolvedConflicts);

    repo.with(|ctx| ConflictService::new(ctx).resolve("README.md", ConflictSide::Theirs))
        .unwrap();
    assert_eq!(repo.read("README.md"), "# Theirs\n");
    repo.with(|ctx| ConflictService::new(ctx).continue_operation())
        .unwrap();

    let status = repo.with(|ctx| StagingService::new(ctx).status()).unwrap();
    assert_eq!(status.state, RepoState::Clean);
    assert!(status.is_clean());
    assert_eq!(repo.git(&["rev-list", "--count", "--merges", "HEAD"]), "1");
}

#[test]
fn resolving_with_ours_and_manual_resolution() {
    let repo = conflicting_repo();
    repo.with(|ctx| BranchService::new(ctx).merge("feature", MergeOptions::default()))
        .unwrap();
    repo.with(|ctx| ConflictService::new(ctx).resolve("README.md", ConflictSide::Ours))
        .unwrap();
    assert_eq!(repo.read("README.md"), "# Ours\n");
    repo.with(|ctx| ConflictService::new(ctx).abort()).unwrap();

    repo.with(|ctx| BranchService::new(ctx).merge("feature", MergeOptions::default()))
        .unwrap();
    repo.write("README.md", "# Both\n");
    repo.with(|ctx| ConflictService::new(ctx).mark_resolved("README.md"))
        .unwrap();
    let status = repo.with(|ctx| StagingService::new(ctx).status()).unwrap();
    assert!(status.conflicted.is_empty());
}

#[test]
fn aborting_a_merge_restores_the_previous_state() {
    let repo = conflicting_repo();
    let before = repo.head();
    repo.with(|ctx| BranchService::new(ctx).merge("feature", MergeOptions::default()))
        .unwrap();
    repo.with(|ctx| ConflictService::new(ctx).abort()).unwrap();
    assert_eq!(repo.head(), before);
    assert_eq!(repo.read("README.md"), "# Ours\n");
    let status = repo.with(|ctx| StagingService::new(ctx).status()).unwrap();
    assert_eq!(status.state, RepoState::Clean);
    assert!(status.is_clean());

    let err = repo
        .with(|ctx| ConflictService::new(ctx).abort())
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::InvalidInput);
}

#[test]
fn merge_requires_a_branch_and_refuses_dirty_overwrites() {
    let repo = conflicting_repo();
    repo.write("feature-only.txt", "local untracked\n");
    let err = repo
        .with(|ctx| BranchService::new(ctx).merge("feature", MergeOptions::default()))
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::WouldOverwriteChanges);

    let err = repo
        .with(|ctx| BranchService::new(ctx).merge("nope", MergeOptions::default()))
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::NotFound);
}
