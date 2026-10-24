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

/** The main window, or null when running outside Tauri (tests, browser). */
function currentWindow() {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

/** Controls of the frameless main window. */
export const windowApi = {
  minimize: () => currentWindow()?.minimize(),
  toggleMaximize: () => currentWindow()?.toggleMaximize(),
  close: () => currentWindow()?.close(),
  isMaximized: async () => (await currentWindow()?.isMaximized()) ?? false,
  onResized: async (handler: () => void): Promise<() => void> =>
    (await currentWindow()?.onResized(handler)) ?? (() => undefined),
};
