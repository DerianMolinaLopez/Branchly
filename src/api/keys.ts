import type { SearchField } from './bindings';

/**
 * TanStack Query keys. Everything about a repository lives under
 * `['repo', id]` so a mutation can refresh the whole repository at once,
 * while file-system events refresh only the affected branches of the tree.
 */
export const keys = {
  recent: () => ['recent'] as const,
  gitVersion: () => ['git-version'] as const,
  repo: (id: string) => ['repo', id] as const,
  info: (id: string) => ['repo', id, 'info'] as const,
  graph: (id: string) => ['repo', id, 'graph'] as const,
  graphInfo: (id: string) => ['repo', id, 'graph', 'info'] as const,
  graphRows: (id: string, fingerprint: string, chunk: number) =>
    ['repo', id, 'graph', 'rows', fingerprint, chunk] as const,
  search: (id: string, field: SearchField, query: string) =>
    ['repo', id, 'graph', 'search', field, query] as const,
  status: (id: string) => ['repo', id, 'status'] as const,
  workingDiff: (id: string, path: string, staged: boolean) =>
    ['repo', id, 'status', 'diff', path, staged] as const,
  refs: (id: string) => ['repo', id, 'refs'] as const,
  branches: (id: string) => ['repo', id, 'refs', 'branches'] as const,
  tags: (id: string) => ['repo', id, 'refs', 'tags'] as const,
  stashes: (id: string) => ['repo', id, 'refs', 'stashes'] as const,
  remotes: (id: string) => ['repo', id, 'refs', 'remotes'] as const,
  headMessage: (id: string) => ['repo', id, 'refs', 'head-message'] as const,
  commit: (id: string, sha: string) => ['repo', id, 'commit', sha] as const,
  commitDiff: (id: string, sha: string, path: string) =>
    ['repo', id, 'commit', sha, 'diff', path] as const,
  history: (id: string, path: string) => ['repo', id, 'history', path] as const,
  blame: (id: string, path: string) => ['repo', id, 'blame', path] as const,
};
