/* The grid's rows in view, each with its group cell and data cells, and the totals row along the bottom. */

import { isNegativeText } from "#format.ts";
import type { FrameColumn } from "#frame/columns.ts";
import type { FrameData } from "#frame/frame.ts";
import type { RowKind } from "#frame/tree.ts";
import { screenX } from "#grid/geometry.ts";

import { fillRect } from "./canvas.ts";
import { dataCell } from "./cells.ts";
import type { RowAt } from "./cells.ts";
import { columnsInView } from "./columns.ts";
import type { Pass } from "./scene.ts";
import { clipText } from "./text.ts";
import { treeCell } from "./tree.ts";

/** The background of a row: a grouped grid's group rows have their own, and the rest are striped. */
function stripeOf(pass: Pass, kind: RowKind | null, row: number): string {
  const { theme } = pass;
  if (kind === "group" && pass.detail) {
    return theme.groupBackground;
  }
  return row % 2 === 0 ? theme.background : theme.stripe;
}

/** Draws one row of the frame. A group's row, and a pivot's grand total, stand out in the group font. Returns the
 * cells drawn. */
function drawRow(pass: Pass, at: Omit<RowAt, "stripe">): number {
  const kind = at.frame.tree?.kind(at.local) ?? null;
  const strong = kind === "group" || kind === "total";
  const placed = { ...at, stripe: stripeOf(pass, kind, at.row) };
  // Setting a font is slow, so only a strong row sets one, and sets the body's back after it.
  if (strong) {
    pass.pen.widths.use(pass.context, pass.fonts.group);
  }
  let cells = at.frame.tree === null ? 0 : treeCell(pass, at.frame.tree, placed);
  columnsInView(pass, { height: pass.metrics.rowPx, top: at.y }, (column) => {
    cells += dataCell(pass, placed, column) ? 1 : 0;
  });
  if (strong) {
    pass.pen.widths.use(pass.context, pass.fonts.body);
  }
  return cells;
}

/** Draws view row `row` if the frame holds it, or clears it if it no longer has data, such as after a group
 * collapsed. Returns the cells drawn. */
function viewRow(pass: Pass, at: Omit<RowAt, "stripe">): number {
  if (at.local >= 0 && at.local < at.frame.rowCount) {
    pass.drawnRows.add(at.row);
    return drawRow(pass, at);
  }
  if (pass.drawnRows.delete(at.row)) {
    fillRect(pass.context, pass.theme.background, [0, at.y, pass.width, pass.metrics.rowPx]);
  }
  return 0;
}

/** Draws the rows in view from view row `first`, clearing a row that no longer has data. Returns the cells drawn. */
function drawRows(
  pass: Pass,
  frame: FrameData,
  { first, height }: { readonly first: number; readonly height: number },
): number {
  const { metrics } = pass;
  const visible = Math.ceil((height - metrics.headerPx) / metrics.rowPx);
  let cells = 0;
  for (let index = 0; index < visible; index += 1) {
    const row = first + index;
    cells += viewRow(pass, {
      frame,
      local: row - frame.firstRow,
      row,
      y: metrics.headerPx + metrics.rowPx * index,
    });
  }
  return cells;
}

/** The colour of a total: muted when flagged, the negative colour for a negative number. */
function totalInk(pass: Pass, data: FrameColumn | undefined, text: string): string {
  const { theme } = pass;
  if (data !== undefined && data.flag(0) !== "ok") {
    return theme.muted;
  }
  return data?.numeric === true && isNegativeText(text) ? theme.negative : theme.foreground;
}

/** Draws data column `column`'s total in the totals row at `y`. */
function totalCell(
  pass: Pass,
  { frame, column, y }: { readonly frame: FrameData; readonly column: number; readonly y: number },
): void {
  const { context, geometry, metrics, pen } = pass;
  const data = frame.totals?.[column - frame.firstColumn];
  const text = data?.text(0) ?? "";
  // A grid without a group column says which row this is in its first column, unless that has a total.
  const shown = text === "" && column === 0 && geometry.treePx === 0 ? "Total" : text;
  Object.assign(context, { fillStyle: totalInk(pass, data, text) });
  const place = { width: geometry.width(column), x: screenX(geometry, column, pass.scrollLeft) };
  const numeric = data?.numeric === true && text !== "";
  clipText(pen, { ...place, numeric, text: shown, y: y + metrics.rowPx / 2 });
}

/** Draws the group column's cell of the totals row: its label. */
function totalLabel(pass: Pass, y: number): void {
  const { context, theme, metrics, geometry, pen } = pass;
  if (geometry.treePx > 0) {
    Object.assign(context, { fillStyle: theme.foreground });
    clipText(pen, {
      numeric: false,
      text: "Total",
      width: geometry.treePx,
      x: 0,
      y: y + metrics.rowPx / 2,
    });
  }
}

/** Draws the totals row along the bottom, over the rows: the engine's text for each column with a total. */
function drawFooter(pass: Pass, frame: FrameData, height: number): void {
  const { context, theme, metrics, pen } = pass;
  const y = height - metrics.rowPx;
  if (frame.totals === null) {
    return;
  }
  fillRect(context, theme.totalBackground, [0, y, pass.width, metrics.rowPx]);
  pen.widths.use(context, `${theme.totalFontWeight} ${theme.font}`);
  totalLabel(pass, y);
  columnsInView(pass, { height: metrics.rowPx, top: y }, (column) => {
    totalCell(pass, { column, frame, y });
  });
  pen.widths.use(context, theme.font);
  fillRect(context, theme.totalBorder, [0, y, pass.width, 1]);
}

export { drawFooter, drawRows };
