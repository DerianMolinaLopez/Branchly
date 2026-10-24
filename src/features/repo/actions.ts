import { commitsApi, GitError, keys, remotesApi, repositoriesApi, type Progress, type RemoteOutcome, type UndoHandle } from '@/api';
import { queryClient } from '@/app/queryClient';
import { operationId } from '@/lib/id';
import { useOperations, type OperationKind } from '@/stores/operations';
import { toast } from '@/ui/toast';
import { useUndoStore } from './undo';

interface ActionOptions<T> {
  /** Success notification; return null to stay silent. */
  success?: string | null | ((value: T) => string | null);
  /** Title of the error notification. */
  errorTitle?: string;
  /** Return true when the error was handled (e.g. by asking to force). */
  onError?: (error: GitError) => boolean | Promise<boolean>;
}

function undoHandleOf(value: unknown): UndoHandle | null {
  if (typeof value === 'object' && value !== null && 'undo' in value) {
    const handle = (value as { undo: unknown }).undo;
    if (typeof handle === 'object' && handle !== null && 'id' in handle) return handle as UndoHandle;
  }
  return null;
}

export async function refreshRepo(repoId: string): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: keys.repo(repoId) });
}

/**
 * Runs a local mutation: refreshes the repository, reports the result and,
 * when the backend returned an undo handle, offers "Deshacer".
 * Resolves to the value, or `undefined` when it failed (already reported).
 */
export async function runAction<T>(
  repoId: string,
  task: () => Promise<T>,
  options: ActionOptions<T> = {},
): Promise<T | undefined> {
  try {
    const value = await task();
    const handle = undoHandleOf(value);
    if (handle) useUndoStore.getState().set(repoId, handle);
    const message = typeof options.success === 'function' ? options.success(value) : options.success;
    if (message) {
      toast.success(message, {
        action: handle
          ? {
              label: 'Deshacer',
              onClick: () => void undoOperation(repoId, handle),
            }
          : undefined,
      });
    }
    return value;
  } catch (raw) {
    const error = GitError.from(raw);
    const handled = options.onError ? await options.onError(error) : false;
    if (!handled) {
      toast.error(options.errorTitle ?? 'No se pudo completar la operación', {
        description: error.message,
      });
    }
    return undefined;
  } finally {
    void refreshRepo(repoId);
  }
}

/** Reverts the operation identified by `handle`. */
export async function undoOperation(repoId: string, handle: UndoHandle): Promise<void> {
  useUndoStore.getState().set(repoId, null);
  await runAction(repoId, () => commitsApi.undo(repoId, handle.id), {
    success: (message) => message,
    errorTitle: 'No se pudo deshacer',
  });
}

interface RemoteOptions {
  kind: OperationKind;
  /** Shown while running, e.g. "Haciendo push…". */
  label: string;
  /** Title of the success notification. */
  done: string;
  /** Run without a progress notification (auto-fetch); errors still show. */
  silent?: boolean;
  onConflicts?: (outcome: RemoteOutcome) => void;
}

/**
 * Runs a network operation with progress, cancellation and a result
 * notification. Resolves to the outcome, or `undefined` on failure.
 */
export async function runRemote(
  repoId: string,
  task: (opId: string, onProgress: (p: Progress) => void) => Promise<RemoteOutcome>,
  options: RemoteOptions,
): Promise<RemoteOutcome | undefined> {
  const ops = useOperations.getState();
  const opId = operationId(options.kind);
  ops.start({ opId, repoId, kind: options.kind, label: options.label });
  const toastId = options.silent
    ? null
    : toast.progress(options.label, {
        action: { label: 'Cancelar', onClick: () => void repositoriesApi.cancelOperation(opId) },
      });

  const onProgress = (progress: Progress) => {
    useOperations.getState().progress(opId, progress);
    if (toastId !== null) {
      toast.update(toastId, {
        description: progress.message,
        progress: progress.percent,
      });
    }
  };

  try {
    const outcome = await task(opId, onProgress);
    if (outcome.conflicts.length > 0) {
      if (toastId !== null) toast.dismiss(toastId);
      toast.error('La operación terminó con conflictos', {
        description: `${outcome.conflicts.length} archivo(s) necesitan resolución`,
      });
      options.onConflicts?.(outcome);
    } else if (toastId !== null) {
      toast.update(toastId, {
        kind: 'success',
        title: options.done,
        description: outcome.message,
        action: undefined,
        progress: undefined,
      });
    }
    return outcome;
  } catch (raw) {
    const error = GitError.from(raw);
    if (toastId !== null) toast.dismiss(toastId);
    if (error.code === 'CANCELLED') {
      toast.info('Operación cancelada');
    } else {
      toast.error(`Falló: ${options.label.replace(/…$/, '').toLowerCase()}`, { description: error.message });
    }
    return undefined;
  } finally {
    useOperations.getState().finish(opId);
    void refreshRepo(repoId);
  }
}

/** The three everyday network operations, shared by toolbar, palette and shortcuts. */
export const remoteActions = {
  fetch: (repoId: string, silent = false) =>
    runRemote(repoId, (opId, onProgress) => remotesApi.fetch(repoId, opId, onProgress), {
      kind: 'fetch',
      label: 'Obteniendo cambios remotos…',
      done: 'Fetch completado',
      silent,
    }),
  pull: (repoId: string) =>
    runRemote(repoId, (opId, onProgress) => remotesApi.pull(repoId, opId, onProgress), {
      kind: 'pull',
      label: 'Haciendo pull…',
      done: 'Pull completado',
    }),
  push: (repoId: string, forceWithLease = false) =>
    runRemote(
      repoId,
      (opId, onProgress) =>
        remotesApi.push(repoId, { remote: null, forceWithLease }, opId, onProgress),
      { kind: 'push', label: 'Haciendo push…', done: 'Push completado' },
    ),
};
