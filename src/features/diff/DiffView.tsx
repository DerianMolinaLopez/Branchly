import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronDown,
  ChevronUp,
  Columns2,
  ExternalLink,
  Minus,
  Plus,
  Rows2,
  Undo2,
  X,
} from 'lucide-react';
import { memo, useMemo, useRef, useState } from 'react';
import {
  commitsApi,
  keys,
  stagingApi,
  systemApi,
  type DiffLine,
  type FileDiff,
  type HunkRef,
} from '@/api';
import { cn } from '@/lib/cn';
import { languageFor } from '@/lib/language';
import { splitPath } from '@/lib/path';
import { SHORTCUTS } from '@/lib/shortcuts';
import { useHotkey } from '@/lib/useHotkey';
import { CHANGE_KIND } from '@/features/commit/changeKind';
import { confirm } from '@/features/dialogs/confirm';
import { runAction } from '@/features/repo/actions';
import { useRepoActive } from '@/features/repo/context';
import { useSettings } from '@/stores/settings';
import type { DiffSource } from '@/stores/workspace';
import { Button, EmptyState, IconButton, SegmentedControl, SkeletonRows, toast } from '@/ui';
import { useHighlighter } from './highlight';
import {
  changeBlocks,
  expandTabs,
  longestLine,
  splitRows,
  unifiedRows,
  type SplitRow,
  type UnifiedRow,
} from './rows';

const LINE_HEIGHT = 20;
const HUNK_HEIGHT = 30;
const CHAR_WIDTH = 7.25;
const GUTTER = 48;
const SIGN = 20;

function useFileDiff(repoId: string, source: DiffSource) {
  return useQuery({
    queryKey:
      source.type === 'commit'
        ? keys.commitDiff(repoId, source.sha, source.path)
        : keys.workingDiff(repoId, source.path, source.staged),
    queryFn: () =>
      source.type === 'commit'
        ? commitsApi.fileDiff(repoId, source.sha, source.path, source.oldPath)
        : stagingApi.diff(repoId, source.path, source.staged),
    staleTime: source.type === 'commit' ? Infinity : undefined,
  });
}

/** Unified or side-by-side diff of one file, with hunk actions for the working tree. */
export function DiffView({
  repoId,
  source,
  onClose,
}: {
  repoId: string;
  source: DiffSource;
  onClose?: () => void;
}) {
  const diff = useFileDiff(repoId, source);
  const mode = useSettings((s) => s.diffMode);
  const setMode = useSettings((s) => s.setDiffMode);
  const active = useRepoActive();

  useHotkey(SHORTCUTS.close, () => onClose?.(), active && onClose !== undefined);
  useHotkey(
    SHORTCUTS.toggleDiffMode,
    () => {
      setMode(mode === 'unified' ? 'split' : 'unified');
    },
    active,
  );

  const { dir, name } = splitPath(source.path);
  const kind = diff.data ? CHANGE_KIND[diff.data.kind] : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas/40">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line pr-2 pl-3">
        {kind && (
          <span
            className={cn('font-mono text-xs font-semibold', kind.className)}
            title={kind.label}
          >
            {kind.letter}
          </span>
        )}
        <h2
          className="min-w-0 flex-1 truncate font-mono text-sm"
          title={source.path}
          data-selectable
        >
          <span className="text-fg-subtle">{dir}</span>
          <span className="text-fg">{name}</span>
          {diff.data?.oldPath && (
            <span className="ml-2 text-fg-subtle">desde {diff.data.oldPath}</span>
          )}
          {source.type === 'working' && (
            <span className="ml-2 font-sans text-xs text-fg-muted">
              {source.staged ? 'preparado' : 'sin preparar'}
            </span>
          )}
        </h2>
        {source.type === 'working' && (
          <FileActions repoId={repoId} path={source.path} staged={source.staged} />
        )}
        <SegmentedControl
          label="Modo del diff"
          value={mode}
          onChange={setMode}
          segments={[
            { value: 'unified', label: <Rows2 />, title: 'Vista unificada' },
            { value: 'split', label: <Columns2 />, title: 'Lado a lado' },
          ]}
        />
        {source.type === 'working' && (
          <IconButton
            label="Abrir en el editor"
            icon={<ExternalLink />}
            onClick={() => {
              systemApi.openInEditor(repoId, source.path).catch((error: unknown) => {
                toast.error('No se pudo abrir el archivo', { description: String(error) });
              });
            }}
          />
        )}
        {onClose && (
          <IconButton label="Cerrar" shortcut={SHORTCUTS.close} icon={<X />} onClick={onClose} />
        )}
      </header>

      {diff.isPending ? (
        <SkeletonRows count={12} className="p-4" />
      ) : diff.isError ? (
        <EmptyState
          tone="error"
          title="no se pudo cargar el diff"
          description={diff.error.message}
        />
      ) : diff.data.binary ? (
        <EmptyState
          title="archivo binario"
          description="Branchly no muestra el contenido de archivos binarios."
        />
      ) : diff.data.hunks.length === 0 ? (
        <EmptyState
          title="sin cambios de contenido"
          description={
            source.type === 'working'
              ? 'No quedan cambios en esta vista del archivo.'
              : 'El archivo solo cambió de permisos o de nombre.'
          }
        />
      ) : (
        <DiffBody repoId={repoId} source={source} diff={diff.data} mode={mode} active={active} />
      )}
    </div>
  );
}

