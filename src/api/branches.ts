import { commands, type MergeOptions } from './bindings';
import { unwrap } from './client';

export const branchesApi = {
  list: (repoId: string) => unwrap(commands.listBranches(repoId)),
  create: (repoId: string, name: string, start: string | null, checkout: boolean) =>
    unwrap(commands.createBranch(repoId, name, start, checkout)),
  checkout: (repoId: string, name: string) => unwrap(commands.checkoutBranch(repoId, name)),
  checkoutRemote: (repoId: string, name: string) =>
    unwrap(commands.checkoutRemoteBranch(repoId, name)),
  checkoutCommit: (repoId: string, sha: string) => unwrap(commands.checkoutCommit(repoId, sha)),
  rename: (repoId: string, from: string, to: string) =>
    unwrap(commands.renameBranch(repoId, from, to)),
  remove: (repoId: string, name: string, force: boolean) =>
    unwrap(commands.deleteBranch(repoId, name, force)),
  merge: (repoId: string, source: string, options: MergeOptions) =>
    unwrap(commands.mergeBranch(repoId, source, options)),
};
