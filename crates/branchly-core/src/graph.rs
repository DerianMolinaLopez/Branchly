//! Commit graph: lane layout and a per-repository cache.
//!
//! The layout runs once over the whole history in topological order. Lanes
//! are columns that "wait" for a commit: when a commit is processed, the
//! lanes waiting for it converge on its node, its first parent continues in
//! the node's column and every other parent either joins a lane that already
//! waits for it or opens a new lane to the right. Columns never shift, so
//! long-lived branches keep a stable position (and color) while scrolling.
//! Freed columns are reused by later branch tips.
//!
//! The result is O(commits × active lanes) in time and memory, and is
//! computed in Rust so the frontend only draws the rows it shows.

use std::collections::HashMap;

use git2::Oid;

use crate::domain::{
    CommitSummary, GraphEdge, GraphInfo, GraphRow, RefKind, RefLabel, SearchField, Signature,
    short_sha,
};
use crate::error::Result;
use crate::git::{CommitRecord, GitRepository};

/// Number of distinct lane colors in the UI palette.
pub const LANE_COLORS: u8 = 8;

/// Layout of one row: where its node sits and which edges enter it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RowLayout {
    pub column: u16,
    pub color: u8,
    edges_start: u32,
    edges_end: u32,
}

/// The computed layout of a whole graph.
#[derive(Debug, Default)]
pub struct Layout {
    rows: Vec<RowLayout>,
    edges: Vec<GraphEdge>,
    max_columns: u16,
}

impl Layout {
    pub fn len(&self) -> usize {
        self.rows.len()
    }

    pub fn is_empty(&self) -> bool {
        self.rows.is_empty()
    }

    pub fn max_columns(&self) -> u16 {
        self.max_columns
    }

    pub fn row(&self, index: usize) -> RowLayout {
        self.rows[index]
    }

    /// Edges entering row `index` from the row above.
    pub fn edges(&self, index: usize) -> &[GraphEdge] {
        let row = &self.rows[index];
        &self.edges[row.edges_start as usize..row.edges_end as usize]
    }
}

#[derive(Debug, Clone, Copy)]
struct Lane {
    /// Row of the commit this lane is waiting for.
    target: u32,
    color: u8,
    /// Column of the node the lane starts from, for its first segment.
    origin: Option<u16>,
}

/// Computes lanes for commits given in topological order.
///
/// `parents[i]` lists the rows of the parents of row `i`; parents not present
/// in the graph must be omitted. Parents always come after their children.
pub fn compute_layout(parents: &[Vec<u32>]) -> Layout {
    let mut lanes: Vec<Option<Lane>> = Vec::new();
    // Merge lines from the previous node into a lane that already existed.
    let mut joins: Vec<(u16, usize)> = Vec::new();
    let mut layout = Layout {
        rows: Vec::with_capacity(parents.len()),
        edges: Vec::with_capacity(parents.len() * 2),
        max_columns: 0,
    };

    for (row, row_parents) in parents.iter().enumerate() {
        let row = row as u32;
        let edges_start = layout.edges.len() as u32;

        let waiting = lanes
            .iter()
            .position(|lane| matches!(lane, Some(l) if l.target == row));
        let column = waiting.unwrap_or_else(|| free_slot(&mut lanes, 0));
        let color = lanes[column].map_or(color_for(column), |l| l.color);

        for (j, lane) in lanes.iter().enumerate() {
            let Some(lane) = lane else { continue };
            let to = if lane.target == row { column } else { j };
            layout.edges.push(GraphEdge {
                from: lane.origin.unwrap_or(j as u16),
                to: to as u16,
                color: lane.color,
            });
        }
        for (from, k) in joins.drain(..) {
            if let Some(lane) = lanes[k] {
                let to = if lane.target == row { column } else { k };
                layout.edges.push(GraphEdge {
                    from,
                    to: to as u16,
                    color: lane.color,
                });
            }
        }

        for lane in &mut lanes {
            match lane {
                Some(l) if l.target == row => *lane = None,
                Some(l) => l.origin = None,
                None => {}
            }
        }

        let mut valid = row_parents.iter().copied().filter(|&p| p > row);
        if let Some(first) = valid.next() {
            lanes[column] = Some(Lane {
                target: first,
                color,
                origin: None,
            });
        }
        for parent in valid {
            let existing = lanes
                .iter()
                .position(|lane| matches!(lane, Some(l) if l.target == parent));
            match existing {
                Some(k) => joins.push((column as u16, k)),
                None => {
                    let k = free_slot(&mut lanes, column + 1);
                    lanes[k] = Some(Lane {
                        target: parent,
                        color: color_for(k),
                        origin: Some(column as u16),
                    });
                }
            }
        }

        while matches!(lanes.last(), Some(None)) {
            lanes.pop();
        }
        layout.max_columns = layout
            .max_columns
            .max(lanes.len() as u16)
            .max(column as u16 + 1);
        layout.rows.push(RowLayout {
            column: column as u16,
            color,
            edges_start,
            edges_end: layout.edges.len() as u32,
        });
    }
    layout
}

