import { Channel } from '@tauri-apps/api/core';
import { commands, type Progress } from './bindings';
import { call, unwrap } from './client';

export const repositoriesApi = {
  open: (path: string) => unwrap(commands.openRepository(path)),
  init: (path: string) => unwrap(commands.initRepository(path)),
  clone: (url: string, dest: string, opId: string, onProgress: (p: Progress) => void) => {
    const channel = new Channel<Progress>();
    channel.onmessage = onProgress;
    return unwrap(commands.cloneRepository(url, dest, opId, channel));
  },
  suggestCloneFolder: (url: string) => call(commands.suggestCloneFolder(url)),
  close: (repoId: string) => call(commands.closeRepository(repoId)),
  info: (repoId: string) => unwrap(commands.getRepoInfo(repoId)),
  recent: () => unwrap(commands.listRecentRepos()),
  removeRecent: (path: string) => unwrap(commands.removeRecentRepo(path)),
  cancelOperation: (opId: string) => call(commands.cancelOperation(opId)),
  takeLaunchPath: () => call(commands.takeLaunchPath()),
};