function FileActions({ repoId, path, staged }: { repoId: string; path: string; staged: boolean }) {
  if (staged) {
    return (
      <Button
        size="sm"
        variant="ghost"
        icon={<Minus />}
        onClick={() => void runAction(repoId, () => stagingApi.unstage(repoId, [path]))}
      >
        Quitar del stage
      </Button>
    );
  }
  return (
    <>
      <Button
        size="sm"
        variant="danger-ghost"
        icon={<Undo2 />}
        onClick={async () => {
          const ok = await confirm({
            title: 'Descartar los cambios del archivo',
            description: 'El archivo vuelve a su última versión preparada o confirmada.',
            consequences: [`Todos los cambios sin preparar de ${path}`],
            confirmLabel: 'Descartar cambios',
          });
          if (ok)
            await runAction(repoId, () => stagingApi.discard(repoId, [path]), {
              success: 'Cambios descartados',
            });
        }}
      >
        Descartar
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon={<Plus />}
        onClick={() => void runAction(repoId, () => stagingApi.stage(repoId, [path]))}
      >
        Preparar archivo
      </Button>
    </>
  );
}

function DiffBody({
  repoId,
  source,
  diff,
  mode,
  active,
}: {
  repoId: string;
  source: DiffSource;
  diff: FileDiff;
  mode: 'unified' | 'split';
  active: boolean;
}) {
  const rows = useMemo(
    () => (mode === 'unified' ? unifiedRows(diff) : splitRows(diff)),
    [diff, mode],
  );
  const blocks = useMemo(() => changeBlocks(rows), [rows]);
  const highlight = useHighlighter(languageFor(diff.path));
  const scrollRef = useRef<HTMLDivElement>(null);
  const [block, setBlock] = useState(-1);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i]?.type === 'hunk' ? HUNK_HEIGHT : LINE_HEIGHT),
    overscan: 30,
  });

  const goTo = (delta: number) => {
    if (blocks.length === 0) return;
    const next =
      block === -1
        ? delta > 0
          ? 0
          : blocks.length - 1
        : (block + delta + blocks.length) % blocks.length;
    setBlock(next);
    const row = blocks[next];
    if (row !== undefined) virtualizer.scrollToIndex(row, { align: 'center' });
  };
  useHotkey(SHORTCUTS.nextChange, () => goTo(1), active);
  useHotkey(SHORTCUTS.prevChange, () => goTo(-1), active);

  const chars = longestLine(diff);
  const side = GUTTER + SIGN + chars * CHAR_WIDTH + 24;
  const minWidth = mode === 'unified' ? GUTTER * 2 + SIGN + chars * CHAR_WIDTH + 32 : side * 2;
  const working = source.type === 'working' ? source : null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="absolute right-5 bottom-4 z-10 flex items-center gap-0.5 rounded-control border border-line bg-raised/95 p-0.5 shadow-overlay">
        <span className="px-1.5 font-mono text-xs text-fg-muted tabular-nums">
          {blocks.length === 0
            ? 'sin cambios'
            : `${block === -1 ? '–' : block + 1}/${blocks.length}`}
        </span>
        <IconButton
          size="sm"
          label="Cambio anterior"
          shortcut={SHORTCUTS.prevChange}
          icon={<ChevronUp />}
          onClick={() => goTo(-1)}
        />
        <IconButton
          size="sm"
          label="Cambio siguiente"
          shortcut={SHORTCUTS.nextChange}
          icon={<ChevronDown />}
          onClick={() => goTo(1)}
        />
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto" data-selectable>
        <div className="relative" style={{ height: virtualizer.getTotalSize(), minWidth }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            return (
              <div
                key={item.key}
                className="absolute inset-x-0 top-0"
                style={{ transform: `translateY(${item.start}px)`, height: item.size }}
              >
                {row.type === 'hunk' ? (
                  <HunkHeader
                    repoId={repoId}
                    diff={diff}
                    hunk={row.hunk}
                    header={row.header}
                    working={working}
                  />
                ) : row.type === 'line' ? (
                  <UnifiedLine line={row.line} highlight={highlight} />
                ) : (
                  <SplitPair row={row} highlight={highlight} />
                )}
              </div>
            );
          })}
        </div>
        {diff.truncated && (
          <p className="sticky bottom-0 left-0 bg-warning-soft px-4 py-1.5 text-sm text-warning">
            El diff es demasiado grande y se muestra recortado.
          </p>
        )}
      </div>
    </div>
  );
}

