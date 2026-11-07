/* What screen readers hear of a grid, which they cannot read from its canvas: the focused cell, with its column's
 * title, and the size of a selection of more than one cell. */

import type { GridModel } from "./model.ts";
import { groupText } from "./paint/scene.ts";
import { rangeOf } from "./selection.ts";
import type { CellRef, Selection } from "./selection.ts";

/** The focused cell as a screen reader reads it: its place in the view, counted from 1, and what it says. */
interface ActiveCell {
  readonly id: string;
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly text: string;
  readonly selected: boolean;
}

/** What the focused cell says: its column's title and its text, or that its rows are still loading. */
function cellSpeech(model: GridModel, focus: CellRef): string {
  const { frame } = model;
  const local = frame === null ? -1 : focus.row - frame.firstRow;
  if (frame === null || local < 0 || local >= frame.rowCount) {
    return "Loading…";
  }
  if (focus.column === -1) {
    return frame.tree === null ? "" : groupText(frame.tree, local);
  }
  const data = frame.columns[focus.column - frame.firstColumn];
  return data === undefined ? "Loading…" : `${data.title}: ${data.text(local)}`;
}

/** The focused cell as a screen reader reads it, as the grid's active descendant. Each cell has its own id, so a
 * screen reader announces every move. */
function describeCell(
  model: GridModel,
  { focus, id }: { readonly focus: CellRef; readonly id: string },
): ActiveCell {
  const tree = model.geometry.treePx > 0;
  const { selection } = model.interaction;
  return {
    columnIndex: focus.column + (tree ? 2 : 1),
    id: `${id}-cell-${String(focus.row)}-${String(focus.column)}`,
    rowIndex: focus.row + 1,
    selected: selection !== null,
    text: cellSpeech(model, focus),
  };
}

/** The size of a selection of more than one cell, such as `3 rows by 2 columns selected`; empty otherwise. */
function describeRange(selection: Selection | null): string {
  if (selection === null) {
    return "";
  }
  const range = rangeOf(selection);
  const rows = range.bottom - range.top + 1;
  const columns = range.right - range.left + 1;
  if (rows === 1 && columns === 1) {
    return "";
  }
  const rowText = `${rows.toLocaleString("en-US")} ${rows === 1 ? "row" : "rows"}`;
  return `${rowText} by ${String(columns)} ${columns === 1 ? "column" : "columns"} selected`;
}

export { describeCell, describeRange };
export type { ActiveCell };
