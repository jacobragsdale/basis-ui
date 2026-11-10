/* The grid's rows in view, each with its group cell and data cells, clipped to the body between the header and the
 * totals row, and the totals row along the bottom. */

import { isNegativeText } from "#format.ts";
import type { FrameColumn } from "#frame/columns.ts";
import type { FrameData } from "#frame/frame.ts";
import type { RowKind } from "#frame/tree.ts";
import { screenX } from "#grid/geometry.ts";

import { fillFromStart, fillRect, withClip } from "./canvas.ts";
import { dataCell } from "./cells.ts";
import { drawsSpan, spanOf } from "./damage.ts";
import type { RowAt } from "./cells.ts";
import { columnsInView } from "./columns.ts";
import { selectCell } from "./select.ts";
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

/** Draws a row's cells in the checkboxes' column and the group column, but not in a strip of the scrolling columns
 * that a scroll exposed, which holds neither. Returns the cells drawn. */
function frozenCells(pass: Pass, at: RowAt): number {
  if (pass.only?.axis === "columns") {
    return 0;
  }
  return selectCell(pass, at) + (at.frame.tree === null ? 0 : treeCell(pass, at.frame.tree, at));
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
  let cells = frozenCells(pass, placed);
  columnsInView(pass, { height: pass.metrics.rowPx, top: at.y }, (column) => {
    const drew = dataCell(pass, placed, column);
    cells += drew ? 1 : 0;
    return drew;
  });
  if (strong) {
    pass.pen.widths.use(pass.context, pass.fonts.body);
  }
  return cells;
}

/** The body, where rows draw: between the header and the totals row, or the bottom. */
function bodyOf(pass: Pass): readonly [number, number, number, number] {
  const top = pass.metrics.headerPx;
  return [0, top, pass.width, pass.bodyBottom - top];
}

/** Draws view row `row` if the frame holds it, or clears it if it no longer has data, such as after a group
 * collapsed. Returns the cells drawn. */
function viewRow(pass: Pass, at: Omit<RowAt, "stripe">): number {
  if (at.local >= 0 && at.local < at.frame.rowCount) {
    pass.drawnRows.add(at.row);
    return drawRow(pass, at);
  }
  if (pass.drawnRows.delete(at.row)) {
    const rect = [0, at.y, pass.width, pass.metrics.rowPx] as const;
    fillRect(pass, pass.theme.background, rect);
    pass.tally.cell(rect, bodyOf(pass));
  }
  return 0;
}

/** Whether the pass draws the row whose top is `y`, as far as it shows in the body. */
function drawsRow(pass: Pass, y: number): boolean {
  const { ratio, metrics } = pass;
  const within = [0, Math.round(pass.bodyBottom * ratio)] as const;
  return drawsSpan(pass, "rows", spanOf([y, metrics.rowPx], { ratio, within }));
}

/** Draws the rows in view from view row `first`, clearing a row that no longer has data, clipped to the body so that
 * none draws over the totals row. Returns the cells drawn. */
function drawRows(
  pass: Pass,
  frame: FrameData,
  { first, height }: { readonly first: number; readonly height: number },
): number {
  const { metrics } = pass;
  const visible = Math.ceil((height - metrics.headerPx) / metrics.rowPx);
  return withClip(pass, bodyOf(pass), () => {
    let cells = 0;
    for (let index = 0; index < visible; index += 1) {
      const y = metrics.headerPx + metrics.rowPx * index;
      const row = first + index;
      cells += drawsRow(pass, y)
        ? viewRow(pass, { frame, local: row - frame.firstRow, row, y })
        : 0;
    }
    return cells;
  });
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
  // A strip of the scrolling columns that a scroll exposed does not hold the group column.
  if (geometry.treePx > 0 && pass.only?.axis !== "columns") {
    Object.assign(context, { fillStyle: theme.foreground });
    clipText(pen, {
      numeric: false,
      text: "Total",
      width: geometry.treePx,
      x: geometry.selectPx,
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
  fillRect(pass, theme.totalBackground, [0, y, pass.width, metrics.rowPx]);
  pen.widths.use(context, `${theme.totalFontWeight} ${theme.font}`);
  totalLabel(pass, y);
  columnsInView(pass, { height: metrics.rowPx, top: y }, (column) => {
    totalCell(pass, { column, frame, y });
    return true;
  });
  pen.widths.use(context, theme.font);
  fillFromStart(pass, theme.totalBorder, [0, y, pass.width, 1]);
}

export { bodyOf, drawFooter, drawRows };
