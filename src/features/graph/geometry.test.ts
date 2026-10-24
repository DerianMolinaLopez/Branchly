import { describe, expect, it, vi } from 'vitest';
import type { GraphRow } from '@/api';
import { GRAPH_PADDING, LANE_WIDTH, MAX_VISIBLE_LANES, ROW_HEIGHT } from './constants';
import { drawGraph, type GraphPalette } from './draw';
import {
  columnLayout,
  curveControls,
  edgeSegment,
  graphColumnWidth,
  laneX,
  rowCenterY,
} from './geometry';

describe('graph geometry', () => {
  it('places lanes and rows on a regular grid', () => {
    expect(laneX(0)).toBe(GRAPH_PADDING + LANE_WIDTH / 2);
    expect(laneX(3) - laneX(2)).toBe(LANE_WIDTH);
    expect(rowCenterY(0)).toBe(ROW_HEIGHT / 2);
    expect(rowCenterY(2) - rowCenterY(1)).toBe(ROW_HEIGHT);
  });

  it('edges span from the previous row center to the current one', () => {
    const s = edgeSegment({ from: 1, to: 0, color: 3 }, 5);
    expect(s).toEqual({
      x1: laneX(1),
      y1: rowCenterY(4),
      x2: laneX(0),
      y2: rowCenterY(5),
      color: 3,
    });
  });

  it('curves leave and enter vertically', () => {
    const s = edgeSegment({ from: 0, to: 2, color: 0 }, 1);
    const [c1x, c1y, c2x, c2y] = curveControls(s);
    expect(c1x).toBe(s.x1);
    expect(c2x).toBe(s.x2);
    expect(c1y).toBeGreaterThan(s.y1);
    expect(c2y).toBeLessThan(s.y2);
  });

  it('shrinks the fixed columns on narrow lists', () => {
    const wide = columnLayout(1400);
    const narrow = columnLayout(700);
    expect(wide.compact).toBe(false);
    expect(narrow.compact).toBe(true);
    expect(narrow.refs + narrow.author + narrow.date + narrow.sha).toBeLessThan(
      wide.refs + wide.author + wide.date + wide.sha,
    );
    expect(columnLayout(500).sha).toBe(0);
  });

  it('caps the graph column width', () => {
    expect(graphColumnWidth(0)).toBe(graphColumnWidth(1));
    expect(graphColumnWidth(1000)).toBe(MAX_VISIBLE_LANES * LANE_WIDTH + GRAPH_PADDING * 2);
  });
});

function row(id: string, column: number, edges: GraphRow['edges'], isMerge = false): GraphRow {
  return {
    index: 0,
    column,
    color: column,
    edges,
    isMerge,
    refs: [],
    commit: {
      id,
      shortId: id.slice(0, 7),
      summary: id,
      parents: [],
      author: { name: 'A', email: 'a@b.c', timestamp: 0, offsetMinutes: 0 },
    },
  };
}

function fakeContext() {
  const calls: string[] = [];
  const handler: ProxyHandler<Record<string, unknown>> = {
    get: (target, prop: string) => {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push(
          `${prop}(${args.map((a) => (typeof a === 'number' ? a.toFixed(1) : String(a))).join(',')})`,
        );
      };
    },
    set: (target, prop: string, value) => {
      target[prop] = value;
      return true;
    },
  };
  return { ctx: new Proxy({}, handler) as unknown as CanvasRenderingContext2D, calls };
}

const palette: GraphPalette = {
  lanes: ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'],
  background: 'bg',
  accent: 'accent',
  selection: 'white',
};

describe('drawGraph', () => {
  it('strokes one path per lane color and draws every node', () => {
    const { ctx, calls } = fakeContext();
    const stroke = vi.fn();
    Object.assign(ctx, { stroke });
    drawGraph(ctx, {
      rows: [
        row('a', 0, []),
        row('b', 1, [
          { from: 0, to: 0, color: 0 },
          { from: 0, to: 1, color: 1 },
        ]),
        row(
          'c',
          0,
          [
            { from: 0, to: 0, color: 0 },
            { from: 1, to: 0, color: 1 },
          ],
          true,
        ),
      ],
      firstOffset: 0,
      width: 100,
      height: 96,
      palette,
      headId: 'a',
      selectedId: 'c',
      wip: null,
    });
    // 2 edge colors + HEAD ring + merge ring + selection ring.
    expect(stroke).toHaveBeenCalledTimes(5);
    expect(calls.filter((c) => c.startsWith('bezierCurveTo'))).toHaveLength(2);
    expect(calls.filter((c) => c.startsWith('arc'))).toHaveLength(3 * 2 + 1 + 1);
  });
});
