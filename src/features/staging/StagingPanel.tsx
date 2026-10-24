import { ExternalLink, GitMerge, Minus, Plus, Trash2, Undo2, CheckCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  stagingApi,
  systemApi,
  type ConflictFile,
  type FileChange,
  type RepoState,
  type WorkingTreeStatus,
} from '@/api';
import { SHORTCUTS } from '@/lib/shortcuts';
import { FileMenuItems } from '@/features/commit/FileMenu';
import { FileRow } from '@/features/commit/FileRow';
import { confirm } from '@/features/dialogs/confirm';
import { runAction } from '@/features/repo/actions';
import { useStatus } from '@/features/repo/queries';
import { useRepoUi, useWorkspace } from '@/stores/workspace';
import {
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  EmptyState,
  IconButton,
  SectionTitle,
  SkeletonRows,
  Tooltip,
  toast,
} from '@/ui';
import { CommitEditor } from './CommitEditor';

const STATE_LABEL: Record<Exclude<RepoState, 'clean'>, string> = {
  merging: 'Merge en curso',
  rebasing: 'Rebase en curso',
  cherryPicking: 'Cherry-pick en curso',
  reverting: 'Revert en curso',
  bisecting: 'Bisect en curso',
  applyingMailbox: 'Aplicando parches (git am)',
};

