import { branchesApi, remotesApi, stashApi, type GitError, type MergeOutcome, type Mutation } from '@/api';
import { confirm } from '@/features/dialogs/confirm';
import { openDialog } from '@/features/dialogs/store';
import { runAction, runRemote } from '@/features/repo/actions';
import { showChanges } from '@/features/repo/navigation';
import { toast } from '@/ui/toast';

/** Offers to stash local changes when a checkout would overwrite them. */
function stashAndRetry(repoId: string, retry: () => Promise<unknown>) {
  return (error: GitError): boolean => {
    if (error.code !== 'WOULD_OVERWRITE_CHANGES') return false;
    toast.error('Tus cambios locales se sobrescribirían', {
      description: 'Confirma, descarta o guarda los cambios en el stash antes de cambiar de rama.',
      action: {
        label: 'Stash y cambiar',
        onClick: () => {
          void runAction(repoId, () => stashApi.save(repoId, null, true), {
            success: null,
            errorTitle: 'No se pudo guardar el stash',
          }).then((stash) => (stash ? retry() : undefined));
        },
      },
    });
    return true;
  };
}

export function checkoutBranch(repoId: string, name: string): Promise<unknown> {
  const run = (): Promise<unknown> =>
    runAction(repoId, () => branchesApi.checkout(repoId, name), {
      success: `Cambiaste a «${name}»`,
      errorTitle: `No se pudo cambiar a «${name}»`,
      onError: stashAndRetry(repoId, () => run()),
    });
  return run();
}

export function checkoutRemoteBranch(repoId: string, name: string): Promise<unknown> {
  const run = (): Promise<unknown> =>
    runAction(repoId, () => branchesApi.checkoutRemote(repoId, name), {
      success: `Cambiaste a «${name.slice(name.indexOf('/') + 1)}»`,
      errorTitle: `No se pudo cambiar a «${name}»`,
      onError: stashAndRetry(repoId, () => run()),
    });
  return run();
}

export function checkoutCommit(repoId: string, sha: string): Promise<unknown> {
  const run = (): Promise<unknown> =>
    runAction(repoId, () => branchesApi.checkoutCommit(repoId, sha), {
      success: `HEAD separado en ${sha.slice(0, 7)}`,
      errorTitle: 'No se pudo hacer checkout del commit',
      onError: stashAndRetry(repoId, () => run()),
    });
  return run();
}

export async function deleteBranch(repoId: string, name: string): Promise<void> {
  const ok = await confirm({
    title: `Eliminar la rama «${name}»`,
    description: 'Se elimina la rama local. Podrás deshacerlo justo después.',
    confirmLabel: 'Eliminar rama',
  });
  if (!ok) return;
  await runAction(repoId, () => branchesApi.remove(repoId, name, false), {
    success: `Rama «${name}» eliminada`,
    errorTitle: `No se pudo eliminar «${name}»`,
    onError: async (error) => {
      if (error.code !== 'BRANCH_NOT_MERGED') return false;
      const force = await confirm({
        title: `«${name}» no está fusionada`,
        description: 'La rama tiene commits que no están en la rama actual ni en su rama remota.',
        consequences: [`Los commits que solo existen en «${name}»`],
        confirmLabel: 'Eliminar de todos modos',
      });
      if (force) {
        await runAction(repoId, () => branchesApi.remove(repoId, name, true), {
          success: `Rama «${name}» eliminada`,
        });
      }
      return true;
    },
  });
}

export async function deleteRemoteBranch(repoId: string, name: string): Promise<void> {
  const ok = await confirm({
    title: `Eliminar «${name}» del remoto`,
    description: 'La rama se borra del servidor para todos los colaboradores. Esta acción no se puede deshacer desde Branchly.',
    consequences: [`La rama remota ${name}`],
    confirmLabel: 'Eliminar del remoto',
  });
  if (!ok) return;
  await runRemote(repoId, (opId, onProgress) => remotesApi.deleteBranch(repoId, name, opId, onProgress), {
    kind: 'remote',
    label: `Eliminando ${name}…`,
    done: `Rama remota ${name} eliminada`,
  });
}

function mergeMessage(outcome: MergeOutcome, source: string): string | null {
  switch (outcome.type) {
    case 'upToDate':
      return 'Ya estaba al día: no hay nada que fusionar';
    case 'fastForward':
      return `Fusión rápida (fast-forward) de «${source}»`;
    case 'merged':
      return `«${source}» fusionada con un commit de merge`;
    case 'conflicts':
      return null;
  }
}

/** Merges `source` into the current branch, reporting conflicts. */
export async function mergeIntoCurrent(repoId: string, source: string, noFf = false): Promise<void> {
  const result = await runAction<Mutation<MergeOutcome>>(
    repoId,
    () => branchesApi.merge(repoId, source, { noFf }),
    {
      success: (m) => mergeMessage(m.value, source),
      errorTitle: `No se pudo fusionar «${source}»`,
    },
  );
  if (result?.value.type === 'conflicts') {
    toast.error('La fusión tiene conflictos', {
      description: `${result.value.files.length} archivo(s) necesitan resolución. Resuélvelos en el panel de cambios.`,
    });
    showChanges(repoId);
  }
}

/** Opens the merge dialog (used by drag and drop and menus). */
export function requestMerge(repoId: string, source: string, target: string): void {
  if (source === target) return;
  openDialog({ kind: 'merge', repoId, source, target });
}
