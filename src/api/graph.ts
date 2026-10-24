import { commands, type SearchField } from './bindings';
import { unwrap } from './client';

export const graphApi = {
  info: (repoId: string) => unwrap(commands.getGraphInfo(repoId)),
  rows: (repoId: string, fingerprint: string, offset: number, limit: number) =>
    unwrap(commands.getGraphRows(repoId, fingerprint, offset, limit)),
  search: (repoId: string, query: string, field: SearchField) =>
    unwrap(commands.searchCommits(repoId, query, field)),
  locate: (repoId: string, sha: string) => unwrap(commands.locateCommit(repoId, sha)),
};
