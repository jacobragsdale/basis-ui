/* What is under the pointer on a grid's canvas: the header or a row, a column, a column's edge, the funnel that opens
 * its menu, or a group's expand marker. */

import type { FrameData } from "#frame/frame.ts";

import { columnAt, screenX } from "./geometry.ts";
import type { ColumnGeometry, RowGeometry } from "./geometry.ts";
import type { Metrics } from "./paint/metrics.ts";

/** How close to a header edge, in pixels, the pointer starts a resize. */
const edgePx = 4;
/** How far left of a group's marker a press still toggles it. */
const markerSlop = 4;

/** Where the pointer is. */
interface Hit {
  readonly header: boolean;
  /** The view row, for the body. */
  readonly row: number | null;
  /** -1 for the group column, a data column, or null past the last column. */
  readonly column: number | null;
  /** The column whose right edge is under the pointer in the header, -1 for the group column. */
  readonly edge: number | null;
  /** Whether the pointer is on the header's funnel, which opens the column's menu. */
  readonly funnel: boolean;
}

/** What hit testing reads: the canvas's geometry and scroll, and which columns have a menu. */
interface Surface {
  readonly metrics: Metrics;
  readonly geometry: ColumnGeometry;
  readonly rows: RowGeometry;
  readonly scrollTop: number;
  readonly scrollLeft: number;
  /** The visible area's height. */
  readonly height: number;
  readonly totalRows: number;
  /** Whether a totals row is drawn along the bottom. */
  readonly footer: boolean;
  readonly hasMenu: (column: number) => boolean;
}

/** The part of data column `column`'s header at `x`: the edge of a column, the funnel, or neither. */
function headerPart(surface: Surface, column: number, x: number): number | "funnel" | null {
  const { geometry } = surface;
  const left = screenX(geometry, column, surface.scrollLeft);
  const right = left + geometry.width(column);
  if (right - x <= edgePx) {
    return column;
  }
  if (x - left <= edgePx && column > 0) {
    return column - 1;
  }
  return right - x <= surface.metrics.funnelPx && surface.hasMenu(column) ? "funnel" : null;
}

/** The view row at `y`, or null on the header, on the totals row, or past the last row. */
function rowAt(surface: Surface, y: number): number | null {
  const { metrics } = surface;
  const onFooter = surface.footer && y >= surface.height - metrics.rowPx;
  if (y < metrics.headerPx || onFooter) {
    return null;
  }
  const row =
    surface.rows.firstRow(surface.scrollTop, surface.height) +
    Math.floor((y - metrics.headerPx) / metrics.rowPx);
  return row < surface.totalRows ? row : null;
}

/** The edge in the header at `x` in the group column, if `x` is on it. */
function treeEdge(surface: Surface, x: number): number | null {
  return surface.geometry.treePx - x <= edgePx ? -1 : null;
}

/** What is at `x`, `y` on the canvas. */
function hitAt(surface: Surface, x: number, y: number): Hit {
  const header = y < surface.metrics.headerPx;
  const column = columnAt(surface.geometry, x, surface.scrollLeft);
  const hit = { column, edge: null, funnel: false, header, row: rowAt(surface, y) };
  if (!header || column === null) {
    return hit;
  }
  if (column === -1) {
    return { ...hit, edge: treeEdge(surface, x) };
  }
  const part = headerPart(surface, column, x);
  return part === "funnel" ? { ...hit, funnel: true } : { ...hit, edge: part };
}

/** Whether `x` falls on the expand marker of view row `row`'s group cell. */
function onMarker(
  { frame, metrics }: { readonly frame: FrameData | null; readonly metrics: Metrics },
  row: number,
  x: number,
): boolean {
  const tree = frame?.tree ?? null;
  const local = frame === null ? -1 : row - frame.firstRow;
  if (
    frame === null ||
    tree === null ||
    local < 0 ||
    local >= frame.rowCount ||
    tree.expanded(local) === null
  ) {
    return false;
  }
  const left = metrics.padding + tree.depth(local) * metrics.indent;
  return x >= left - markerSlop && x <= left + metrics.markerPx;
}

export { hitAt, onMarker };
export type { Hit, Surface };
