import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';
import { commitsApi, keys } from '@/api';
import { cn } from '@/lib/cn';
import { SHORTCUTS } from '@/lib/shortcuts';
import { formatAbsolute, formatRelative } from '@/lib/time';
import { useHotkey } from '@/lib/useHotkey';
import { CHANGE_KIND } from '@/features/commit/changeKind';
import { DiffView } from '@/features/diff/DiffView';
import { useRepoActive } from '@/features/repo/context';
import { focusCommit } from '@/features/repo/navigation';
import { Avatar, EmptyState, IconButton, SkeletonRows } from '@/ui';

/** Every commit that touched a file, with the file's diff in each one. */
export function FileHistoryView({
  repoId,
  path,
  onClose,
}: {
  repoId: string;
  path: string;
  onClose: () => void;
}) {
  const history = useQuery({
    queryKey: keys.history(repoId, path),
    queryFn: () => commitsApi.fileHistory(repoId, path),
  });
  const [selected, setSelected] = useState(0);
  const active = useRepoActive();
  useHotkey(SHORTCUTS.close, onClose, active);

  const entries = history.data ?? [];
  const entry = entries[Math.min(selected, entries.length - 1)];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line pr-2 pl-3">
        <h2 className="min-w-0 flex-1 truncate font-mono text-sm text-fg-secondary">
          <span className="text-accent">&gt;</span> historial de{' '}
          <span className="text-fg">{path}</span>
          {history.data && <span className="ml-2 text-fg-subtle">{entries.length} commits</span>}
        </h2>
        <IconButton label="Cerrar" shortcut={SHORTCUTS.close} icon={<X />} onClick={onClose} />
      </header>
      {history.isPending ? (
        <SkeletonRows count={10} className="p-4" />
      ) : history.isError ? (
        <EmptyState
          tone="error"
          title="no se pudo leer el historial"
          description={history.error.message}
        />
      ) : entries.length === 0 || !entry ? (
        <EmptyState
          title="sin historial"
          description="Ningún commit alcanzable desde HEAD modificó este archivo."
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          <ol
            aria-label="Commits que modificaron el archivo"
            className="w-80 shrink-0 overflow-y-auto border-r border-line p-1.5"
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown')
                setSelected((s) => Math.min(entries.length - 1, s + 1));
              if (event.key === 'ArrowUp') setSelected((s) => Math.max(0, s - 1));
            }}
          >
            {entries.map((item, index) => {
              const kind = CHANGE_KIND[item.change];
              return (
                <li key={item.commit.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(index);
                    }}
                    onDoubleClick={() => void focusCommit(repoId, item.commit.id)}
                    aria-current={index === selected}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-chip px-2 py-1.5 text-left',
                      index === selected ? 'bg-accent-soft' : 'hover:bg-raised',
                    )}
                  >
                    <Avatar
                      name={item.commit.author.name}
                      email={item.commit.author.email}
                      size="sm"
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base text-fg-secondary">
                        {item.commit.summary}
                      </span>
                      <span className="flex gap-2 text-xs text-fg-muted">
                        <span className="font-mono">{item.commit.shortId}</span>
                        <span title={formatAbsolute(item.commit.author.timestamp)}>
                          {formatRelative(item.commit.author.timestamp)}
                        </span>
                        <span className={kind.className}>{kind.label.toLowerCase()}</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="min-w-0 flex-1">
            <DiffView
              key={entry.commit.id}
              repoId={repoId}
              source={{ type: 'commit', sha: entry.commit.id, path: entry.path, oldPath: null }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
