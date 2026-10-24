import type { ReactNode } from 'react';
import type { FileChange } from '@/api';
import { cn } from '@/lib/cn';
import { splitPath } from '@/lib/path';
import { CHANGE_KIND } from './changeKind';

/** One changed file: status letter, file name, folder and optional extras. */
export function FileRow({
  file,
  selected,
  onOpen,
  trailing,
  actions,
}: {
  file: Pick<FileChange, 'path' | 'oldPath' | 'kind'> & Partial<Pick<FileChange, 'additions' | 'deletions' | 'binary'>>;
  selected?: boolean;
  onOpen: () => void;
  trailing?: ReactNode;
  /** Buttons revealed on hover/focus. */
  actions?: ReactNode;
}) {
  const kind = CHANGE_KIND[file.kind];
  const { dir, name } = splitPath(file.path);
  return (
    <div
      className={cn(
        'group relative flex h-7 items-center gap-2 rounded-chip pr-1 pl-2 text-base',
        selected ? 'bg-accent-soft text-fg' : 'hover:bg-raised',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
        className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-offset-0"
      >
        <span className={cn('w-3 shrink-0 text-center font-mono text-xs font-semibold', kind.className)} aria-label={kind.label}>
          {kind.letter}
        </span>
        <span className="min-w-0 truncate">
          <span className="text-fg-secondary group-hover:text-fg">{name}</span>
          {dir && <span className="ml-1.5 text-sm text-fg-subtle">{dir.replace(/\/$/, '')}</span>}
        </span>
      </button>
      {trailing}
      {actions && (
        <span className="flex shrink-0 items-center opacity-0 transition-opacity duration-(--duration-fast) group-focus-within:opacity-100 group-hover:opacity-100">
          {actions}
        </span>
      )}
    </div>
  );
}

/** "+12 −3" line counts. */
export function LineCounts({ additions, deletions, binary }: { additions: number; deletions: number; binary?: boolean }) {
  if (binary) return <span className="shrink-0 font-mono text-2xs text-fg-subtle">binario</span>;
  return (
    <span className="flex shrink-0 gap-1.5 font-mono text-2xs tabular-nums">
      {additions > 0 && <span className="text-diff-add">+{additions}</span>}
      {deletions > 0 && <span className="text-diff-del">−{deletions}</span>}
    </span>
  );
}
