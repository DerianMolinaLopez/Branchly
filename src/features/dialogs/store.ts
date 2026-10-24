import { create } from 'zustand';

/** Dialogs that can be opened from anywhere (menus, palette, shortcuts). */
export type DialogRequest =
  | { kind: 'clone' }
  | { kind: 'init' }
  | { kind: 'settings' }
  | { kind: 'createBranch'; repoId: string; start?: { sha: string; label: string } }
  | { kind: 'renameBranch'; repoId: string; name: string }
  | { kind: 'createTag'; repoId: string; sha: string; label: string }
  | { kind: 'stash'; repoId: string }
  | { kind: 'merge'; repoId: string; source: string; target: string };

interface DialogState {
  current: DialogRequest | null;
  open: (request: DialogRequest) => void;
  close: () => void;
}

export const useDialogs = create<DialogState>()((set) => ({
  current: null,
  open: (current) => {
    set({ current });
  },
  close: () => {
    set({ current: null });
  },
}));

export const openDialog = (request: DialogRequest) => {
  useDialogs.getState().open(request);
};
