import { stashApi, type Stash } from '@/api';
import { runAction } from '@/features/repo/actions';

/** "WIP on main: abc123 msg" → "msg"; custom messages are kept. */
export function stashLabel(stash: Stash): string {
  const match = /^(?:WIP on|On) [^:]+: (?:[0-9a-f]{7,} )?(.*)$/.exec(stash.message);
  return match?.[1] || stash.message;
}

export async function applyStash(repoId: string, stash: Stash, pop: boolean): Promise<void> {
  await runAction(
    repoId,
    () => (pop ? stashApi.pop(repoId, stash.index) : stashApi.apply(repoId, stash.index)),
    {
      success: pop ? 'Stash aplicado y eliminado' : 'Stash aplicado',
      errorTitle: 'No se pudo aplicar el stash',
    },
  );
}
