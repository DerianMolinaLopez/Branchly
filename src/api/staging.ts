import { commands, type ConflictSide, type HunkRef } from './bindings';
import { unwrap } from './client';

export const stagingApi = {
  status: (repoId: string) => unwrap(commands.getStatus(repoId)),
  diff: (repoId: string, path: string, staged: boolean) =>
    unwrap(commands.getWorkingDiff(repoId, path, staged)),
  stage: (repoId: string, paths: string[]) => unwrap(commands.stageFiles(repoId, paths)),
  unstage: (repoId: string, paths: string[]) => unwrap(commands.unstageFiles(repoId, paths)),
  stageAll: (repoId: string) => unwrap(commands.stageAll(repoId)),
  unstageAll: (repoId: string) => unwrap(commands.unstageAll(repoId)),
  discard: (repoId: string, paths: string[]) => unwrap(commands.discardFiles(repoId, paths)),
  discardAll: (repoId: string) => unwrap(commands.discardAll(repoId)),
  stageHunk: (repoId: string, path: string, hunk: HunkRef) =>
    unwrap(commands.stageHunk(repoId, path, hunk)),
  unstageHunk: (repoId: string, path: string, hunk: HunkRef) =>
    unwrap(commands.unstageHunk(repoId, path, hunk)),
  discardHunk: (repoId: string, path: string, hunk: HunkRef) =>
    unwrap(commands.discardHunk(repoId, path, hunk)),
  resolveConflict: (repoId: string, path: string, side: ConflictSide) =>
    unwrap(commands.resolveConflict(repoId, path, side)),
  markResolved: (repoId: string, path: string) => unwrap(commands.markResolved(repoId, path)),
  abortOperation: (repoId: string) => unwrap(commands.abortOperation(repoId)),
  continueOperation: (repoId: string) => unwrap(commands.continueOperation(repoId)),
};
