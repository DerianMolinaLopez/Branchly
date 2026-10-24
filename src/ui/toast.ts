import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info' | 'progress';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string | undefined;
  action?: ToastAction | undefined;
  /** 0–100 for determinate progress, null for indeterminate. */
  progress?: number | null | undefined;
  /** Milliseconds before dismissing; 0 keeps it until dismissed. */
  duration: number;
}

type ToastInput = Omit<Toast, 'id' | 'duration'> & { duration?: number };

interface ToastState {
  toasts: Toast[];
  show: (toast: ToastInput) => number;
  update: (id: number, values: Partial<ToastInput>) => void;
  dismiss: (id: number) => void;
}

const MAX_VISIBLE = 4;
let nextId = 1;

function defaultDuration(toast: ToastInput): number {
  if (toast.kind === 'progress') return 0;
  if (toast.kind === 'error') return 9000;
  if (toast.action) return 7000;
  return 4000;
}

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  show: (input) => {
    const id = nextId++;
    const toast: Toast = { ...input, id, duration: input.duration ?? defaultDuration(input) };
    set((state) => ({ toasts: [...state.toasts, toast].slice(-MAX_VISIBLE) }));
    return id;
  },
  update: (id, values) => {
    set((state) => ({
      toasts: state.toasts.map((t) =>
        t.id === id
          ? {
              ...t,
              ...values,
              duration:
                values.duration ??
                (values.kind && values.kind !== t.kind ? defaultDuration({ ...t, ...values }) : t.duration),
            }
          : t,
      ),
    }));
  },
  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));

type Options = Partial<Pick<Toast, 'description' | 'action' | 'duration'>>;

/** Imperative helpers usable from hooks, event handlers and mutations. */
export const toast = {
  success: (title: string, options: Options = {}) =>
    useToasts.getState().show({ kind: 'success', title, ...options }),
  error: (title: string, options: Options = {}) =>
    useToasts.getState().show({ kind: 'error', title, ...options }),
  info: (title: string, options: Options = {}) =>
    useToasts.getState().show({ kind: 'info', title, ...options }),
  progress: (title: string, options: Options & { progress?: number | null } = {}) =>
    useToasts.getState().show({ kind: 'progress', title, progress: null, ...options }),
  update: (id: number, values: Partial<ToastInput>) => {
    useToasts.getState().update(id, values);
  },
  dismiss: (id: number) => {
    useToasts.getState().dismiss(id);
  },
};