fn color_for(column: usize) -> u8 {
    (column % LANE_COLORS as usize) as u8
}

/// Index of the first free lane at or after `from`, growing the vector.
fn free_slot(lanes: &mut Vec<Option<Lane>>, from: usize) -> usize {
    if let Some(offset) = lanes.iter().skip(from).position(Option::is_none) {
        return from + offset;
    }
    while lanes.len() < from {
        lanes.push(None);
    }
    lanes.push(None);
    lanes.len() - 1
}

/// The full graph of a repository, cached until a ref moves.
pub struct GraphCache {
    fingerprint: String,
    records: Vec<CommitRecord>,
    index: HashMap<Oid, u32>,
    layout: Layout,
    labels: HashMap<String, Vec<RefLabel>>,
    head: Option<String>,
}

impl GraphCache {
    pub fn build(repo: &dyn GitRepository, fingerprint: String) -> Result<Self> {
        let records = repo.walk_all()?;
        let index: HashMap<Oid, u32> = records
            .iter()
            .enumerate()
            .map(|(i, r)| (r.id, i as u32))
            .collect();
        let parents: Vec<Vec<u32>> = records
            .iter()
            .map(|r| {
                r.parents
                    .iter()
                    .filter_map(|p| index.get(p).copied())
                    .collect()
            })
            .collect();
        let layout = compute_layout(&parents);

        let mut labels: HashMap<String, Vec<RefLabel>> = HashMap::new();
        for (sha, label) in repo.ref_labels()? {
            labels.entry(sha).or_default().push(label);
        }
        for list in labels.values_mut() {
            list.sort_by_key(|l| (!l.is_head, label_rank(l.kind), l.name.clone()));
        }

        Ok(Self {
            fingerprint,
            records,
            index,
            layout,
            labels,
            head: repo.head()?.target,
        })
    }

    pub fn fingerprint(&self) -> &str {
        &self.fingerprint
    }

    pub fn len(&self) -> usize {
        self.records.len()
    }

    pub fn is_empty(&self) -> bool {
        self.records.is_empty()
    }

    pub fn info(&self) -> GraphInfo {
        GraphInfo {
            total: self.records.len() as u32,
            max_columns: self.layout.max_columns(),
            fingerprint: self.fingerprint.clone(),
            head_row: self.head.as_deref().and_then(|h| self.row_of(h)),
            head_id: self.head.clone(),
        }
    }

    /// Row index of a commit, if it is part of the graph.
    pub fn row_of(&self, sha: &str) -> Option<u32> {
        let oid = Oid::from_str(sha).ok()?;
        self.index.get(&oid).copied()
    }

    /// Rows `offset..offset + limit`, clamped to the graph size.
    pub fn rows(&self, offset: u32, limit: u32) -> Vec<GraphRow> {
        let start = (offset as usize).min(self.records.len());
        let end = start.saturating_add(limit as usize).min(self.records.len());
        (start..end).map(|i| self.row(i)).collect()
    }

    fn row(&self, i: usize) -> GraphRow {
        let record = &self.records[i];
        let layout = self.layout.row(i);
        let id = record.id.to_string();
        GraphRow {
            index: i as u32,
            refs: self.labels.get(&id).cloned().unwrap_or_default(),
            column: layout.column,
            color: layout.color,
            edges: self.layout.edges(i).to_vec(),
            is_merge: record.parents.len() > 1,
            commit: CommitSummary {
                short_id: short_sha(&id),
                summary: record.summary.to_string(),
                author: Signature {
                    name: record.author_name.to_string(),
                    email: record.author_email.to_string(),
                    timestamp: record.time,
                    offset_minutes: record.offset_minutes,
                },
                parents: record.parents.iter().map(Oid::to_string).collect(),
                id,
            },
        }
    }

    /// Rows whose commit matches `query`, in graph order.
    pub fn search(&self, query: &str, field: SearchField, limit: usize) -> Vec<u32> {
        let query = query.trim().to_lowercase();
        if query.is_empty() {
            return Vec::new();
        }
        let is_hex = query.chars().all(|c| c.is_ascii_hexdigit());
        let matches = |r: &CommitRecord| -> bool {
            let hash = || is_hex && r.id.to_string().starts_with(&query);
            let author = || {
                r.author_name.to_lowercase().contains(&query)
                    || r.author_email.to_lowercase().contains(&query)
            };
            let message = || r.message.to_lowercase().contains(&query);
            match field {
                SearchField::Hash => hash(),
                SearchField::Author => author(),
                SearchField::Message => message(),
                SearchField::All => hash() || message() || author(),
            }
        };
        self.records
            .iter()
            .enumerate()
            .filter(|(_, r)| matches(r))
            .map(|(i, _)| i as u32)
            .take(limit)
            .collect()
    }
}

