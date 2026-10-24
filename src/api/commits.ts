import { commands, type ResetMode } from './bindings';
import { unwrap } from './client';

export const commitsApi = {
  detail: (repoId: string, sha: string) => unwrap(commands.getCommitDetail(repoId, sha)),
  fileDiff: (repoId: string, sha: string, path: string, oldPath: string | null) =>
    unwrap(commands.getCommitFileDiff(repoId, sha, path, oldPath)),
  fileHistory: (repoId: string, path: string) => unwrap(commands.getFileHistory(repoId, path)),
  blame: (repoId: string, path: string) => unwrap(commands.getBlame(repoId, path)),
  headMessage: (repoId: string) => unwrap(commands.getHeadMessage(repoId)),
  commit: (repoId: string, message: string, amend: boolean) =>
    unwrap(commands.createCommit(repoId, message, amend)),
  reset: (repoId: string, sha: string, mode: ResetMode) =>
    unwrap(commands.resetTo(repoId, sha, mode)),
  undo: (repoId: string, handle: number) => unwrap(commands.undo(repoId, handle)),
};
