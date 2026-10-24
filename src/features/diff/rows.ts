import type { DiffLine, FileDiff } from '@/api';

export type UnifiedRow =
  | { type: 'hunk'; hunk: number; header: string }
  | { type: 'line'; hunk: number; line: DiffLine };

export type SplitRow =
  | { type: 'hunk'; hunk: number; header: string }
  | { type: 'pair'; hunk: number; left: DiffLine | null; right: DiffLine | null };

export function unifiedRows(diff: FileDiff): UnifiedRow[] {
  const rows: UnifiedRow[] = [];
  diff.hunks.forEach((hunk, index) => {
    rows.push({ type: 'hunk', hunk: index, header: hunk.header });
    for (const line of hunk.lines) rows.push({ type: 'line', hunk: index, line });
  });
  return rows;
}

/**
 * Side-by-side rows: context lines appear on both sides; a run of deletions
 * followed by additions is paired line by line, so a modified line sits next
 * to its new version.
 */
export function splitRows(diff: FileDiff): SplitRow[] {
  const rows: SplitRow[] = [];
  diff.hunks.forEach((hunk, index) => {
    rows.push({ type: 'hunk', hunk: index, header: hunk.header });
    let deleted: DiffLine[] = [];
    let added: DiffLine[] = [];
    const flush = () => {
      const count = Math.max(deleted.length, added.length);
      for (let i = 0; i < count; i++) {
        rows.push({ type: 'pair', hunk: index, left: deleted[i] ?? null, right: added[i] ?? null });
      }
      deleted = [];
      added = [];
    };
    for (const line of hunk.lines) {
      if (line.kind === 'deleted') {
        if (added.length > 0) flush();
        deleted.push(line);
      } else if (line.kind === 'added') {
        added.push(line);
      } else {
        flush();
        rows.push({ type: 'pair', hunk: index, left: line, right: line });
      }
    }
    flush();
  });
  return rows;
}

function isChange(row: UnifiedRow | SplitRow): boolean {
  if (row.type === 'hunk') return false;
  if (row.type === 'line') return row.line.kind !== 'context';
  return row.left?.kind !== 'context' || row.right?.kind !== 'context';
}

/** Index of the first row of every contiguous block of changes. */
export function changeBlocks(rows: (UnifiedRow | SplitRow)[]): number[] {
  const starts: number[] = [];
  let inBlock = false;
  rows.forEach((row, i) => {
    const change = isChange(row);
    if (change && !inBlock) starts.push(i);
    inBlock = change;
  });
  return starts;
}

/** Longest line, in characters, to size the horizontally scrollable area. */
export function longestLine(diff: FileDiff): number {
  let max = 0;
  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) max = Math.max(max, expandTabs(line.content).length);
  }
  return max;
}

export function expandTabs(text: string, size = 4): string {
  return text.includes('\t') ? text.replace(/\t/g, ' '.repeat(size)) : text;
}
