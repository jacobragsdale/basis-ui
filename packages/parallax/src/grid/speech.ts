/* What screen readers hear of a grid, which they cannot read from its canvas: the focused cell, with its column's
 * title and whether its row is chosen, the size of a selection of more than one cell, and how many rows are chosen. */

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
  /** How its column orders and filters the rows, such as `Sorted descending. Filtered.`; empty when it does neither. */
  readonly description: string;
}

/** How the view orders and filters by data column `column`: what a column header's `aria-sort` and filter mark say,
 * which a canvas grid has no header for. */
function columnState(model: GridModel, column: number): string {
  const name = model.frame?.columns[column - model.frame.firstColumn]?.name;
  const { layout } = model;
  if (name === undefined || layout === null) {
    return "";
  }
  const sort = layout.sort.find((entry) => entry.column === name);
  const sorted =
    sort === undefined ? "" : `Sorted ${sort.descending ? "descending" : "ascending"}.`;
  const filtered = layout.filters.some((filter) => filter.column === name) ? "Filtered." : "";
  return [sorted, filtered].filter((part) => part !== "").join(" ");
}

/** What a cell says while its rows load. */
const loadingSpeech = "Loading…";

/** What the focused cell says: its column's title and its text, or that its rows are still loading. */
function cellSpeech(model: GridModel, focus: CellRef): string {
  const { frame } = model;
  const local = frame === null ? -1 : focus.row - frame.firstRow;
  if (frame === null || local < 0 || local >= frame.rowCount) {
    return loadingSpeech;
  }
  if (focus.column === -1) {
    return frame.tree === null ? "" : groupText(frame.tree, local);
  }
  const data = frame.columns[focus.column - frame.firstColumn];
  return data === undefined ? loadingSpeech : `${data.title}: ${data.text(local)}`;
}

/** The focused cell as a screen reader reads it, as the grid's active descendant. Each cell has its own id, so a
 * screen reader announces every move. */
function describeCell(
  model: GridModel,
  { focus, id }: { readonly focus: CellRef; readonly id: string },
): ActiveCell {
  const { geometry } = model;
  // The checkboxes and the group column come before the data columns, each one column for a screen reader.
  const before = (geometry.selectPx > 0 ? 1 : 0) + (geometry.treePx > 0 ? 1 : 0);
  const { selection } = model.interaction;
  const chosen = model.choice.chosen(model.frame, focus.row) ? "Row selected. " : "";
  const speech = cellSpeech(model, focus);
  // A cell read while its rows load has an id of its own, so that it is read again once they come.
  const loading = speech === loadingSpeech ? "-loading" : "";
  return {
    columnIndex: focus.column + before + 1,
    description: columnState(model, focus.column),
    id: `${id}-cell-${String(focus.row)}-${String(focus.column)}${loading}`,
    rowIndex: focus.row + 1,
    selected: selection !== null,
    text: chosen + speech,
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

/** How many rows are chosen, such as `3 rows selected`; empty for none, or when rows are not chosen. */
function describeRows(count: number | null): string {
  if (count === null || count === 0) {
    return "";
  }
  return `${count.toLocaleString("en-US")} ${count === 1 ? "row" : "rows"} selected`;
}

export { describeCell, describeRange, describeRows };
export type { ActiveCell };
