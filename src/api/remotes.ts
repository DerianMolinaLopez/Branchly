import { Channel } from '@tauri-apps/api/core';
import { commands, type Progress, type PushOptions } from './bindings';
import { unwrap } from './client';

type OnProgress = (progress: Progress) => void;

function channel(onProgress: OnProgress): Channel<Progress> {
  const ch = new Channel<Progress>();
  ch.onmessage = onProgress;
  return ch;
}

export const remotesApi = {
  list: (repoId: string) => unwrap(commands.listRemotes(repoId)),
  fetch: (repoId: string, opId: string, onProgress: OnProgress) =>
    unwrap(commands.fetch(repoId, opId, channel(onProgress))),
  pull: (repoId: string, opId: string, onProgress: OnProgress) =>
    unwrap(commands.pull(repoId, opId, channel(onProgress))),
  push: (repoId: string, options: PushOptions, opId: string, onProgress: OnProgress) =>
    unwrap(commands.push(repoId, options, opId, channel(onProgress))),
  deleteBranch: (repoId: string, name: string, opId: string, onProgress: OnProgress) =>
    unwrap(commands.deleteRemoteBranch(repoId, name, opId, channel(onProgress))),
  pushTag: (repoId: string, name: string, opId: string, onProgress: OnProgress) =>
    unwrap(commands.pushTag(repoId, name, null, opId, channel(onProgress))),
  deleteTag: (repoId: string, name: string, opId: string, onProgress: OnProgress) =>
    unwrap(commands.deleteRemoteTag(repoId, name, null, opId, channel(onProgress))),
};
