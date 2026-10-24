import {
  Copy,
  GitBranchPlus,
  GitMerge,
  Pencil,
  Trash2,
  ArrowRightLeft,
  Upload,
} from 'lucide-react';
import { copyText } from '@/lib/clipboard';
import { SHORTCUTS } from '@/lib/shortcuts';
import { openDialog } from '@/features/dialogs/store';
import { remoteActions } from '@/features/repo/actions';
import { ContextMenuItem, ContextMenuLabel, ContextMenuSeparator } from '@/ui';
import {
  checkoutBranch,
  checkoutRemoteBranch,
  deleteBranch,
  deleteRemoteBranch,
  mergeIntoCurrent,
} from './actions';

export interface BranchTarget {
  name: string;
  remote: boolean;
  isHead: boolean;
  /** Commit the branch points to. */
  sha: string;
}

/** Context-menu items for a local or remote branch. */
export function BranchMenuItems({
  repoId,
  branch,
  current,
}: {
  repoId: string;
  branch: BranchTarget;
  /** Name of the checked-out branch, if any. */
  current: string | null;
}) {
  const canMerge = current !== null && !branch.isHead && branch.name !== current;
  return (
    <>
      <ContextMenuLabel>{branch.name}</ContextMenuLabel>
      {!branch.isHead && (
        <ContextMenuItem
          icon={<ArrowRightLeft />}
          onSelect={() =>
            void (branch.remote
              ? checkoutRemoteBranch(repoId, branch.name)
              : checkoutBranch(repoId, branch.name))
          }
        >
          Cambiar a esta rama
        </ContextMenuItem>
      )}
      {canMerge && (
        <ContextMenuItem
          icon={<GitMerge />}
          onSelect={() => void mergeIntoCurrent(repoId, branch.name)}
        >
          Fusionar en «{current}»
        </ContextMenuItem>
      )}
      {branch.isHead && (
        <ContextMenuItem
          icon={<Upload />}
          shortcut={SHORTCUTS.push}
          onSelect={() => void remoteActions.push(repoId)}
        >
          Hacer push
        </ContextMenuItem>
      )}
      <ContextMenuItem
        icon={<GitBranchPlus />}
        onSelect={() => {
          openDialog({
            kind: 'createBranch',
            repoId,
            start: { sha: branch.sha, label: branch.name },
          });
        }}
      >
        Crear rama desde aquí…
      </ContextMenuItem>
      {!branch.remote && (
        <ContextMenuItem
          icon={<Pencil />}
          onSelect={() => {
            openDialog({ kind: 'renameBranch', repoId, name: branch.name });
          }}
        >
          Renombrar…
        </ContextMenuItem>
      )}
      <ContextMenuItem icon={<Copy />} onSelect={() => void copyText(branch.name)}>
        Copiar nombre
      </ContextMenuItem>
      <ContextMenuSeparator />
      {branch.remote ? (
        <ContextMenuItem
          danger
          icon={<Trash2 />}
          onSelect={() => void deleteRemoteBranch(repoId, branch.name)}
        >
          Eliminar del remoto…
        </ContextMenuItem>
      ) : (
        <ContextMenuItem
          danger
          disabled={branch.isHead}
          icon={<Trash2 />}
          onSelect={() => void deleteBranch(repoId, branch.name)}
        >
          Eliminar rama…
        </ContextMenuItem>
      )}
    </>
  );
}
