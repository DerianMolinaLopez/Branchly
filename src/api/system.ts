import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { commands } from './bindings';
import { unwrap } from './client';

export const systemApi = {
  gitVersion: () => unwrap(commands.getGitVersion()),
  openInEditor: (repoId: string, path: string) => unwrap(commands.openInEditor(repoId, path)),
  reveal: (repoId: string, path: string | null) =>
    unwrap(commands.revealInFileManager(repoId, path)),
  /** Native folder picker; resolves to null when cancelled. */
  pickFolder: async (title: string): Promise<string | null> => {
    const selected = await open({ directory: true, multiple: false, title });
    return typeof selected === 'string' ? selected : null;
  },
};

/** Controls of the frameless main window. */
export const windowApi = {
  minimize: () => getCurrentWindow().minimize(),
  toggleMaximize: () => getCurrentWindow().toggleMaximize(),
  close: () => getCurrentWindow().close(),
  isMaximized: () => getCurrentWindow().isMaximized(),
  onResized: (handler: () => void) => getCurrentWindow().onResized(handler),
};
