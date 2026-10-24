use serde::{Deserialize, Serialize};
use specta::Type;

use super::{CommitSummary, RefLabel, Sha};

/// A line segment of the commit graph.
///
/// Every edge belongs to the row it ends in: it starts at the vertical centre
/// of the previous row in column `from` and ends at the centre of its own row
/// in column `to`. A row therefore owns all the lines entering it from above,
/// which keeps pagination trivial: drawing rows `a..b` only needs edges of
/// those rows (plus row `b` for the half-segment leaving the last one).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub from: u16,
    pub to: u16,
    pub color: u8,
}

/// One row of the commit graph: a commit plus how to draw it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GraphRow {
    pub index: u32,
    pub commit: CommitSummary,
    pub refs: Vec<RefLabel>,
    pub column: u16,
    pub color: u8,
    pub edges: Vec<GraphEdge>,
    pub is_merge: bool,
}

/// Metadata about the whole graph, used to size the virtual list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GraphInfo {
    pub total: u32,
    pub max_columns: u16,
    /// Changes whenever any ref moves; part of the frontend cache key.
    pub fingerprint: String,
    /// Row of the commit HEAD points to, if it is part of the graph.
    pub head_row: Option<u32>,
    pub head_id: Option<Sha>,
}
