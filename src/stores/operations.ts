import { create } from 'zustand';
import type { Progress } from '@/api';

export type OperationKind = 'fetch' | 'pull' | 'push' | 'clone' | 'remote';

export interface RunningOperation {
  opId: string;
  repoId: string | null;
  kind: OperationKind;
  label: string;
  progress: Progress | null;
}

interface OperationsState {
  running: Record<string, RunningOperation>;
  start: (op: Omit<RunningOperation, 'progress'>) => void;
  progress: (opId: string, progress: Progress) => void;
  finish: (opId: string) => void;
}

/** Long-running network operations, for spinners and progress bars. */
export const useOperations = create<OperationsState>()((set) => ({
  running: {},
  start: (op) => {
    set((state) => ({ running: { ...state.running, [op.opId]: { ...op, progress: null } } }));
  },
  progress: (opId, progress) => {
    set((state) => {
      const op = state.running[opId];
      return op ? { running: { ...state.running, [opId]: { ...op, progress } } } : state;
    });
  },
  finish: (opId) => {
    set((state) => {
      const running = { ...state.running };
      delete running[opId];
      return { running };
    });
  },
}));

/** The running operation of `kind` on a repository, if any. */
export function useRunning(repoId: string, kind: OperationKind): RunningOperation | undefined {
  return useOperations((state) =>
    Object.values(state.running).find((op) => op.repoId === repoId && op.kind === kind),
  );
}
