import { create } from 'zustand';

export interface CommitDraft {
  summary: string;
  description: string;
  amend: boolean;
}

interface DraftsState {
  drafts: Record<string, CommitDraft>;
  update: (repoId: string, values: Partial<CommitDraft>) => void;
  clear: (repoId: string) => void;
}

export const EMPTY_DRAFT: CommitDraft = { summary: '', description: '', amend: false };

/** Commit messages being written, kept per repository while switching tabs. */
export const useDrafts = create<DraftsState>()((set) => ({
  drafts: {},
  update: (repoId, values) => {
    set((state) => ({
      drafts: { ...state.drafts, [repoId]: { ...(state.drafts[repoId] ?? EMPTY_DRAFT), ...values } },
    }));
  },
  clear: (repoId) => {
    set((state) => ({ drafts: { ...state.drafts, [repoId]: EMPTY_DRAFT } }));
  },
}));
