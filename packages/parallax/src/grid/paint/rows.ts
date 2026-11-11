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
import type { Band } from "./columns.ts";
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

/** A row to draw: where it is, and whether it stands out in the group font, as a group's row and a pivot's grand total
 * do. */
interface Placed extends RowAt {
  readonly strong: boolean;
}

/** Sets the group font, or the body's, if it is not the font already set; returns whether the group font is set. */
function switchFont(pass: Pass, was: boolean, strong: boolean): boolean {
  if (strong !== was) {
    pass.pen.widths.use(pass.context, strong ? pass.fonts.group : pass.fonts.body);
  }
  return strong;
}

/** Runs `paint` on each row in order, in its font: the group font for a strong row, set only where it changes from the
 * row before, since setting a font is slow. Returns the bands of the rows where it drew. */
function byFont(
  pass: Pass,
  rows: readonly Placed[],
  paint: (at: Placed) => boolean,
): readonly Band[] {
  const drew: Band[] = [];
  let strong = false;
  for (const at of rows) {
    strong = switchFont(pass, strong, at.strong);
    if (paint(at)) {
      drew.push({ height: pass.metrics.rowPx, top: at.y });
    }
  }
  switchFont(pass, strong, false);
  return drew;
}

/** Draws the rows' cells: the checkboxes and group column, then each area's data columns under one clip for them all.
 * Returns the cells drawn. */
function drawPlaced(pass: Pass, rows: readonly Placed[]): number {
  let cells = 0;
  byFont(pass, rows, (at) => {
    cells += frozenCells(pass, at);
    return false;
  });
  const { headerPx } = pass.metrics;
  columnsInView(pass, { height: pass.bodyBottom - headerPx, top: headerPx }, (columns) =>
    byFont(pass, rows, (at) => {
      let drew = false;
      for (const column of columns) {
        if (dataCell(pass, at, column)) {
          cells += 1;
          drew = true;
        }
      }
      return drew;
    }),
  );
  return cells;
}

/** The body, where rows draw: between the header and the totals row, or the bottom. */
function bodyOf(pass: Pass): readonly [number, number, number, number] {
  const top = pass.metrics.headerPx;
  return [0, top, pass.width, pass.bodyBottom - top];
}

/** Whether a pass walks view row `row`'s cells: a pass that draws what changed, with the frame and search it last drew,
 * finds no text changed, so it walks only the rows the selection or the pointer moved over and those chosen or left
 * since. */
function walks(pass: Pass, row: number, chosen: boolean): boolean {
  return pass.full || !pass.sameFrame || pass.stale.has(row) || pass.chosenRows.get(row) !== chosen;
}

/** Clears a row drawn before that no longer has data. */
function clearRow(pass: Pass, at: { readonly row: number; readonly y: number }): void {
  if (pass.drawnRows.delete(at.row)) {
    const rect = [0, at.y, pass.width, pass.metrics.rowPx] as const;
    fillRect(pass, pass.theme.background, rect);
    pass.tally.cell(rect, bodyOf(pass));
  }
}

/** View row `row` placed to draw, if the frame holds it; or cleared if it no longer has data, such as after a group
 * collapsed, and null. */
function placeRow(
  pass: Pass,
  at: Omit<RowAt, "chosen" | "stripe">,
  chosen: boolean,
): Placed | null {
  pass.chosenRows.set(at.row, chosen);
  if (at.local >= 0 && at.local < at.frame.rowCount) {
    pass.drawnRows.add(at.row);
    const kind = at.frame.tree?.kind(at.local) ?? null;
    const strong = kind === "group" || kind === "total";
    return { ...at, chosen, stripe: stripeOf(pass, kind, at.row), strong };
  }
  clearRow(pass, at);
  return null;
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
    const rows: Placed[] = [];
    for (let index = 0; index < visible; index += 1) {
      const y = metrics.headerPx + metrics.rowPx * index;
      const row = first + index;
      const chosen = pass.scene.rowSelection?.selected(row) === true;
      const placed =
        drawsRow(pass, y) && walks(pass, row, chosen)
          ? placeRow(pass, { frame, local: row - frame.firstRow, row, y }, chosen)
          : null;
      if (placed !== null) {
        rows.push(placed);
      }
    }
    return drawPlaced(pass, rows);
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

/** Draws each data column's total in the totals row at `y`. */
function totalCells(pass: Pass, frame: FrameData, y: number): void {
  const band = { height: pass.metrics.rowPx, top: y };
  columnsInView(pass, band, (columns) => {
    for (const column of columns) {
      totalCell(pass, { column, frame, y });
    }
    return [band];
  });
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
  totalCells(pass, frame, y);
  pen.widths.use(context, theme.font);
  fillFromStart(pass, theme.totalBorder, [0, y, pass.width, 1]);
}

export { bodyOf, drawFooter, drawRows };
