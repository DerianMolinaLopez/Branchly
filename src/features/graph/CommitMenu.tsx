import { Copy, GitBranchPlus, GitCommitVertical, RotateCcw, Tag, Text } from 'lucide-react';
import { commitsApi, type CommitSummary, type ResetMode } from '@/api';
import { copyText } from '@/lib/clipboard';
import { checkoutCommit } from '@/features/branches/actions';
import { confirm } from '@/features/dialogs/confirm';
import { openDialog } from '@/features/dialogs/store';
import { runAction } from '@/features/repo/actions';
import { ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuSub } from '@/ui';

const RESET_COPY: Record<
  ResetMode,
  { label: string; description: string; consequences?: string[] }
> = {
  soft: {
    label: 'Soft: conservar cambios preparados',
    description:
      'La rama apunta al commit elegido; los cambios de los commits posteriores quedan preparados.',
  },
  mixed: {
    label: 'Mixed: conservar cambios sin preparar',
    description:
      'La rama apunta al commit elegido; los cambios posteriores quedan en el árbol de trabajo sin preparar.',
  },
  hard: {
    label: 'Hard: descartar todo',
    description: 'La rama y el árbol de trabajo vuelven exactamente al commit elegido.',
    consequences: [
      'Todos los cambios sin confirmar (preparados y sin preparar)',
      'Los commits posteriores que no estén en otra rama o etiqueta',
    ],
  },
};

async function reset(repoId: string, commit: CommitSummary, mode: ResetMode, branch: string) {
  const copy = RESET_COPY[mode];
  const ok = await confirm({
    title: `Reset de «${branch}» a ${commit.shortId}`,
    description: copy.description,
    consequences: copy.consequences,
    confirmLabel: mode === 'hard' ? 'Descartar y hacer reset' : 'Hacer reset',
    tone: mode === 'hard' ? 'danger' : 'default',
  });
  if (!ok) return;
  await runAction(repoId, () => commitsApi.reset(repoId, commit.id, mode), {
    success: `«${branch}» ahora apunta a ${commit.shortId}`,
    errorTitle: 'No se pudo hacer reset',
  });
}

/** Context-menu items for a commit row. */
export function CommitMenuItems({
  repoId,
  commit,
  current,
  isHead,
}: {
  repoId: string;
  commit: CommitSummary;
  current: string | null;
  isHead: boolean;
}) {
  return (
    <>
      <ContextMenuLabel>
        {commit.shortId} {commit.summary}
      </ContextMenuLabel>
      <ContextMenuItem
        icon={<GitCommitVertical />}
        disabled={isHead}
        onSelect={() => void checkoutCommit(repoId, commit.id)}
      >
        Hacer checkout de este commit
      </ContextMenuItem>
      <ContextMenuItem
        icon={<GitBranchPlus />}
        onSelect={() => {
          openDialog({
            kind: 'createBranch',
            repoId,
            start: { sha: commit.id, label: commit.shortId },
          });
        }}
      >
        Crear rama aquí…
      </ContextMenuItem>
      <ContextMenuItem
        icon={<Tag />}
        onSelect={() => {
          openDialog({ kind: 'createTag', repoId, sha: commit.id, label: commit.shortId });
        }}
      >
        Crear etiqueta aquí…
      </ContextMenuItem>
      {current && !isHead && (
        <>
          <ContextMenuSeparator />
          <ContextMenuSub icon={<RotateCcw />} label={`Reset de «${current}» aquí`}>
            {(['soft', 'mixed', 'hard'] as const).map((mode) => (
              <ContextMenuItem
                key={mode}
                danger={mode === 'hard'}
                onSelect={() => void reset(repoId, commit, mode, current)}
              >
                {RESET_COPY[mode].label}
              </ContextMenuItem>
            ))}
          </ContextMenuSub>
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem icon={<Copy />} onSelect={() => void copyText(commit.id)}>
        Copiar SHA
      </ContextMenuItem>
      <ContextMenuItem icon={<Text />} onSelect={() => void copyText(commit.summary)}>
        Copiar mensaje
      </ContextMenuItem>
    </>
  );
}
