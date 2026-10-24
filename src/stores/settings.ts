import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type DiffMode = 'unified' | 'split';

interface SettingsState {
  /** Minutes between automatic fetches; 0 disables them. */
  autoFetchMinutes: number;
  diffMode: DiffMode;
  sidebarWidth: number;
  panelWidth: number;
  /** Repositories open when the app was closed, restored on start. */
  openPaths: string[];
  activePath: string | null;
  setAutoFetch: (minutes: number) => void;
  setDiffMode: (mode: DiffMode) => void;
  setSidebarWidth: (width: number) => void;
  setPanelWidth: (width: number) => void;
  setSession: (paths: string[], active: string | null) => void;
}

/** User preferences, persisted in local storage. */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      autoFetchMinutes: 0,
      diffMode: 'unified',
      sidebarWidth: 248,
      panelWidth: 380,
      openPaths: [],
      activePath: null,
      setAutoFetch: (autoFetchMinutes) => {
        set({ autoFetchMinutes });
      },
      setDiffMode: (diffMode) => {
        set({ diffMode });
      },
      setSidebarWidth: (sidebarWidth) => {
        set({ sidebarWidth: clamp(sidebarWidth, 180, 420) });
      },
      setPanelWidth: (panelWidth) => {
        set({ panelWidth: clamp(panelWidth, 300, 640) });
      },
      setSession: (openPaths, activePath) => {
        set({ openPaths, activePath });
      },
    }),
    {
      name: 'branchly.settings',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}
