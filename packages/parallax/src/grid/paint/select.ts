/* The row selection's checkbox column, at the grid's left edge: a checkbox on each row of the table, none on a group's
 * row or a total, and one in the header, checked when every row shown was checked with it, mixed when some rows are
 * chosen, and empty when none are. Checked boxes are filled in the accent, as `@basis/ui`'s Checkbox is. */

import { selectColumn } from "#grid/geometry.ts";

import { cellBackground, cellLines, rowMark, unchanged } from "./cells.ts";
import type { RowAt } from "./cells.ts";
import { fillRect } from "./canvas.ts";
import { cellKey } from "./scene.ts";
import type { Pass } from "./scene.ts";

/** What a checkbox shows. */
type CheckState = "checked" | "unchecked" | "mixed";

/** A checkbox's size, its corners' radius, and the width of its mark, in CSS pixels. */
const box = { mark: 2, radius: 3, size: 14 } as const;
/** Half a pixel, which puts a one-pixel line on whole pixels. */
const half = 0.5;
/** The tick's three points and the dash's ends, as fractions of the box. */
const tick = {
  bottomX: 0.42,
  bottomY: 0.7,
  endX: 0.76,
  endY: 0.3,
  startX: 0.24,
  startY: 0.5,
} as const;
const dash = { fromX: 0.26, toX: 0.74, y: 0.5 } as const;

/** Where a checkbox sits: centred in the column's cell whose top is `y` and height `height`. */
function boxAt(
  pass: Pass,
  y: number,
  height: number,
): { readonly left: number; readonly top: number } {
  const width = pass.geometry.selectPx;
  return {
    left: Math.round((width - box.size) / 2) + half,
    top: Math.round(y + (height - box.size) / 2) + half,
  };
}

/** The path of a checked box's tick, or a mixed box's dash. */
function markPath(at: { readonly left: number; readonly top: number }, state: CheckState): Path2D {
  const { size } = box;
  const path = new Path2D();
  if (state === "mixed") {
    path.moveTo(at.left + dash.fromX * size, at.top + dash.y * size);
    path.lineTo(at.left + dash.toX * size, at.top + dash.y * size);
    return path;
  }
  path.moveTo(at.left + tick.startX * size, at.top + tick.startY * size);
  path.lineTo(at.left + tick.bottomX * size, at.top + tick.bottomY * size);
  path.lineTo(at.left + tick.endX * size, at.top + tick.endY * size);
  return path;
}

/** Strokes the tick of a checked box, or the dash of a mixed one, in the colour on the accent. */
function mark(
  pass: Pass,
  at: { readonly left: number; readonly top: number },
  state: CheckState,
): void {
  const { context, theme } = pass;
  Object.assign(context, {
    lineCap: "round",
    lineJoin: "round",
    lineWidth: box.mark,
    strokeStyle: theme.onAccent,
  });
  context.stroke(markPath(at, state));
}

/** Draws a checkbox in the column's cell whose top is `y` and height `height`. */
function checkbox(
  pass: Pass,
  { y, height, state }: { readonly y: number; readonly height: number; readonly state: CheckState },
): void {
  const { context, theme } = pass;
  const at = boxAt(pass, y, height);
  const on = state !== "unchecked";
  context.beginPath();
  context.roundRect(at.left, at.top, box.size - 1, box.size - 1, box.radius);
  Object.assign(context, {
    fillStyle: on ? theme.accent : theme.controlBackground,
    lineWidth: 1,
    strokeStyle: on ? theme.accent : theme.controlBorder,
  });
  context.fill();
  context.stroke();
  if (on) {
    mark(pass, at, state);
  }
}

/** What a row's checkbox cell shows, to tell when it changes: whether it has a checkbox, and whether it is checked. */
function selectState(
  pass: Pass,
  row: number,
): { readonly selectable: boolean; readonly text: string } {
  const selectable = pass.scene.rowSelection?.selectable(row) === true;
  return { selectable, text: `${String(selectable)}${rowMark(pass, row)}` };
}

/** Draws a row's checkbox, checked if its row is chosen, if the row is one of the table's. */
function rowCheckbox(pass: Pass, at: RowAt, selectable: boolean): void {
  if (selectable) {
    const state = rowMark(pass, at.row) === "" ? "unchecked" : "checked";
    checkbox(pass, { height: pass.metrics.rowPx, state, y: at.y });
  }
}

/** Draws a row's cell in the checkbox column, if its state changed. Returns the cells drawn. */
function selectCell(pass: Pass, at: RowAt): number {
  const { selectable, text } = selectState(pass, at.row);
  const drawn = { key: cellKey(at.row, selectColumn), text };
  if (pass.geometry.selectPx === 0 || unchanged(pass, at.row, drawn)) {
    return 0;
  }
  const cell = { column: selectColumn, width: pass.geometry.selectPx, x: 0 };
  cellBackground(pass, at, cell);
  rowCheckbox(pass, at, selectable);
  cellLines(pass, at, cell);
  pass.drawn.set(drawn.key, drawn.text);
  return 1;
}

/** Draws the checkbox column's header: the checkbox that checks every row shown, or clears the choice. */
function selectHeader(pass: Pass): void {
  const choice = pass.scene.rowSelection;
  const { geometry, metrics, theme, context } = pass;
  if (choice === null || geometry.selectPx === 0) {
    return;
  }
  const states = { all: "checked", none: "unchecked", some: "mixed" } as const;
  checkbox(pass, { height: metrics.headerPx, state: states[choice.header], y: 0 });
  fillRect(context, theme.columnBorder, [geometry.selectPx - 1, 0, 1, metrics.headerPx]);
}

export { selectCell, selectHeader };
