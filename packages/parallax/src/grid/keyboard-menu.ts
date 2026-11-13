/* The cell menu from the keyboard: Shift+F10 or the Menu key opens it on the focused cell, as a right click there
 * would, where a browser opens a keyboard's context menu at the middle of the grid's element and so on another cell. */

import { screenX } from "./geometry.ts";
import type { GridHost } from "./host.ts";
import type { CellRef } from "./selection.ts";

/** The middle of a row or column, as a fraction of it. */
const half = 0.5;

/** Whether `event` asks for the context menu from the keyboard. */
function asksForMenu(event: KeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);
}

/** The middle of `cell` on the canvas, in CSS pixels from its top left, or null when its row is not in view. */
function middleOf(
  host: GridHost,
  cell: CellRef,
): { readonly x: number; readonly y: number } | null {
  const metrics = host.metrics();
  if (metrics === null) {
    return null;
  }
  const { geometry, area } = host.model;
  const first = host.model.rows(metrics).firstRow(area.scrollTop, area.height);
  const y = metrics.headerPx + (cell.row - first + half) * metrics.rowPx;
  if (y < metrics.headerPx || y > area.height) {
    return null;
  }
  const x =
    cell.column === -1
      ? geometry.selectPx + geometry.treePx / 2
      : screenX(geometry, cell.column, area.scrollLeft) + geometry.width(cell.column) / 2;
  return { x, y };
}

/** Opens the cell menu on `cell`, as a right click at its middle does. Returns whether it opened. */
function openMenuAt(host: GridHost, cell: CellRef): boolean {
  const middle = middleOf(host, cell);
  if (middle === null) {
    return false;
  }
  const { canvas } = host.dom.parts;
  const box = canvas.getBoundingClientRect();
  const menu = new MouseEvent("contextmenu", {
    bubbles: true,
    button: 2,
    cancelable: true,
    clientX: box.left + middle.x,
    clientY: box.top + middle.y,
  });
  canvas.dispatchEvent(menu);
  return true;
}

export { asksForMenu, openMenuAt };
