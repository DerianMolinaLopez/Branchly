import { create } from 'zustand';
import type { UndoHandle } from '@/api';

interface UndoState {
  last: Record<string, UndoHandle | undefined>;
  set: (repoId: string, handle: UndoHandle | null) => void;
}

/** The last undoable operation of each repository (for Ctrl+Z and the toolbar). */
export const useUndoStore = create<UndoState>()((set) => ({
  last: {},
  set: (repoId, handle) => {
    set((state) => ({ last: { ...state.last, [repoId]: handle ?? undefined } }));
  },
}));
