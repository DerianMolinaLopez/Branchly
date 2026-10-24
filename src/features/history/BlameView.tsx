import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { X } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { commitsApi, keys, type BlameHunk } from '@/api';
import { colorIndex } from '@/lib/avatar';
import { cn } from '@/lib/cn';
import { languageFor } from '@/lib/language';
import { SHORTCUTS } from '@/lib/shortcuts';
import { formatAbsolute, formatRelative } from '@/lib/time';
import { useHotkey } from '@/lib/useHotkey';
import { useHighlighter } from '@/features/diff/highlight';
import { expandTabs } from '@/features/diff/rows';
import { useRepoActive } from '@/features/repo/context';
import { focusCommit } from '@/features/repo/navigation';
import { EmptyState, IconButton, SkeletonRows, Tooltip } from '@/ui';

const LINE_HEIGHT = 20;

/** Who last changed each line of a file (as of HEAD). */
export function BlameView({ repoId, path, onClose }: { repoId: string; path: string; onClose: () => void }) {
  const blame = useQuery({ queryKey: keys.blame(repoId, path), queryFn: () => commitsApi.blame(repoId, path) });
  const active = useRepoActive();
  useHotkey(SHORTCUTS.close, onClose, active);
  const highlight = useHighlighter(languageFor(path));
  const scrollRef = useRef<HTMLDivElement>(null);

  // For every line: its hunk, the hunk's position and whether it starts there.
  const lineInfo = useMemo(() => {
    const info: { hunk: BlameHunk; order: number; first: boolean }[] = [];
    blame.data?.hunks.forEach((hunk, order) => {
      for (let i = 0; i < hunk.lineCount; i++) info[hunk.startLine - 1 + i] = { hunk, order, first: i === 0 };
    });
    return info;
  }, [blame.data]);

  const lines = blame.data?.lines ?? [];
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LINE_HEIGHT,
    overscan: 30,
  });

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas/40">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line pr-2 pl-3">
        <h2 className="min-w-0 flex-1 truncate font-mono text-sm text-fg-secondary">
          <span className="text-accent">&gt;</span> blame de <span className="text-fg">{path}</span>
          {blame.data && <span className="ml-2 text-fg-subtle">{lines.length} líneas</span>}
        </h2>
        <IconButton label="Cerrar" shortcut={SHORTCUTS.close} icon={<X />} onClick={onClose} />
      </header>
      {blame.isPending ? (
        <SkeletonRows count={14} className="p-4" />
      ) : blame.isError ? (
        <EmptyState tone="error" title="no se pudo calcular el blame" description={blame.error.message} />
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
          <div className="relative min-w-max" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const info = lineInfo[item.index];
              const text = expandTabs(lines[item.index] ?? '');
              const color = info ? `var(--color-lane-${colorIndex(info.hunk.commitId)})` : undefined;
              return (
                <div
                  key={item.key}
                  className={cn(
                    'absolute inset-x-0 top-0 flex h-5 font-mono text-sm leading-5',
                    info && info.order % 2 === 1 && 'bg-teal/25',
                    info?.first && item.index > 0 && 'border-t border-line',
                  )}
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <span className="sticky left-0 flex w-72 shrink-0 items-center gap-2 border-r border-line bg-base pr-2 pl-2" style={{ boxShadow: color ? `inset 2px 0 0 ${color}` : undefined }}>
                    {info?.first && (
                      <Tooltip content={info.hunk.summary} side="right">
                        <button
                          type="button"
                          onClick={() => void focusCommit(repoId, info.hunk.commitId)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left font-sans text-xs hover:text-accent"
                        >
                          <span className="font-mono text-fg-muted">{info.hunk.shortId}</span>
                          <span className="truncate text-fg-secondary">{info.hunk.author}</span>
                          <span className="ml-auto shrink-0 text-fg-subtle" title={formatAbsolute(info.hunk.timestamp)}>
                            {formatRelative(info.hunk.timestamp)}
                          </span>
                        </button>
                      </Tooltip>
                    )}
                  </span>
                  <span className="w-12 shrink-0 pr-2 text-right text-xs leading-5 text-fg-subtle select-none">{item.index + 1}</span>
                  <span className="pr-6 whitespace-pre text-fg-secondary" data-selectable>
                    {highlight ? <span dangerouslySetInnerHTML={{ __html: highlight(text) }} /> : text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