function HunkHeader({
  repoId,
  diff,
  hunk,
  header,
  working,
}: {
  repoId: string;
  diff: FileDiff;
  hunk: number;
  header: string;
  working: { path: string; staged: boolean } | null;
}) {
  const data = diff.hunks[hunk];
  const ref: HunkRef | null = data
    ? {
        index: hunk,
        oldStart: data.oldStart,
        oldLines: data.oldLines,
        newStart: data.newStart,
        newLines: data.newLines,
      }
    : null;
  const run = (task: () => Promise<null>, errorTitle: string) => {
    void runAction(repoId, task, { errorTitle });
  };

  return (
    <div className="sticky left-0 flex h-full items-center gap-2 border-y border-line bg-teal/40 px-3">
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted">{header}</span>
      {working && ref && (
        <span className="flex shrink-0 gap-1">
          {working.staged ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<Minus />}
              onClick={() =>
                run(
                  () => stagingApi.unstageHunk(repoId, working.path, ref),
                  'No se pudo quitar el bloque',
                )
              }
            >
              Quitar bloque
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="danger-ghost"
                icon={<Undo2 />}
                onClick={async () => {
                  const added = data?.lines.filter((l) => l.kind === 'added').length ?? 0;
                  const removed = data?.lines.filter((l) => l.kind === 'deleted').length ?? 0;
                  const ok = await confirm({
                    title: 'Descartar este bloque',
                    description: `El bloque ${header.split('@@')[1]?.trim() ?? ''} vuelve a su versión anterior.`,
                    consequences: [
                      `${added} línea(s) añadidas y ${removed} eliminadas en ${working.path}`,
                    ],
                    confirmLabel: 'Descartar bloque',
                  });
                  if (ok)
                    run(
                      () => stagingApi.discardHunk(repoId, working.path, ref),
                      'No se pudo descartar el bloque',
                    );
                }}
              >
                Descartar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus />}
                onClick={() =>
                  run(
                    () => stagingApi.stageHunk(repoId, working.path, ref),
                    'No se pudo preparar el bloque',
                  )
                }
              >
                Preparar bloque
              </Button>
            </>
          )}
        </span>
      )}
    </div>
  );
}

