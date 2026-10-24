import type { GraphEdge } from '@/api';
import { GRAPH_PADDING, LANE_WIDTH, MAX_VISIBLE_LANES, ROW_HEIGHT } from './constants';

/** Horizontal center of a lane, relative to the graph column. */
export function laneX(column: number): number {
  return GRAPH_PADDING + column * LANE_WIDTH + LANE_WIDTH / 2;
}

/** Vertical center of the row at `offset` rows below the canvas top. */
export function rowCenterY(offset: number): number {
  return offset * ROW_HEIGHT + ROW_HEIGHT / 2;
}

/** Width of the graph column for a graph with `maxColumns` lanes. */
export function graphColumnWidth(maxColumns: number): number {
  const lanes = Math.min(Math.max(maxColumns, 1), MAX_VISIBLE_LANES);
  return lanes * LANE_WIDTH + GRAPH_PADDING * 2;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: number;
}

/**
 * Segment for an edge that enters the row at `offset` (rows below the canvas
 * top): it starts at the center of the previous row and ends at this one's.
 */
export function edgeSegment(edge: GraphEdge, offset: number): Segment {
  return {
    x1: laneX(edge.from),
    y1: rowCenterY(offset - 1),
    x2: laneX(edge.to),
    y2: rowCenterY(offset),
    color: edge.color,
  };
}

/** Control points of the S-curve used when an edge changes lane. */
export function curveControls(s: Segment): [number, number, number, number] {
  const bend = (s.y2 - s.y1) * 0.6;
  return [s.x1, s.y1 + bend, s.x2, s.y2 - bend];
}
