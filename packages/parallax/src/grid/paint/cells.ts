/* A grid's cells: each one's background, highlight, selection, lines and text. A chosen row is tinted as a selection
 * is. A cell whose text has not changed since it was last drawn, and whose row the selection, the choice of rows and
 * the pointer left alone, is not drawn again. */

import { isNegativeText } from "#format.ts";
import type { CellFlag } from "#frame/cell.ts";
import type { FrameColumn } from "#frame/columns.ts";
import type { FrameData } from "#frame/frame.ts";
import type { RowKind } from "#frame/tree.ts";
import { highlightRanges } from "#grid/filters.ts";
import type { Ranges } from "#grid/filters.ts";
import { screenX } from "#grid/geometry.ts";
import { contains } from "#grid/selection.ts";

import { fillRect } from "./canvas.ts";
import { translucent } from "./metrics.ts";
import { cellKey } from "./scene.ts";
import type { Pass } from "./scene.ts";
import { clipText } from "./text.ts";

const flagNotes: Readonly<Record<CellFlag, string | null>> = {
  mixed: "This group combines values in different units, so they are not added.",
  ok: null,
  overflow: "The exact result needs more than 38 digits, so it is not shown.",
  undefined: "Undefined, such as a share of a zero total.",
};

const noMarks: Ranges = [];
/** The selected cell's ring: its width and its corners' radius. */
const ringWidth = 2;
const ringRadius = 2;
/** The ring sits a pixel inside the cell, and three pixels narrower and shorter than it. */
const ringInset = 3;

/** One row being drawn: its view row, its row in the frame, its top, and its background. */
interface RowAt {
  readonly frame: FrameData;
  readonly local: number;
  readonly row: number;
  readonly y: number;
  readonly stripe: string;
}

/** A cell's place: its data column, -1 for the group column, its left and its width. */
interface CellAt {
  readonly column: number;
  readonly x: number;
  readonly width: number;
}

/** What a cell shows: its text, its flag, and the kind of its row. */
interface Shown {
  readonly kind: RowKind | null;
  readonly text: string;
  readonly flag: CellFlag;
}

/** How a data cell's text draws: its colour, whether it aligns right, and the search's matches to mark. */
interface Style {
  readonly color: string;
  readonly right: boolean;
  readonly marks: Ranges;
}

/** A data cell's colour: muted when flagged, the negative colour for a negative number. */
function inkOf(pass: Pass, numeric: boolean, { text, flag }: Shown): string {
  const { theme } = pass;
  if (flag !== "ok") {
    return theme.muted;
  }
  return numeric && isNegativeText(text) ? theme.negative : theme.foreground;
}

/** How a data cell draws. A detail view's group row holds its totals, which align as numbers whatever the column
 * holds. */
function cellStyle(pass: Pass, data: FrameColumn, shown: Shown): Style {
  const numeric = data.total !== null && shown.kind === "group" ? data.totalNumeric : data.numeric;
  const searched = pass.search !== "" && !numeric && pass.searched.has(data.name);
  return {
    color: inkOf(pass, numeric, shown),
    marks: searched ? highlightRanges(shown.text, pass.search) : noMarks,
    right: numeric && shown.flag === "ok",
  };
}

/** What a cell's drawn text is kept with, so that choosing its row or leaving it draws the cell again. */
function rowMark(pass: Pass, row: number): string {
  return pass.scene.rowSelection?.selected(row) === true ? "\u0001" : "";
}

/** Whether a cell can be left as it was drawn: the pass redraws only what changed, and its text is unchanged. */
function unchanged(
  pass: Pass,
  row: number,
  drawn: { readonly key: string; readonly text: string },
): boolean {
  return !pass.full && !pass.stale.has(row) && pass.drawn.get(drawn.key) === drawn.text;
}

/** Strokes the focused cell's ring inside it. */
function ring(pass: Pass, at: RowAt, cell: CellAt): void {
  const { context, theme, metrics } = pass;
  Object.assign(context, { lineWidth: ringWidth, strokeStyle: theme.selectionBorder });
  context.beginPath();
  context.roundRect(
    cell.x + 1,
    at.y + 1,
    cell.width - ringInset,
    metrics.rowPx - ringInset,
    ringRadius,
  );
  context.stroke();
}

