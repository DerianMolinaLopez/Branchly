import { describe, expect, it } from 'vitest';
import type { DiffLine, FileDiff } from '@/api';
import { changeBlocks, longestLine, splitRows, unifiedRows } from './rows';

const ctx = (n: number, content = `c${n}`): DiffLine => ({
  kind: 'context',
  oldLine: n,
  newLine: n,
  content,
  noNewline: false,
});
const del = (n: number, content = `d${n}`): DiffLine => ({
  kind: 'deleted',
  oldLine: n,
  newLine: null,
  content,
  noNewline: false,
});
const add = (n: number, content = `a${n}`): DiffLine => ({
  kind: 'added',
  oldLine: null,
  newLine: n,
  content,
  noNewline: false,
});

const diff: FileDiff = {
  path: 'f.txt',
  oldPath: null,
  kind: 'modified',
  binary: false,
  truncated: false,
  hunks: [
    {
      header: '@@ -1,5 +1,5 @@',
      oldStart: 1,
      oldLines: 5,
      newStart: 1,
      newLines: 5,
      lines: [ctx(1), del(2), del(3), add(2), ctx(4), add(5), ctx(6)],
    },
  ],
};

describe('diff rows', () => {
  it('flattens hunks for the unified view', () => {
    const rows = unifiedRows(diff);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toEqual({ type: 'hunk', hunk: 0, header: '@@ -1,5 +1,5 @@' });
  });

  it('pairs deletions with following additions in the split view', () => {
    const rows = splitRows(diff).filter((r) => r.type === 'pair');
    expect(rows.map((r) => [r.left?.content ?? null, r.right?.content ?? null])).toEqual([
      ['c1', 'c1'],
      ['d2', 'a2'],
      ['d3', null],
      ['c4', 'c4'],
      [null, 'a5'],
      ['c6', 'c6'],
    ]);
  });

  it('finds the start of every change block', () => {
    expect(changeBlocks(unifiedRows(diff))).toEqual([2, 6]);
    expect(changeBlocks(splitRows(diff))).toEqual([2, 5]);
  });

  it('measures the longest line with tabs expanded', () => {
    const [first] = diff.hunks;
    if (!first) throw new Error('fixture has a hunk');
    const tabbed: FileDiff = { ...diff, hunks: [{ ...first, lines: [ctx(1, '\tx')] }] };
    expect(longestLine(tabbed)).toBe(5);
  });
});