const lineTone = {
  added: {
    row: 'bg-diff-add-bg',
    gutter: 'bg-diff-add-gutter text-diff-add/80',
    sign: 'text-diff-add',
    mark: '+',
  },
  deleted: {
    row: 'bg-diff-del-bg',
    gutter: 'bg-diff-del-gutter text-diff-del/80',
    sign: 'text-diff-del',
    mark: '−',
  },
  context: { row: '', gutter: 'text-fg-subtle', sign: 'text-fg-subtle', mark: ' ' },
} as const;

function Code({
  line,
  highlight,
}: {
  line: DiffLine;
  highlight: ((code: string) => string) | null;
}) {
  const text = expandTabs(line.content);
  return (
    <span className="pr-4 whitespace-pre text-fg-secondary">
      {highlight ? <span dangerouslySetInnerHTML={{ __html: highlight(text) }} /> : text}
      {line.noNewline && (
        <span
          className="ml-2 text-2xs text-fg-subtle select-none"
          title="Sin salto de línea al final del archivo"
        >
          ⏎̸
        </span>
      )}
    </span>
  );
}

const UnifiedLine = memo(function UnifiedLine({
  line,
  highlight,
}: {
  line: DiffLine;
  highlight: ((code: string) => string) | null;
}) {
  const tone = lineTone[line.kind];
  return (
    <div className={cn('flex h-5 font-mono text-sm leading-5', tone.row)}>
      <span className={cn('sticky left-0 flex shrink-0 select-none', tone.gutter)}>
        <span className="w-12 bg-canvas/40 pr-2 text-right text-xs leading-5">
          {line.oldLine ?? ''}
        </span>
        <span className="w-12 bg-canvas/40 pr-2 text-right text-xs leading-5">
          {line.newLine ?? ''}
        </span>
      </span>
      <span className={cn('w-5 shrink-0 text-center select-none', tone.sign)}>{tone.mark}</span>
      <Code line={line} highlight={highlight} />
    </div>
  );
});

const SplitPair = memo(function SplitPair({
  row,
  highlight,
}: {
  row: Extract<SplitRow | UnifiedRow, { type: 'pair' }>;
  highlight: ((code: string) => string) | null;
}) {
  return (
    <div className="grid h-5 grid-cols-2 font-mono text-sm leading-5">
      <SplitSide line={row.left} number={row.left?.oldLine ?? null} highlight={highlight} />
      <SplitSide
        line={row.right}
        number={row.right?.newLine ?? null}
        highlight={highlight}
        border
      />
    </div>
  );
});

function SplitSide({
  line,
  number,
  highlight,
  border,
}: {
  line: DiffLine | null;
  number: number | null;
  highlight: ((code: string) => string) | null;
  border?: boolean;
}) {
  if (!line) return <div className={cn('bg-canvas/60', border && 'border-l border-line')} />;
  const tone = lineTone[line.kind];
  return (
    <div className={cn('flex min-w-0 overflow-hidden', tone.row, border && 'border-l border-line')}>
      <span
        className={cn(
          'w-12 shrink-0 bg-canvas/40 pr-2 text-right text-xs leading-5 select-none',
          tone.gutter,
        )}
      >
        {number ?? ''}
      </span>
      <span className={cn('w-5 shrink-0 text-center select-none', tone.sign)}>{tone.mark}</span>
      <Code line={line} highlight={highlight} />
    </div>
  );
}
