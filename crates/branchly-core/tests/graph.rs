mod common;

use std::collections::HashSet;

use branchly_core::ErrorCode;
use branchly_core::domain::{RefKind, SearchField};
use branchly_core::services::GraphService;
use common::TestRepo;

/// main: A - B - - - M
///            \     /
/// feature:    C - D
fn branchy_repo() -> (TestRepo, [String; 5]) {
    let repo = TestRepo::new();
    repo.write("a.txt", "a\n");
    let a = repo.commit_all("A: initial");
    repo.write("b.txt", "b\n");
    let b = repo.commit_all("B: main work");
    repo.git(&["checkout", "-q", "-b", "feature"]);
    repo.write("c.txt", "c\n");
    let c = repo.commit_all("C: feature start");
    repo.write("d.txt", "d\n");
    let d = repo.commit_all("D: feature end");
    repo.git(&["checkout", "-q", "main"]);
    repo.git(&["merge", "-q", "--no-ff", "--no-edit", "feature"]);
    let m = repo.head();
    repo.git(&["tag", "v1", &b]);
    (repo, [a, b, c, d, m])
}

#[test]
fn builds_rows_in_topological_order_with_lanes() {
    let (repo, [a, b, c, d, m]) = branchy_repo();
    let info = repo.with(|ctx| GraphService::new(ctx).info()).unwrap();
    assert_eq!(info.total, 5);
    assert_eq!(info.max_columns, 2);
    assert_eq!(info.head_row, Some(0));
    assert_eq!(info.head_id.as_deref(), Some(m.as_str()));

    let rows = repo
        .with(|ctx| GraphService::new(ctx).rows(&info.fingerprint, 0, 100))
        .unwrap();
    let ids: Vec<_> = rows.iter().map(|r| r.commit.id.clone()).collect();
    assert_eq!(ids, [m.clone(), d, c, b.clone(), a]);

    // The merge sits on the main lane and opens a second lane for feature.
    assert!(rows[0].is_merge);
    assert_eq!(rows[0].column, 0);
    assert_eq!(rows[1].column, 1);
    assert_eq!(rows[2].column, 1);
    assert_eq!(rows[3].column, 0);
    assert!(rows[0].edges.is_empty());
    // The feature lane converges back onto B.
    assert!(rows[3].edges.iter().any(|e| e.from == 1 && e.to == 0));

    // Every edge stays within the reported width.
    for row in &rows {
        for edge in &row.edges {
            assert!(edge.from < info.max_columns && edge.to < info.max_columns);
        }
    }

    let labels: HashSet<_> = rows[0]
        .refs
        .iter()
        .map(|r| (r.name.as_str(), r.kind))
        .collect();
    assert!(labels.contains(&("main", RefKind::LocalBranch)));
    assert!(rows[0].refs[0].is_head);
    assert_eq!(rows[1].refs[0].name, "feature");
    assert_eq!(rows[3].refs[0].kind, RefKind::Tag);
    assert_eq!(rows[3].commit.id, b);
}

#[test]
fn pages_are_slices_of_the_same_layout() {
    let (repo, _) = branchy_repo();
    let info = repo.with(|ctx| GraphService::new(ctx).info()).unwrap();
    let all = repo
        .with(|ctx| GraphService::new(ctx).rows(&info.fingerprint, 0, 5))
        .unwrap();
    let page = repo
        .with(|ctx| GraphService::new(ctx).rows(&info.fingerprint, 2, 2))
        .unwrap();
    assert_eq!(page, all[2..4]);
    let past_end = repo
        .with(|ctx| GraphService::new(ctx).rows(&info.fingerprint, 10, 5))
        .unwrap();
    assert!(past_end.is_empty());
}

#[test]
fn stale_fingerprints_are_rejected_after_refs_move() {
    let (repo, _) = branchy_repo();
    let info = repo.with(|ctx| GraphService::new(ctx).info()).unwrap();
    repo.write("e.txt", "e\n");
    repo.commit_all("E");
    let err = repo
        .with(|ctx| GraphService::new(ctx).rows(&info.fingerprint, 0, 10))
        .unwrap_err();
    assert_eq!(err.code(), ErrorCode::StaleGraph);

    let fresh = repo.with(|ctx| GraphService::new(ctx).info()).unwrap();
    assert_ne!(fresh.fingerprint, info.fingerprint);
    assert_eq!(fresh.total, 6);
}

#[test]
fn search_by_message_author_and_hash() {
    let (repo, [_, b, c, d, _]) = branchy_repo();
    let search = |q: &str, f| {
        repo.with(|ctx| GraphService::new(ctx).search(q, f))
            .unwrap()
    };
    assert_eq!(search("feature", SearchField::Message), [0, 1, 2]);
    assert_eq!(search("FEATURE END", SearchField::Message), [1]);
    assert_eq!(search("test user", SearchField::Author).len(), 5);
    assert_eq!(search("example.com", SearchField::Author).len(), 5);
    assert_eq!(search(&c[..8], SearchField::Hash), [2]);
    assert_eq!(search(&d[..10], SearchField::All), [1]);
    assert!(search("", SearchField::All).is_empty());

    let row = repo
        .with(|ctx| GraphService::new(ctx).locate(&b[..7]))
        .unwrap();
    assert_eq!(row, Some(3));
}

#[test]
fn empty_repositories_have_an_empty_graph() {
    let repo = TestRepo::new();
    let info = repo.with(|ctx| GraphService::new(ctx).info()).unwrap();
    assert_eq!(info.total, 0);
    assert_eq!(info.head_row, None);
}

#[test]
fn large_histories_build_quickly() {
    let repo = TestRepo::new();
    // fast-import keeps the test fast while producing a realistic history.
    let mut script = String::new();
    let n = 5_000;
    for i in 1..=n {
        script.push_str(&format!(
            "commit refs/heads/main\nmark :{i}\ncommitter T <t@e.com> {} +0000\ndata 8\nc{:06}\n",
            1_600_000_000 + i,
            i
        ));
        if i > 1 {
            script.push_str(&format!("from :{}\n", i - 1));
        }
        script.push_str(&format!(
            "M 644 inline f.txt\ndata {}\n{}\n\n",
            i.to_string().len(),
            i
        ));
    }
    let mut child = std::process::Command::new("git")
        .current_dir(repo.path())
        .args(["fast-import", "--quiet"])
        .stdin(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    use std::io::Write;
    child
        .stdin
        .take()
        .unwrap()
        .write_all(script.as_bytes())
        .unwrap();
    assert!(child.wait().unwrap().success());

    let start = std::time::Instant::now();
    let info = repo.with(|ctx| GraphService::new(ctx).info()).unwrap();
    assert_eq!(info.total, n);
    let rows = repo
        .with(|ctx| GraphService::new(ctx).rows(&info.fingerprint, 4_900, 200))
        .unwrap();
    assert_eq!(rows.len(), 100);
    assert!(start.elapsed().as_secs() < 5, "took {:?}", start.elapsed());
}
