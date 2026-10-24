import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { commitsApi, keys, type CommitDetail } from '@/api';
import { copyText } from '@/lib/clipboard';
import { reflowParagraphs } from '@/lib/text';
import { formatAbsolute, formatRelative } from '@/lib/time';
import { focusCommit } from '@/features/repo/navigation';
import { useRepoUi, useWorkspace } from '@/stores/workspace';
import {
  Avatar,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  EmptyState,
  SectionTitle,
  SkeletonRows,
  Tooltip,
} from '@/ui';
import { FileMenuItems } from './FileMenu';
import { FileRow, LineCounts } from './FileRow';

export function CommitDetailPanel({ repoId, sha }: { repoId: string; sha: string }) {
  const detail = useQuery({
    queryKey: keys.commit(repoId, sha),
    queryFn: () => commitsApi.detail(repoId, sha),
    staleTime: Infinity,
  });

  if (detail.isPending) return <SkeletonRows count={8} className="p-4" />;
  if (detail.isError) {
    return (
      <EmptyState
        tone="error"
        title="no se pudo cargar el commit"
        description={detail.error.message}
      />
    );
  }
  return (
    <motion.div
      key={sha}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      className="flex h-full min-h-0 flex-col"
    >
      <CommitHeader repoId={repoId} commit={detail.data} />
      <CommitFiles repoId={repoId} commit={detail.data} />
    </motion.div>
  );
}

function CopySha({ sha }: { sha: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip content={copied ? 'Copiado' : 'Copiar SHA completo'}>
      <button
        type="button"
        onClick={() => {
          void copyText(sha).then((ok) => {
            setCopied(ok);
            window.setTimeout(() => {
              setCopied(false);
            }, 1500);
          });
        }}
        className="inline-flex items-center gap-1.5 rounded-chip px-1 font-mono text-sm text-accent hover:bg-accent-soft"
      >
        {sha.slice(0, 10)}
        {copied ? <Check className="size-3" /> : <Copy className="size-3 opacity-60" />}
      </button>
    </Tooltip>
  );
}

function CommitHeader({ repoId, commit }: { repoId: string; commit: CommitDetail }) {
  const committedBySomeoneElse =
    commit.committer.email !== commit.author.email || commit.committer.name !== commit.author.name;
  return (
    <header className="shrink-0 border-b border-line px-4 pt-4 pb-3">
      <h2 className="text-md leading-snug font-semibold break-words text-fg" data-selectable>
        {commit.summary || <span className="text-fg-subtle italic">Sin mensaje</span>}
      </h2>
      {commit.body && (
        <div
          className="mt-2 max-h-48 space-y-2 overflow-y-auto text-base break-words text-fg-secondary"
          data-selectable
        >
          {reflowParagraphs(commit.body).map((paragraph, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {paragraph}
            </p>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2.5">
        <Avatar name={commit.author.name} email={commit.author.email} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base text-fg" data-selectable>
            {commit.author.name}
            <span className="ml-1.5 text-sm text-fg-muted">{commit.author.email}</span>
          </p>
          <p className="text-sm text-fg-muted" title={formatAbsolute(commit.author.timestamp)}>
            {formatRelative(commit.author.timestamp)}, {formatAbsolute(commit.author.timestamp)}
          </p>
          {committedBySomeoneElse && (
            <p className="truncate text-sm text-fg-subtle">
              Confirmado por {commit.committer.name}
            </p>
          )}
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-sm">
        <dt className="text-fg-subtle">Commit</dt>
        <dd>
          <CopySha sha={commit.id} />
        </dd>
        <dt className="text-fg-subtle">{commit.parents.length > 1 ? 'Padres' : 'Padre'}</dt>
        <dd className="flex flex-wrap gap-1">
          {commit.parents.length === 0 && <span className="text-fg-muted">commit inicial</span>}
          {commit.parents.map((parent) => (
            <button
              key={parent}
              type="button"
              onClick={() => void focusCommit(repoId, parent)}
              className="rounded-chip px-1 font-mono text-fg-secondary hover:bg-raised hover:text-accent"
            >
              {parent.slice(0, 7)}
            </button>
          ))}
        </dd>
        {commit.refs.length > 0 && (
          <>
            <dt className="text-fg-subtle">Referencias</dt>
            <dd className="flex flex-wrap gap-1">
              {commit.refs.map((ref) => (
                <span
                  key={ref.fullName}
                  className="rounded-chip border border-line bg-canvas/60 px-1.5 font-mono text-xs text-fg-secondary"
                >
                  {ref.name}
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>
    </header>
  );
}

function CommitFiles({ repoId, commit }: { repoId: string; commit: CommitDetail }) {
  const { center } = useRepoUi(repoId);
  const setCenter = useWorkspace((s) => s.setCenter);
  const openPath =
    center.kind === 'diff' && center.source.type === 'commit' && center.source.sha === commit.id
      ? center.source.path
      : null;
  const { stats } = commit;
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 pt-3 pb-1">
        <SectionTitle count={stats.filesChanged} className="flex-1">
          archivos
        </SectionTitle>
        <LineCounts additions={stats.additions} deletions={stats.deletions} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {commit.files.length === 0 && (
          <p className="px-2 py-3 text-sm text-fg-muted">Este commit no cambia archivos.</p>
        )}
        {commit.files.map((file) => (
          <ContextMenu key={file.path}>
            <ContextMenuTrigger>
              <div>
                <FileRow
                  file={file}
                  selected={openPath === file.path}
                  onOpen={() => {
                    setCenter(repoId, {
                      kind: 'diff',
                      source: {
                        type: 'commit',
                        sha: commit.id,
                        path: file.path,
                        oldPath: file.oldPath,
                      },
                    });
                  }}
                  trailing={
                    <LineCounts
                      additions={file.additions}
                      deletions={file.deletions}
                      binary={file.binary}
                    />
                  }
                />
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <FileMenuItems repoId={repoId} path={file.path} exists={file.kind !== 'deleted'} />
            </ContextMenuContent>
          </ContextMenu>
        ))}
        {commit.filesTruncated && (
          <p className="px-2 py-2 text-sm text-fg-muted">
            Lista recortada: el commit cambia demasiados archivos.
          </p>
        )}
      </div>
    </section>
  );
}