/** Tints a cell whose row is chosen, or that is in the selected range, over its background. */
function cellTint(pass: Pass, at: RowAt, cell: CellAt): void {
  const { context, theme, metrics, range } = pass;
  const rect = [cell.x, at.y, cell.width, metrics.rowPx] as const;
  if (rowMark(pass, at.row) !== "") {
    fillRect(context, theme.selectionBackground, rect);
  }
  if (range !== null && contains(range, { column: cell.column, row: at.row })) {
    fillRect(context, theme.selectionBackground, rect);
  }
}

/** Fills a cell's background, highlighting it if its row is under the pointer and marking it if it is selected. */
function cellBackground(pass: Pass, at: RowAt, cell: CellAt): void {
  const { context, theme, metrics, focus, hover } = pass;
  const rect = [cell.x, at.y, cell.width, metrics.rowPx] as const;
  const fill = hover?.row === at.row ? hover.color : at.stripe;
  if (fill !== theme.background && translucent(fill)) {
    fillRect(context, theme.background, rect);
  }
  fillRect(context, fill, rect);
  cellTint(pass, at, cell);
  if (focus !== null && focus.row === at.row && focus.column === cell.column) {
    ring(pass, at, cell);
  }
}

/** Draws the line under a cell, if the theme has one, and the cell's right border. */
function cellLines(pass: Pass, at: RowAt, cell: CellAt): void {
  const { context, rowRule, theme, metrics } = pass;
  if (rowRule !== null) {
    fillRect(context, rowRule, [cell.x, at.y + metrics.rowPx - 1, cell.width, 1]);
  }
  fillRect(context, theme.columnBorder, [cell.x + cell.width - 1, at.y, 1, metrics.rowPx]);
}

/** Keeps what a cell's tooltip says, or forgets it when null. */
function noteCell(pass: Pass, key: string, note: string | null): void {
  if (note === null) {
    pass.notes.delete(key);
  } else {
    pass.notes.set(key, note);
  }
}

/** Draws a data cell's text in its style, keeping its tooltip: a flagged cell's note, or a cut cell's text. */
function cellText(
  pass: Pass,
  at: RowAt,
  { cell, data, key }: { readonly cell: CellAt; readonly data: FrameColumn; readonly key: string },
): void {
  const { local, frame } = at;
  const text = data.text(local);
  const shown = { flag: data.flag(local), kind: frame.tree?.kind(local) ?? null, text };
  const style = cellStyle(pass, data, shown);
  Object.assign(pass.context, { fillStyle: style.color });
  const y = at.y + pass.metrics.rowPx / 2;
  const placed = {
    markColor: pass.theme.highlight,
    marks: style.marks,
    numeric: style.right,
    text,
    width: cell.width,
    x: cell.x,
    y,
  };
  const cut = clipText(pass.pen, placed);
  noteCell(pass, key, flagNotes[shown.flag] ?? (cut ? text : null));
}

/** Draws data column `column`'s cell in a row, if its text or its row changed. Returns whether it drew it. */
function dataCell(pass: Pass, at: RowAt, column: number): boolean {
  const data = at.frame.columns[column - at.frame.firstColumn];
  const drawn = {
    key: cellKey(at.row, column),
    text: (data?.text(at.local) ?? "") + rowMark(pass, at.row),
  };
  if (data === undefined || unchanged(pass, at.row, drawn)) {
    return false;
  }
  const cell = {
    column,
    width: pass.geometry.width(column),
    x: screenX(pass.geometry, column, pass.scrollLeft),
  };
  cellBackground(pass, at, cell);
  cellText(pass, at, { cell, data, key: drawn.key });
  cellLines(pass, at, cell);
  pass.drawn.set(drawn.key, drawn.text);
  return true;
}

export { cellBackground, cellLines, dataCell, rowMark, unchanged };
export type { CellAt, RowAt };
