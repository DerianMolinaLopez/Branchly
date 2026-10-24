import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** What will be lost, listed explicitly before confirming. */
  consequences?: string[];
  confirmLabel: string;
  tone?: 'danger' | 'default';
}

interface ConfirmState {
  request: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
  open: (options: ConfirmOptions) => Promise<boolean>;
  settle: (ok: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>()((set, get) => ({
  request: null,
  open: (options) =>
    new Promise<boolean>((resolve) => {
      get().request?.resolve(false);
      set({ request: { ...options, resolve } });
    }),
  settle: (ok) => {
    get().request?.resolve(ok);
    set({ request: null });
  },
}));

/** Asks for explicit confirmation; resolves to true when the user confirms. */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().open(options);
}
