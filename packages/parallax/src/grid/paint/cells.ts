/* A grid's cells: each one's background, highlight, selection, lines and text. A chosen row is tinted as a selection
 * is. A cell whose text has not changed since it was last drawn, and whose row the selection, the choice of rows and
 * the pointer left alone, is not drawn again. */

import type { FrameColumn } from "#frame/columns.ts";
import type { FrameData } from "#frame/frame.ts";
import { screenX } from "#grid/geometry.ts";
import { contains } from "#grid/selection.ts";

import { fillRect, withClip } from "./canvas.ts";
import { cellText } from "./cell-text.ts";
import { translucent } from "./metrics.ts";
import { cellKey } from "./scene.ts";
import type { Pass } from "./scene.ts";
import { lookKey, lookOf, richBehind } from "./rich.ts";
import type { Look } from "./rich.ts";

/** The ring's outer edge stops this short of the cell's right and bottom edges, clear of the column's and row's rules. */
const ringClear = 1;

/** One row being drawn: its view row, its row in the frame, its top, its background, and whether it is chosen, read
 * once for the row rather than for each of its cells. */
interface RowAt {
  readonly frame: FrameData;
  readonly local: number;
  readonly row: number;
  readonly y: number;
  readonly stripe: string;
  readonly chosen: boolean;
}

/** A cell's place: its data column, -1 for the group column, its left and its width. */
interface CellAt {
  readonly column: number;
  readonly x: number;
  readonly width: number;
}

/** What a cell's drawn text is kept with, so that choosing its row or leaving it draws the cell again. */
function rowMark(at: RowAt): string {
  return at.chosen ? "\u0001" : "";
}

/** Whether a cell can be left as it was drawn: the pass redraws only what changed, and its text is unchanged. */
function unchanged(
  pass: Pass,
  row: number,
  drawn: { readonly key: string; readonly text: string },
): boolean {
  return !pass.full && !pass.stale.has(row) && pass.drawn.get(drawn.key) === drawn.text;
}

/** Strokes the focused cell's ring inside it: a stroke is centred on its path, so the path sits half the ring's width
 * in from the cell's top and left edges. The ring is clipped to its row, whose edges are on device pixels: at a ratio
 * such as 1.25 the stroke's smoothed edge would reach into the row above, and a row a scroll copies must hold only its
 * own pixels. */
function ring(pass: Pass, at: RowAt, cell: CellAt): void {
  const { context, theme, metrics } = pass;
  const { width, radius } = metrics.ring;
  const half = width / 2;
  withClip(pass, [0, at.y, pass.width, metrics.rowPx], () => {
    Object.assign(context, { lineWidth: width, strokeStyle: theme.selectionBorder });
    context.beginPath();
    context.roundRect(
      cell.x + half,
      at.y + half,
      cell.width - width - ringClear,
      metrics.rowPx - width - ringClear,
      radius,
    );
    context.stroke();
  });
}

/** Tints a cell whose row is chosen, or that is in the selected range, over its background. */
function cellTint(pass: Pass, at: RowAt, cell: CellAt): void {
  const { theme, metrics, range } = pass;
  const rect = [cell.x, at.y, cell.width, metrics.rowPx] as const;
  if (at.chosen) {
    fillRect(pass, theme.selectionBackground, rect);
  }
  if (range !== null && contains(range, { column: cell.column, row: at.row })) {
    fillRect(pass, theme.selectionBackground, rect);
  }
}

/** Fills a cell's background, highlighting it if its row is under the pointer and marking it if it is selected. */
function cellBackground(pass: Pass, at: RowAt, cell: CellAt): void {
  const { theme, metrics, focus, hover } = pass;
  const rect = [cell.x, at.y, cell.width, metrics.rowPx] as const;
  const fill = hover?.row === at.row ? hover.color : at.stripe;
  if (fill !== theme.background && translucent(fill)) {
    fillRect(pass, theme.background, rect);
  }
  fillRect(pass, fill, rect);
  cellTint(pass, at, cell);
  if (focus !== null && focus.row === at.row && focus.column === cell.column) {
    ring(pass, at, cell);
  }
}

/** Draws the line under a cell, if the theme has one, and the cell's right border. */
function cellLines(pass: Pass, at: RowAt, cell: CellAt): void {
  const { rowRule, theme, metrics } = pass;
  if (rowRule !== null) {
    fillRect(pass, rowRule, [cell.x, at.y + metrics.rowPx - 1, cell.width, 1]);
  }
  fillRect(pass, theme.columnBorder, [cell.x + cell.width - 1, at.y, 1, metrics.rowPx]);
}

/** Where a cell shows, across: the checkboxes and the group column anywhere, a pinned column beside the group column,
 * and a scrolling column past the pinned ones. */
function columnArea(pass: Pass, column: number): readonly [number, number] {
  const { geometry } = pass;
  if (column < 0) {
    return [0, pass.width];
  }
  return column < geometry.pinned
    ? [geometry.selectPx + geometry.treePx, geometry.frozenPx]
    : [geometry.frozenPx, pass.width];
}

/** Remembers what a cell drawn showed, and counts its pixels as far as it shows: within the body and its columns'
 * area. */
function keepCell(
  pass: Pass,
  {
    at,
    cell,
    drawn,
  }: {
    readonly at: RowAt;
    readonly cell: CellAt;
    readonly drawn: { readonly key: string; readonly text: string };
  },
): void {
  const { metrics } = pass;
  pass.drawn.set(drawn.key, drawn.text);
  const [left, right] = columnArea(pass, cell.column);
  const body = [left, metrics.headerPx, right - left, pass.bodyBottom - metrics.headerPx] as const;
  pass.tally.cell([cell.x, at.y, cell.width, metrics.rowPx], body);
}

/** Where data column `column`'s cell is across. */
function cellOf(pass: Pass, column: number): CellAt {
  return {
    column,
    width: pass.geometry.width(column),
    x: screenX(pass.geometry, column, pass.scrollLeft),
  };
}

/** Paints a data cell: its background, what its look puts behind its text, its text and its lines, and remembers it. */
function paintCell(
  pass: Pass,
  at: RowAt,
  {
    cell,
    data,
    drawn,
    look,
  }: { cell: CellAt; data: FrameColumn; drawn: { key: string; text: string }; look: Look | null },
): void {
  cellBackground(pass, at, cell);
  const ink = look === null ? null : richBehind(pass, { at, cell }, look);
  cellText(pass, at, { cell, data, ink, key: drawn.key, look });
  cellLines(pass, at, cell);
  keepCell(pass, { at, cell, drawn });
}

/** Draws data column `column`'s cell in a row, if its text, its row or its look changed. Returns whether it drew it. */
function dataCell(pass: Pass, at: RowAt, column: number): boolean {
  const data = at.frame.columns[column - at.frame.firstColumn];
  const look = data === undefined ? null : lookOf(pass, at, data);
  const drawn = {
    key: cellKey(at.row, column),
    text: (data?.text(at.local) ?? "") + rowMark(at) + lookKey(look),
  };
  if (data === undefined || unchanged(pass, at.row, drawn)) {
    return false;
  }
  paintCell(pass, at, { cell: cellOf(pass, column), data, drawn, look });
  return true;
}

export { cellBackground, cellLines, dataCell, keepCell, rowMark, unchanged };
export type { CellAt, RowAt };
