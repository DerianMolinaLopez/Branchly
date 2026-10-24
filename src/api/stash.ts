import { commands } from './bindings';
import { unwrap } from './client';

export const stashApi = {
  list: (repoId: string) => unwrap(commands.listStashes(repoId)),
  save: (repoId: string, message: string | null, includeUntracked: boolean) =>
    unwrap(commands.stashSave(repoId, message, includeUntracked)),
  apply: (repoId: string, index: number) => unwrap(commands.stashApply(repoId, index)),
  pop: (repoId: string, index: number) => unwrap(commands.stashPop(repoId, index)),
  drop: (repoId: string, index: number) => unwrap(commands.stashDrop(repoId, index)),
};
