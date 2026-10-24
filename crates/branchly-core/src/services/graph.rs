use super::Context;
use crate::domain::{GraphInfo, GraphRow, SearchField};
use crate::error::{Error, Result};

/// Maximum number of rows returned by a single page request.
pub const MAX_PAGE: u32 = 2_000;
/// Maximum number of search hits returned.
pub const MAX_SEARCH_RESULTS: usize = 5_000;

pub struct GraphService<'a>(Context<'a>);

impl<'a> GraphService<'a> {
    pub fn new(ctx: Context<'a>) -> Self {
        Self(ctx)
    }

    pub fn info(&self) -> Result<GraphInfo> {
        Ok(self.0.session.graph(self.0.repo)?.info())
    }

    /// Rows of the graph, provided the caller's view is still current.
    ///
    /// `fingerprint` is the value from [`GraphService::info`]; if refs moved
    /// in between, the request fails with `StaleGraph` so the caller refreshes
    /// instead of mixing rows from two different layouts.
    pub fn rows(&self, fingerprint: &str, offset: u32, limit: u32) -> Result<Vec<GraphRow>> {
        if limit == 0 || limit > MAX_PAGE {
            return Err(Error::invalid(format!(
                "El tamaño de página debe estar entre 1 y {MAX_PAGE}"
            )));
        }
        let graph = self.0.session.graph(self.0.repo)?;
        if graph.fingerprint() != fingerprint {
            return Err(Error::StaleGraph);
        }
        Ok(graph.rows(offset, limit))
    }

    pub fn search(&self, query: &str, field: SearchField) -> Result<Vec<u32>> {
        let graph = self.0.session.graph(self.0.repo)?;
        Ok(graph.search(query, field, MAX_SEARCH_RESULTS))
    }

    /// Row index of a commit (e.g. to jump to a parent).
    pub fn locate(&self, sha: &str) -> Result<Option<u32>> {
        super::validate_sha(sha)?;
        let graph = self.0.session.graph(self.0.repo)?;
        if let Some(row) = graph.row_of(sha) {
            return Ok(Some(row));
        }
        // Abbreviated ids: resolve them first.
        match self.0.repo.resolve_commit(sha) {
            Ok(full) => Ok(graph.row_of(&full)),
            Err(Error::NotFound(_)) => Ok(None),
            Err(err) => Err(err),
        }
    }
}
