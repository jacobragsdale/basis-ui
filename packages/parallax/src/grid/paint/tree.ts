/* The group column of a grouped grid: each row's expand marker, indented by its depth, and its label. */

import type { TreeRows } from "#frame/tree.ts";
import { highlightRanges } from "#grid/filters.ts";
import type { Ranges } from "#grid/filters.ts";

import { cellBackground, cellLines, keepCell, rowMark, unchanged } from "./cells.ts";
import type { RowAt } from "./cells.ts";
import { closedPath, drawIcon, openPath } from "./icons.ts";
import { cellKey, groupText } from "./scene.ts";
import type { Pass } from "./scene.ts";
import { clipText } from "./text.ts";

const noMarks: Ranges = [];

/** What a group cell shows, to tell when it changes: its marker's state and its label. */
function treeState(expanded: boolean | null, label: string): string {
  if (expanded === null) {
    return ` ${label}`;
  }
  return `${expanded ? "-" : "+"}${label}`;
}

/** Draws a group's expand marker, open or closed, at `left`. */
function marker(pass: Pass, at: RowAt & { readonly left: number }, expanded: boolean | null): void {
  if (expanded === null) {
    return;
  }
  const { iconPx, rowPx } = pass.metrics;
  const path = expanded ? openPath : closedPath;
  const y = at.y + rowPx / 2 - iconPx / 2;
  drawIcon(pass.context, { color: pass.theme.muted, path, size: iconPx, x: at.left - 2, y });
}

/** Draws a group cell's marker and label, keeping the label as its tooltip when it is cut. */
function treeContent(pass: Pass, tree: TreeRows, at: RowAt & { readonly label: string }): void {
  const { context, theme, metrics, geometry } = pass;
  const left = geometry.selectPx + metrics.padding + tree.depth(at.local) * metrics.indent;
  marker(pass, { ...at, left }, tree.expanded(at.local));
  const ink = tree.kind(at.local) === "total" ? theme.totalForeground : theme.foreground;
  Object.assign(context, { fillStyle: ink });
  const start = left + metrics.markerPx;
  const text = {
    markColor: theme.highlight,
    marks: pass.labelsSearched ? highlightRanges(tree.label(at.local), pass.search) : noMarks,
    numeric: false,
    text: at.label,
    y: at.y + metrics.rowPx / 2,
  };
  const room = {
    width: geometry.selectPx + geometry.treePx - start + metrics.padding,
    x: start - metrics.padding,
  };
  if (clipText(pass.pen, { ...text, ...room })) {
    pass.notes.set(cellKey(at.row, -1), at.label);
  }
}

/** Draws a row's cell in the group column: its expand marker and label. Returns the cells drawn. */
function treeCell(pass: Pass, tree: TreeRows, at: RowAt): number {
  const label = groupText(tree, at.local);
  const drawn = {
    key: cellKey(at.row, -1),
    text: treeState(tree.expanded(at.local), label) + rowMark(pass, at.row),
  };
  if (unchanged(pass, at.row, drawn)) {
    return 0;
  }
  const cell = { column: -1, width: pass.geometry.treePx, x: pass.geometry.selectPx };
  cellBackground(pass, at, cell);
  treeContent(pass, tree, { ...at, label });
  cellLines(pass, at, cell);
  keepCell(pass, { at, cell, drawn });
  return 1;
}

export { treeCell };