/** The working tree: conflicts, unstaged and staged changes, and the commit editor. */
export function StagingPanel({ repoId }: { repoId: string }) {
  const status = useStatus(repoId);
  if (status.isPending) return <SkeletonRows count={8} className="p-4" />;
  if (status.isError) {
    return (
      <EmptyState
        tone="error"
        title="no se pudo leer el estado"
        description={status.error.message}
      />
    );
  }
  const data = status.data;
  const clean = data.staged.length + data.unstaged.length + data.conflicted.length === 0;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {data.state !== 'clean' && (
        <OperationBanner repoId={repoId} status={data} state={data.state} />
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {clean ? (
          <EmptyState
            title="todo confirmado"
            description="No hay cambios en el árbol de trabajo. Edita archivos y aparecerán aquí al instante."
          />
        ) : (
          <>
            {data.conflicted.length > 0 && (
              <ConflictSection repoId={repoId} files={data.conflicted} />
            )}
            <UnstagedSection repoId={repoId} files={data.unstaged} />
            <StagedSection repoId={repoId} files={data.staged} />
          </>
        )}
      </div>
      <CommitEditor repoId={repoId} status={data} />
    </div>
  );
}

function OperationBanner({
  repoId,
  status,
  state,
}: {
  repoId: string;
  status: WorkingTreeStatus;
  state: Exclude<RepoState, 'clean'>;
}) {
  const pending = status.conflicted.length;
  return (
    <div className="shrink-0 border-b border-warning/30 bg-warning-soft/60 px-4 py-3">
      <p className="flex items-center gap-2 text-base font-medium text-warning">
        <GitMerge className="size-4" />
        {STATE_LABEL[state]}
      </p>
      <p className="mt-0.5 text-sm text-fg-secondary">
        {pending > 0
          ? `Resuelve ${pending} archivo(s) en conflicto y después continúa.`
          : 'Todos los conflictos están resueltos. Puedes continuar.'}
      </p>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant="danger-ghost"
          onClick={async () => {
            const ok = await confirm({
              title: `Abortar: ${STATE_LABEL[state].toLowerCase()}`,
              description: 'El repositorio vuelve al estado anterior a la operación.',
              consequences: ['Las resoluciones de conflictos hechas hasta ahora'],
              confirmLabel: 'Abortar',
            });
            if (ok)
              await runAction(repoId, () => stagingApi.abortOperation(repoId), {
                success: 'Operación abortada',
              });
          }}
        >
          Abortar
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={pending > 0}
          onClick={() =>
            void runAction(repoId, () => stagingApi.continueOperation(repoId), {
              success: 'Operación completada',
            })
          }
        >
          Continuar
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  actions,
  children,
}: {
  title: string;
  count: number;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-3" aria-label={title}>
      <SectionTitle count={count} actions={actions} className="px-2">
        {title}
      </SectionTitle>
      <div className="mt-0.5">{children}</div>
    </section>
  );
}

function useOpenDiff(repoId: string) {
  const setCenter = useWorkspace((s) => s.setCenter);
  const { center } = useRepoUi(repoId);
  const openPath =
    center.kind === 'diff' && center.source.type === 'working'
      ? `${center.source.staged}:${center.source.path}`
      : null;
  return {
    isOpen: (path: string, staged: boolean) => openPath === `${staged}:${path}`,
    open: (path: string, staged: boolean) => {
      setCenter(repoId, { kind: 'diff', source: { type: 'working', path, staged } });
    },
  };
}

async function discard(repoId: string, files: FileChange[]) {
  const untracked = files.filter((f) => f.kind === 'untracked');
  const ok = await confirm({
    title:
      files.length === 1
        ? 'Descartar los cambios del archivo'
        : `Descartar ${files.length} archivos`,
    description:
      untracked.length > 0
        ? 'Los archivos nuevos sin seguimiento se eliminarán del disco.'
        : 'Los archivos vuelven a su última versión preparada o confirmada.',
    consequences: files.map((f) => (f.kind === 'untracked' ? `${f.path} (se elimina)` : f.path)),
    confirmLabel: 'Descartar cambios',
  });
  if (!ok) return;
  await runAction(
    repoId,
    () =>
      stagingApi.discard(
        repoId,
        files.map((f) => f.path),
      ),
    {
      success: files.length === 1 ? 'Cambios descartados' : `${files.length} archivos descartados`,
    },
  );
}

function UnstagedSection({ repoId, files }: { repoId: string; files: FileChange[] }) {
  const diff = useOpenDiff(repoId);
  if (files.length === 0) return null;
  return (
    <Section
      title="sin preparar"
      count={files.length}
      actions={
        <>
          <IconButton
            size="sm"
            tone="danger"
            label="Descartar todo"
            icon={<Undo2 />}
            onClick={() => void discard(repoId, files)}
          />
          <Tooltip content="Preparar todo" shortcut={SHORTCUTS.stageAll}>
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus />}
              onClick={() => void runAction(repoId, () => stagingApi.stageAll(repoId))}
            >
              Preparar todo
            </Button>
          </Tooltip>
        </>
      }
    >
      {files.map((file) => (
        <ContextMenu key={file.path}>
          <ContextMenuTrigger>
            <div>
              <FileRow
                file={file}
                selected={diff.isOpen(file.path, false)}
                onOpen={() => {
                  diff.open(file.path, false);
                }}
                actions={
                  <>
                    <IconButton
                      size="sm"
                      tone="danger"
                      label="Descartar cambios"
                      icon={<Undo2 />}
                      onClick={() => void discard(repoId, [file])}
                    />
                    <IconButton
                      size="sm"
                      tone="accent"
                      label="Preparar archivo"
                      icon={<Plus />}
                      onClick={() =>
                        void runAction(repoId, () => stagingApi.stage(repoId, [file.path]))
                      }
                    />
                  </>
                }
              />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem
              icon={<Plus />}
              onSelect={() => void runAction(repoId, () => stagingApi.stage(repoId, [file.path]))}
            >
              Preparar
            </ContextMenuItem>
            <ContextMenuItem danger icon={<Trash2 />} onSelect={() => void discard(repoId, [file])}>
              Descartar cambios…
            </ContextMenuItem>
            <ContextMenuSeparator />
            <FileMenuItems repoId={repoId} path={file.path} exists={file.kind !== 'deleted'} />
          </ContextMenuContent>
        </ContextMenu>
      ))}
    </Section>
  );
}

