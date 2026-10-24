import { useVirtualizer } from '@tanstack/react-virtual';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { GraphRow, WorkingTreeStatus } from '@/api';
import { cn } from '@/lib/cn';
import { formatAbsolute, formatRelative } from '@/lib/time';
import { useCurrentBranch, useStatus } from '@/features/repo/queries';
import { useRepoUi, useWorkspace } from '@/stores/workspace';
import {
  Avatar,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  EmptyState,
  Skeleton,
} from '@/ui';
import { CommitMenuItems } from './CommitMenu';
import { ROW_HEIGHT } from './constants';
import { drawGraph, readPalette, type GraphPalette } from './draw';
import { columnLayout, graphColumnWidth } from './geometry';
import { GraphSearch } from './GraphSearch';
import { RefChips } from './RefChips';
import { useGraphInfo, useGraphRows } from './useGraph';

function hasChanges(status: WorkingTreeStatus | undefined): boolean {
  return !!status && status.staged.length + status.unstaged.length + status.conflicted.length > 0;
}

/**
 * The commit graph: a virtualized list of rows with a canvas drawing the
 * lanes of the visible window only. Works the same for 50 commits or 500k.
 */
export function GraphView({ repoId, searchToken }: { repoId: string; searchToken: number }) {
  const info = useGraphInfo(repoId);
  const status = useStatus(repoId);
  const current = useCurrentBranch(repoId);
  const { selection, scrollRequest } = useRepoUi(repoId);
  const select = useWorkspace((s) => s.select);

  const wip = hasChanges(status.data);
  const offset = wip ? 1 : 0;
  const total = (info.data?.total ?? 0) + offset;
  const graphWidth = graphColumnWidth(info.data?.maxColumns ?? 1);

  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [listWidth, setListWidth] = useState(1000);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paletteRef = useRef<GraphPalette | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pendingSelect, setPendingSelect] = useState<number | null>(null);
  const [matches, setMatches] = useState<{ rows: Set<number>; current: number | null }>({
    rows: new Set(),
    current: null,
  });

  const virtualizer = useVirtualizer({
    count: total,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
  });
  const items = virtualizer.getVirtualItems();
  const firstVirtual = items[0]?.index ?? 0;
  const lastVirtual = items[items.length - 1]?.index ?? -1;
  const graphStart = Math.max(0, firstVirtual - offset);
  const graphEnd = Math.max(0, lastVirtual - offset + 2);
  const { getRow, error: rowsError } = useGraphRows(repoId, info.data, graphStart, graphEnd);

  const selectedId = selection?.kind === 'commit' ? selection.sha : null;
  const headId = info.data?.headId ?? null;

  // Draw the lanes of the visible window.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || lastVirtual < firstVirtual) return;
    paletteRef.current ??= readPalette(canvas);
    const dpr = window.devicePixelRatio || 1;
    const height = (lastVirtual - firstVirtual + 1) * ROW_HEIGHT;
    if (
      canvas.width !== Math.round(graphWidth * dpr) ||
      canvas.height !== Math.round(height * dpr)
    ) {
      canvas.width = Math.round(graphWidth * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${graphWidth}px`;
      canvas.style.height = `${height}px`;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rows: (GraphRow | undefined)[] = [];
    for (let g = graphStart; g < graphEnd; g++) rows.push(getRow(g));
    const headRow = info.data?.headRow ?? null;
    drawGraph(ctx, {
      rows,
      firstOffset: graphStart + offset - firstVirtual,
      width: graphWidth,
      height,
      palette: paletteRef.current,
      headId,
      selectedId,
      wip:
        wip && firstVirtual === 0
          ? {
              column: headRow !== null ? (getRow(headRow)?.column ?? 0) : 0,
              connect: headRow === 0,
            }
          : null,
    });
  });

  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setListWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Requests from search, the sidebar or the detail panel.
  useEffect(() => {
    if (!scrollRequest) return;
    const index = scrollRequest.row + offset;
    virtualizer.scrollToIndex(index, { align: 'center' });
    setActiveIndex(index);
    if (scrollRequest.select) setPendingSelect(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to new requests
  }, [scrollRequest?.nonce]);

  const selectIndex = useCallback(
    (index: number) => {
      setActiveIndex(index);
      if (wip && index === 0) {
        select(repoId, { kind: 'wip' });
        return true;
      }
      const row = getRow(index - offset);
      if (row) select(repoId, { kind: 'commit', sha: row.commit.id });
      return row !== undefined;
    },
    [getRow, offset, repoId, select, wip],
  );

  useEffect(() => {
    if (pendingSelect !== null && selectIndex(pendingSelect)) setPendingSelect(null);
  }, [pendingSelect, selectIndex]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const page = Math.max(1, Math.floor((scrollRef.current?.clientHeight ?? 0) / ROW_HEIGHT) - 1);
    const moves: Record<string, number> = {
      ArrowDown: 1,
      j: 1,
      ArrowUp: -1,
      k: -1,
      PageDown: page,
      PageUp: -page,
      Home: -Infinity,
      End: Infinity,
    };
    const delta = moves[event.key];
    if (delta === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const next = Math.min(total - 1, Math.max(0, activeIndex + delta));
    virtualizer.scrollToIndex(next, { align: 'auto' });
    if (!selectIndex(next)) setPendingSelect(next);
  };

  const onMatches = useCallback((rows: Set<number>, currentMatch: number | null) => {
    setMatches({ rows, current: currentMatch });
  }, []);

  const layout = columnLayout(listWidth);
  const columns = `${layout.refs}px ${graphWidth}px minmax(0, 1fr) ${layout.author}px ${layout.date}px ${layout.sha}px`;
  const empty = info.data?.total === 0 && !wip;

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line px-3">
        <h2 className="font-mono text-sm text-fg-secondary">
          <span className="text-accent">&gt;</span> historial
          {info.data && (
            <span className="ml-2 text-fg-subtle">
              {info.data.total.toLocaleString('es')} commits
            </span>
          )}
        </h2>
        <div className="flex-1" />
        <GraphSearch repoId={repoId} onMatches={onMatches} focusToken={searchToken} />
      </div>

      <div
        className="grid h-7 shrink-0 items-center overflow-hidden border-b border-line text-xs text-fg-subtle [scrollbar-gutter:stable]"
        style={{ gridTemplateColumns: columns }}
        aria-hidden
      >
        <span className="pl-3">Ramas y etiquetas</span>
        <span className="pl-2.5">Gráfica</span>
        <span className="pl-2">Mensaje</span>
        <span>{layout.compact ? '' : 'Autor'}</span>
        <span>Fecha</span>
        <span>Commit</span>
      </div>

      {info.isError ? (
        <EmptyState
          tone="error"
          title="no se pudo leer el historial"
          description={info.error.message}
        />
      ) : empty ? (
        <EmptyState
          title="sin commits todavía"
          description="Prepara algunos archivos y haz el primer commit desde el panel de cambios."
        />
      ) : (
        <div
          ref={scrollRef}
          role="listbox"
          aria-label="Commits"
          aria-activedescendant={`graph-row-${activeIndex}`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] focus-visible:outline-none"
        >
          {info.isPending ? (
            <GraphSkeleton columns={columns} />
          ) : (
            <div style={{ height: virtualizer.getTotalSize() }} className="relative">
              {items.map((item) => {
                const isWip = wip && item.index === 0;
                const graphIndex = item.index - offset;
                const row = isWip ? undefined : getRow(graphIndex);
                return isWip ? (
                  <WipRow
                    key="wip"
                    top={item.start}
                    columns={columns}
                    status={status.data}
                    selected={selection?.kind === 'wip'}
                    onSelect={() => selectIndex(0)}
                  />
                ) : (
                  <CommitRow
                    key={row?.commit.id ?? `pending-${item.index}`}
                    repoId={repoId}
                    index={item.index}
                    top={item.start}
                    columns={columns}
                    row={row}
                    selected={row !== undefined && row.commit.id === selectedId}
                    active={item.index === activeIndex}
                    matched={matches.rows.has(graphIndex)}
                    currentMatch={matches.current === graphIndex}
                    isHead={row?.commit.id === headId}
                    current={current?.name ?? null}
                    compact={layout.compact}
                    onSelect={selectIndex}
                  />
                );
              })}
              <canvas
                ref={canvasRef}
                aria-hidden
                className="pointer-events-none absolute z-[1]"
                style={{ top: firstVirtual * ROW_HEIGHT, left: layout.refs }}
              />
            </div>
          )}
          {rowsError && (
            <p
              role="alert"
              className="sticky bottom-0 bg-danger-soft px-3 py-1 text-sm text-danger"
            >
              {rowsError.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface CommitRowProps {
  repoId: string;
  index: number;
  top: number;
  columns: string;
  row: GraphRow | undefined;
  selected: boolean;
  active: boolean;
  matched: boolean;
  currentMatch: boolean;
  isHead: boolean;
  current: string | null;
  compact: boolean;
  onSelect: (index: number) => boolean;
}

const CommitRow = memo(function CommitRow({
  repoId,
  index,
  top,
  columns,
  row,
  selected,
  active,
  matched,
  currentMatch,
  isHead,
  current,
  compact,
  onSelect,
}: CommitRowProps) {
  const style = {
    transform: `translateY(${top}px)`,
    height: ROW_HEIGHT,
    gridTemplateColumns: columns,
  };
  if (!row) {
    return (
      <div className="absolute inset-x-0 top-0 grid items-center" style={style} aria-hidden>
        <span />
        <span />
        <Skeleton className="mx-2 h-2.5 w-2/3" />
        <Skeleton className="h-2.5 w-20" />
        <Skeleton className="h-2.5 w-12" />
        <Skeleton className="h-2.5 w-10" />
      </div>
    );
  }
  const { commit } = row;
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          id={`graph-row-${index}`}
          role="option"
          aria-selected={selected}
          onMouseDown={() => onSelect(index)}
          className={cn(
            'group absolute inset-x-0 top-0 grid items-center text-base',
            'before:absolute before:inset-0 before:-z-0 before:transition-colors before:duration-(--duration-fast)',
            'hover:before:bg-accent-faint',
            matched && 'before:bg-warning-soft/60',
            currentMatch && 'before:bg-warning-soft',
            selected && 'before:bg-accent-soft hover:before:bg-accent-soft',
            active && !selected && 'before:shadow-[inset_2px_0_0_var(--color-line-strong)]',
            selected && 'before:shadow-[inset_2px_0_0_var(--color-accent)]',
          )}
          style={style}
        >
          <div className="relative z-[2] min-w-0 pr-1 pl-3">
            <RefChips
              repoId={repoId}
              labels={row.refs}
              sha={commit.id}
              color={row.color}
              current={current}
            />
          </div>
          <span />
          <span
            className={cn(
              'relative z-[2] truncate pl-2',
              row.isMerge ? 'text-fg-muted' : 'text-fg-secondary',
              selected && 'text-fg',
            )}
          >
            {commit.summary || <span className="text-fg-subtle italic">sin mensaje</span>}
          </span>
          <span className="relative z-[2] flex min-w-0 items-center gap-2 pr-2">
            <Avatar name={commit.author.name} email={commit.author.email} size="sm" />
            {!compact && (
              <span className="truncate text-sm text-fg-muted">{commit.author.name}</span>
            )}
          </span>
          <span
            className="relative z-[2] overflow-hidden text-sm whitespace-nowrap text-fg-muted"
            title={formatAbsolute(commit.author.timestamp)}
          >
            {formatRelative(commit.author.timestamp)}
          </span>
          <span className="relative z-[2] overflow-hidden font-mono text-xs text-fg-subtle group-hover:text-fg-muted">
            {commit.shortId}
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <CommitMenuItems repoId={repoId} commit={commit} current={current} isHead={isHead} />
      </ContextMenuContent>
    </ContextMenu>
  );
});

function WipRow({
  top,
  columns,
  status,
  selected,
  onSelect,
}: {
  top: number;
  columns: string;
  status: WorkingTreeStatus | undefined;
  selected: boolean;
  onSelect: () => void;
}) {
  const unstaged = status?.unstaged.length ?? 0;
  const staged = status?.staged.length ?? 0;
  const conflicted = status?.conflicted.length ?? 0;
  return (
    <div
      id="graph-row-0"
      role="option"
      aria-selected={selected}
      onMouseDown={onSelect}
      className={cn(
        'absolute inset-x-0 top-0 grid items-center',
        'before:absolute before:inset-0 hover:before:bg-accent-faint',
        selected &&
          'before:bg-accent-soft before:shadow-[inset_2px_0_0_var(--color-accent)] hover:before:bg-accent-soft',
      )}
      style={{
        transform: `translateY(${top}px)`,
        height: ROW_HEIGHT,
        gridTemplateColumns: columns,
      }}
    >
      <span />
      <span />
      <span className="relative z-[2] col-span-4 flex min-w-0 items-center gap-3 overflow-hidden pl-2 font-mono text-sm whitespace-nowrap">
        <span className="text-accent">cambios sin confirmar</span>
        {conflicted > 0 && <span className="text-danger">{conflicted} en conflicto</span>}
        {unstaged > 0 && <span className="text-fg-muted">{unstaged} sin preparar</span>}
        {staged > 0 && <span className="text-success">{staged} preparados</span>}
      </span>
    </div>
  );
}

function GraphSkeleton({ columns }: { columns: string }) {
  return (
    <div role="status" aria-label="Cargando historial">
      {Array.from({ length: 14 }, (_, i) => (
        <div
          key={i}
          className="grid items-center"
          style={{ height: ROW_HEIGHT, gridTemplateColumns: columns }}
        >
          <span />
          <span className="flex justify-start pl-4">
            <Skeleton className="size-2.5 rounded-full" />
          </span>
          <Skeleton
            className={cn('mx-2 h-2.5', i % 3 === 0 ? 'w-1/2' : i % 3 === 1 ? 'w-2/3' : 'w-2/5')}
          />
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-2.5 w-14" />
          <Skeleton className="h-2.5 w-12" />
        </div>
      ))}
    </div>
  );
}
