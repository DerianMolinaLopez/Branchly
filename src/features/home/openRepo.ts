import { keys, repositoriesApi, systemApi, type RepoInfo } from '@/api';
import { GitError } from '@/api/client';
import { queryClient } from '@/app/queryClient';
import { useWorkspace } from '@/stores/workspace';
import { toast } from '@/ui/toast';

/** Opens a repository in a tab (or focuses its tab if already open). */
export async function openRepository(path: string): Promise<RepoInfo | null> {
  try {
    const info = await repositoriesApi.open(path);
    useWorkspace.getState().openTab(info);
    return info;
  } catch (raw) {
    const error = GitError.from(raw);
    toast.error('No se pudo abrir el repositorio', {
      description:
        error.code === 'NOT_A_REPOSITORY'
          ? `${error.message}. Puedes inicializarlo desde la pantalla de inicio.`
          : error.message,
    });
    return null;
  } finally {
    void queryClient.invalidateQueries({ queryKey: keys.recent() });
  }
}

/** Asks for a folder and opens it. */
export async function pickAndOpenRepository(): Promise<void> {
  const path = await systemApi.pickFolder('Abrir repositorio').catch(() => null);
  if (path) await openRepository(path);
}

/** Closes a tab and releases its backend session and file watcher. */
export function closeRepository(repoId: string): void {
  useWorkspace.getState().closeTab(repoId);
  void repositoriesApi.close(repoId).catch(() => undefined);
  queryClient.removeQueries({ queryKey: keys.repo(repoId) });
}

/** Joins a folder and a child name using the folder's own separator. */
export function joinPath(parent: string, child: string): string {
  const separator = parent.includes('\\') && !parent.includes('/') ? '\\' : '/';
  return parent.endsWith(separator) ? `${parent}${child}` : `${parent}${separator}${child}`;
}
