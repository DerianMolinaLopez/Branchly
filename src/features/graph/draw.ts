import type { GraphRow } from '@/api';
import { NODE_RADIUS, ROW_HEIGHT } from './constants';
import { curveControls, edgeSegment, laneX, rowCenterY, type Segment } from './geometry';

export interface GraphPalette {
  lanes: string[];
  background: string;
  accent: string;
  selection: string;
}

export interface DrawParams {
  /** Graph rows to draw; index 0 sits at `firstOffset` rows from the top. */
  rows: (GraphRow | undefined)[];
  /** Row offset (from the canvas top) of `rows[0]`. */
  firstOffset: number;
  width: number;
  height: number;
  palette: GraphPalette;
  headId: string | null;
  selectedId: string | null;
  /** Draws the "uncommitted changes" node on the row above the first one. */
  wip: { column: number; connect: boolean } | null;
}

/** Reads the lane palette from the design tokens. */
export function readPalette(element: Element): GraphPalette {
  const style = getComputedStyle(element);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    lanes: Array.from({ length: 8 }, (_, i) => token(`--color-lane-${i}`, '#22e0f0')),
    background: token('--color-canvas', '#071821'),
    accent: token('--color-accent', '#22e0f0'),
    selection: token('--color-fg', '#ffffff'),
  };
}

/** Draws edges and nodes. Pure apart from the canvas, so it is easy to test. */
export function drawGraph(ctx: CanvasRenderingContext2D, params: DrawParams): void {
  const { rows, firstOffset, width, height, palette } = params;
  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Batch segments per color: eight strokes per frame regardless of size.
  const byColor = new Map<number, Segment[]>();
  rows.forEach((row, i) => {
    if (!row) return;
    for (const edge of row.edges) {
      const segment = edgeSegment(edge, firstOffset + i);
      const list = byColor.get(edge.color);
      if (list) list.push(segment);
      else byColor.set(edge.color, [segment]);
    }
  });

  ctx.lineWidth = 2;
  for (const [color, segments] of byColor) {
    const stroke = palette.lanes[color % palette.lanes.length] ?? palette.accent;
    ctx.strokeStyle = stroke;
    ctx.shadowColor = stroke;
    ctx.shadowBlur = 5;
    ctx.beginPath();
    for (const s of segments) {
      ctx.moveTo(s.x1, s.y1);
      if (s.x1 === s.x2) {
        ctx.lineTo(s.x2, s.y2);
      } else {
        const [c1x, c1y, c2x, c2y] = curveControls(s);
        ctx.bezierCurveTo(c1x, c1y, c2x, c2y, s.x2, s.y2);
      }
    }
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  if (params.wip) drawWip(ctx, params, params.wip);

  rows.forEach((row, i) => {
    if (row) drawNode(ctx, row, firstOffset + i, params);
  });
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  row: GraphRow,
  offset: number,
  params: DrawParams,
) {
  const { palette } = params;
  const x = laneX(row.column);
  const y = rowCenterY(offset);
  const color = palette.lanes[row.color % palette.lanes.length] ?? palette.accent;
  const isHead = row.commit.id === params.headId;

  if (isHead) {
    ctx.save();
    ctx.shadowColor = palette.accent;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 1.5;
    circle(ctx, x, y, NODE_RADIUS + 4);
    ctx.stroke();
    ctx.restore();
  }

  // A halo in the background color detaches the node from passing lines.
  ctx.fillStyle = palette.background;
  circle(ctx, x, y, NODE_RADIUS + 2);
  ctx.fill();

  if (row.isMerge) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    circle(ctx, x, y, NODE_RADIUS - 1);
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    circle(ctx, x, y, NODE_RADIUS);
    ctx.fill();
  }

  if (row.commit.id === params.selectedId) {
    ctx.strokeStyle = palette.selection;
    ctx.lineWidth = 1.5;
    circle(ctx, x, y, NODE_RADIUS + 3.5);
    ctx.stroke();
  }
}

function drawWip(
  ctx: CanvasRenderingContext2D,
  params: DrawParams,
  wip: { column: number; connect: boolean },
) {
  const x = laneX(wip.column);
  const y = rowCenterY(params.firstOffset - 1);
  ctx.save();
  ctx.strokeStyle = params.palette.accent;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  if (wip.connect) {
    ctx.beginPath();
    ctx.moveTo(x, y + NODE_RADIUS + 1);
    ctx.lineTo(x, y + ROW_HEIGHT - NODE_RADIUS - 2);
    ctx.stroke();
  }
  circle(ctx, x, y, NODE_RADIUS + 0.5);
  ctx.fillStyle = params.palette.background;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}