function StagedSection({ repoId, files }: { repoId: string; files: FileChange[] }) {
  const diff = useOpenDiff(repoId);
  if (files.length === 0) return null;
  return (
    <Section
      title="preparados"
      count={files.length}
      actions={
        <Button
          size="sm"
          variant="ghost"
          icon={<Minus />}
          onClick={() => void runAction(repoId, () => stagingApi.unstageAll(repoId))}
        >
          Quitar todo
        </Button>
      }
    >
      {files.map((file) => (
        <ContextMenu key={file.path}>
          <ContextMenuTrigger>
            <div>
              <FileRow
                file={file}
                selected={diff.isOpen(file.path, true)}
                onOpen={() => {
                  diff.open(file.path, true);
                }}
                actions={
                  <IconButton
                    size="sm"
                    label="Quitar del stage"
                    icon={<Minus />}
                    onClick={() =>
                      void runAction(repoId, () =>
                        stagingApi.unstage(
                          repoId,
                          file.oldPath ? [file.oldPath, file.path] : [file.path],
                        ),
                      )
                    }
                  />
                }
              />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem
              icon={<Minus />}
              onSelect={() => void runAction(repoId, () => stagingApi.unstage(repoId, [file.path]))}
            >
              Quitar del stage
            </ContextMenuItem>
            <ContextMenuSeparator />
            <FileMenuItems repoId={repoId} path={file.path} exists={file.kind !== 'deleted'} />
          </ContextMenuContent>
        </ContextMenu>
      ))}
    </Section>
  );
}

function ConflictSection({ repoId, files }: { repoId: string; files: ConflictFile[] }) {
  const diff = useOpenDiff(repoId);
  const resolve = (file: ConflictFile, side: 'ours' | 'theirs') => {
    const missing = side === 'ours' ? !file.hasOurs : !file.hasTheirs;
    void runAction(repoId, () => stagingApi.resolveConflict(repoId, file.path, side), {
      success: missing
        ? `${file.path}: se mantiene la eliminación`
        : `${file.path}: se mantiene la versión ${side === 'ours' ? 'actual' : 'entrante'}`,
    });
  };
  return (
    <Section title="en conflicto" count={files.length}>
      {files.map((file) => (
        <div
          key={file.path}
          className="rounded-control border border-danger/25 bg-danger-soft/30 p-1 mb-1"
        >
          <FileRow
            file={{ path: file.path, oldPath: null, kind: 'conflicted' }}
            selected={diff.isOpen(file.path, false)}
            onOpen={() => {
              diff.open(file.path, false);
            }}
          />
          <div className="flex flex-wrap gap-1 px-1 pt-1 pb-0.5">
            <Tooltip
              content={
                file.hasOurs
                  ? 'Mantener la versión de tu rama (HEAD)'
                  : 'Tu rama eliminó el archivo'
              }
            >
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  resolve(file, 'ours');
                }}
              >
                Usar la actual
              </Button>
            </Tooltip>
            <Tooltip
              content={
                file.hasTheirs
                  ? 'Mantener la versión que se está fusionando'
                  : 'La rama entrante eliminó el archivo'
              }
            >
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  resolve(file, 'theirs');
                }}
              >
                Usar la entrante
              </Button>
            </Tooltip>
            <IconButton
              size="sm"
              label="Abrir en el editor externo"
              icon={<ExternalLink />}
              onClick={() => {
                systemApi.openInEditor(repoId, file.path).catch((error: unknown) => {
                  toast.error('No se pudo abrir el archivo', { description: String(error) });
                });
              }}
            />
            <IconButton
              size="sm"
              tone="accent"
              label="Marcar como resuelto"
              icon={<CheckCheck />}
              onClick={() =>
                void runAction(repoId, () => stagingApi.markResolved(repoId, file.path), {
                  success: `${file.path} resuelto`,
                })
              }
            />
          </div>
        </div>
      ))}
    </Section>
  );
}
