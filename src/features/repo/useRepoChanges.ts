import { useEffect } from 'react';
import { keys, onRepoChanged } from '@/api';
import { queryClient } from '@/app/queryClient';

/**
 * Refreshes data when files change outside the app (terminal, editor). The
 * backend already debounces and classifies the events, so only what changed
 * is refetched: working-tree edits refresh the status, ref moves refresh the
 * graph, branches and everything derived from HEAD.
 */
export function useRepoChanges(): void {
  useEffect(
    () =>
      onRepoChanged(({ repoId, changes }) => {
        const invalidate = (queryKey: readonly unknown[]) =>
          void queryClient.invalidateQueries({ queryKey });
        if (changes.workdir || changes.index) invalidate(keys.status(repoId));
        if (changes.refs) {
          invalidate(keys.info(repoId));
          invalidate(keys.graph(repoId));
          invalidate(keys.refs(repoId));
          invalidate(keys.status(repoId));
          invalidate(['repo', repoId, 'history']);
          invalidate(['repo', repoId, 'blame']);
        }
      }),
    [],
  );
}