fn label_rank(kind: RefKind) -> u8 {
    match kind {
        RefKind::Head => 0,
        RefKind::LocalBranch => 1,
        RefKind::RemoteBranch => 2,
        RefKind::Tag => 3,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn edge(from: u16, to: u16, color: u8) -> GraphEdge {
        GraphEdge { from, to, color }
    }

    #[test]
    fn linear_history_uses_one_lane() {
        // 0 -> 1 -> 2
        let layout = compute_layout(&[vec![1], vec![2], vec![]]);
        assert_eq!(layout.max_columns(), 1);
        for i in 0..3 {
            assert_eq!(layout.row(i).column, 0);
        }
        assert!(layout.edges(0).is_empty());
        assert_eq!(layout.edges(1), [edge(0, 0, 0)]);
        assert_eq!(layout.edges(2), [edge(0, 0, 0)]);
    }

    #[test]
    fn merge_opens_a_lane_to_the_right_and_converges() {
        // 0: merge(1, 2); 1: main -> 3; 2: feature -> 3; 3: root
        let layout = compute_layout(&[vec![1, 2], vec![3], vec![3], vec![]]);
        assert_eq!(layout.max_columns(), 2);
        assert_eq!(layout.row(0).column, 0);
        assert_eq!(layout.row(1).column, 0);
        assert_eq!(layout.row(2).column, 1);
        assert_eq!(layout.row(3).column, 0);
        // Row 1: main continues straight, the feature lane leaves the merge node.
        assert_eq!(layout.edges(1), [edge(0, 0, 0), edge(0, 1, 1)]);
        // Row 2: main passes by, feature reaches its node.
        assert_eq!(layout.edges(2), [edge(0, 0, 0), edge(1, 1, 1)]);
        // Row 3: both lanes converge on the root.
        assert_eq!(layout.edges(3), [edge(0, 0, 0), edge(1, 0, 1)]);
    }

    #[test]
    fn sibling_branch_tips_fork_from_a_common_parent() {
        // Two tips (0 and 1) sharing parent 2.
        let layout = compute_layout(&[vec![2], vec![2], vec![]]);
        assert_eq!(layout.row(0).column, 0);
        assert_eq!(layout.row(1).column, 1);
        assert_eq!(layout.row(2).column, 0);
        assert_eq!(layout.edges(2), [edge(0, 0, 0), edge(1, 0, 1)]);
        assert_eq!(layout.max_columns(), 2);
    }

    #[test]
    fn merge_into_an_existing_lane_joins_instead_of_opening_one() {
        // 0: tip of feature -> 2
        // 1: merge on main of (3, 2): 2 is already awaited by lane 0
        // 2: feature base -> 3
        // 3: root
        let layout = compute_layout(&[vec![2], vec![3, 2], vec![3], vec![]]);
        assert_eq!(layout.row(0).column, 0);
        assert_eq!(layout.row(1).column, 1);
        assert_eq!(layout.row(2).column, 0);
        // The merge line from (row 1, col 1) lands directly on node 2 in col 0.
        assert!(layout.edges(2).contains(&edge(1, 0, 0)));
        assert_eq!(layout.max_columns(), 2);
    }

    #[test]
    fn freed_columns_are_reused() {
        // 0 -> 2, 1 -> 2 (lane 1 freed at row 2), 3 is a new tip -> 4
        let layout = compute_layout(&[vec![2], vec![2], vec![4], vec![4], vec![]]);
        assert_eq!(layout.row(3).column, 1);
        assert_eq!(layout.max_columns(), 2);
    }

    #[test]
    fn handles_large_histories_quickly() {
        // 60k commits: a main line with a merge every 10 commits.
        let n = 60_000u32;
        let mut parents = Vec::with_capacity(n as usize);
        for i in 0..n {
            let mut p = Vec::new();
            if i + 2 < n {
                p.push(i + 2);
            }
            if i % 20 == 0 && i + 3 < n {
                p.push(i + 3);
            }
            parents.push(p);
        }
        let start = std::time::Instant::now();
        let layout = compute_layout(&parents);
        assert_eq!(layout.len(), n as usize);
        assert!(
            start.elapsed().as_secs_f64() < 2.0,
            "layout took {:?}",
            start.elapsed()
        );
    }

    #[test]
    fn ignores_parents_that_are_not_after_the_child() {
        let layout = compute_layout(&[vec![0], vec![]]);
        assert_eq!(layout.len(), 2);
        assert!(layout.edges(1).is_empty());
    }
}
