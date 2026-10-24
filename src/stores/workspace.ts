import { create } from 'zustand';
import type { RepoInfo } from '@/api';

/** What the center pane shows. */
export type CenterView =
  | { kind: 'graph' }
  | { kind: 'diff'; source: DiffSource }
  | { kind: 'history'; path: string }
  | { kind: 'blame'; path: string };

export type DiffSource =
  | { type: 'commit'; sha: string; path: string; oldPath: string | null }
  | { type: 'working'; path: string; staged: boolean };

/** What the right panel shows. */
export type Selection = { kind: 'wip' } | { kind: 'commit'; sha: string };

export interface RepoTab {
  id: string;
  name: string;
  path: string;
}

interface RepoUi {
  selection: Selection | null;
  center: CenterView;
  /**
   * Ask the graph to scroll to a row (and select it); `nonce` makes repeated
   * requests for the same row distinct.
   */
  scrollRequest: { row: number; select: boolean; nonce: number } | null;
}

interface WorkspaceState {
  tabs: RepoTab[];
  /** `null` shows the home screen. */
  activeId: string | null;
  ui: Record<string, RepoUi>;
  openTab: (info: RepoInfo) => void;
  closeTab: (id: string) => void;
  activate: (id: string | null) => void;
  cycleTab: (direction: 1 | -1) => void;
  select: (id: string, selection: Selection | null) => void;
  setCenter: (id: string, center: CenterView) => void;
  scrollToRow: (id: string, row: number, select?: boolean) => void;
}

const defaultUi = (): RepoUi => ({ selection: null, center: { kind: 'graph' }, scrollRequest: null });

export const useWorkspace = create<WorkspaceState>()((set, get) => ({
  tabs: [],
  activeId: null,
  ui: {},
  openTab: (info) => {
    set((state) => {
      const exists = state.tabs.some((t) => t.id === info.id);
      return {
        tabs: exists ? state.tabs : [...state.tabs, { id: info.id, name: info.name, path: info.path }],
        activeId: info.id,
        ui: state.ui[info.id] ? state.ui : { ...state.ui, [info.id]: defaultUi() },
      };
    });
  },
  closeTab: (id) => {
    set((state) => {
      const index = state.tabs.findIndex((t) => t.id === id);
      const tabs = state.tabs.filter((t) => t.id !== id);
      const ui = { ...state.ui };
      delete ui[id];
      let activeId = state.activeId;
      if (activeId === id) {
        activeId = tabs[Math.min(index, tabs.length - 1)]?.id ?? null;
      }
      return { tabs, ui, activeId };
    });
  },
  activate: (id) => {
    set({ activeId: id });
  },
  cycleTab: (direction) => {
    const { tabs, activeId } = get();
    if (tabs.length === 0) return;
    const index = tabs.findIndex((t) => t.id === activeId);
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    if (next) set({ activeId: next.id });
  },
  select: (id, selection) => {
    set((state) => ({ ui: patch(state.ui, id, { selection }) }));
  },
  setCenter: (id, center) => {
    set((state) => ({ ui: patch(state.ui, id, { center }) }));
  },
  scrollToRow: (id, row, select = true) => {
    set((state) => ({
      ui: patch(state.ui, id, { scrollRequest: { row, select, nonce: Date.now() + Math.random() } }),
    }));
  },
}));

function patch(ui: Record<string, RepoUi>, id: string, values: Partial<RepoUi>) {
  return { ...ui, [id]: { ...(ui[id] ?? defaultUi()), ...values } };
}

/** UI state of one repository tab. */
export function useRepoUi(id: string): RepoUi {
  return useWorkspace((state) => state.ui[id] ?? DEFAULT_UI);
}

const DEFAULT_UI = defaultUi();
