/* Cell selection: an anchor where it started and a focus that moves. Column -1 is the group column of a grouped view.
 * Rows and columns are positions in the whole view, not in the frame on screen, so a selection survives scrolling. */

/** A cell by view row and data column; column -1 is the group column. */
interface CellRef {
  readonly row: number;
  readonly column: number;
}

/** A rectangular selection. */
interface Selection {
  readonly anchor: CellRef;
  readonly focus: CellRef;
}

/** The inclusive bounds of a selection. */
interface CellRange {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/** The view's extent: rows, data columns, and whether a group column exists. */
interface Extent {
  readonly rows: number;
  readonly columns: number;
  readonly tree: boolean;
}

/** A move of the focus by whole rows and columns; `extend` keeps the anchor, as Shift does. */
interface Move {
  readonly rows: number;
  readonly columns: number;
  readonly extend: boolean;
}

/** Returns the bounds of a selection. */
function rangeOf(selection: Selection): CellRange {
  const { anchor, focus } = selection;
  return {
    bottom: Math.max(anchor.row, focus.row),
    left: Math.min(anchor.column, focus.column),
    right: Math.max(anchor.column, focus.column),
    top: Math.min(anchor.row, focus.row),
  };
}

/** Returns `true` if the cell is inside the range. */
function contains(range: CellRange, cell: CellRef): boolean {
  return (
    cell.row >= range.top &&
    cell.row <= range.bottom &&
    cell.column >= range.left &&
    cell.column <= range.right
  );
}

/** Keeps a cell inside the view. */
function clampCell(cell: CellRef, extent: Extent): CellRef {
  const minColumn = extent.tree ? -1 : 0;
  return {
    column: Math.min(Math.max(minColumn, cell.column), Math.max(minColumn, extent.columns - 1)),
    row: Math.min(Math.max(0, cell.row), Math.max(0, extent.rows - 1)),
  };
}

/** Moves the focus by whole rows and columns, keeping the anchor when the move extends the selection. */
function moveFocus(selection: Selection, move: Move, extent: Extent): Selection {
  const focus = clampCell(
    { column: selection.focus.column + move.columns, row: selection.focus.row + move.rows },
    extent,
  );
  return { anchor: move.extend ? selection.anchor : focus, focus };
}

/** Selects every cell of the view. */
function selectAll(extent: Extent): Selection {
  return {
    anchor: { column: extent.tree ? -1 : 0, row: 0 },
    focus: clampCell({ column: extent.columns - 1, row: extent.rows - 1 }, extent),
  };
}

/** Quotes a cell for tab-separated text as Excel does, when it holds a tab, a line break or a quote. */
function quote(cell: string): string {
  return /[\t\n\r"]/u.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

/** Joins cells into tab-separated text that pastes into Excel as cells. */
function toTsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map((cell) => quote(cell)).join("\t")).join("\r\n");
}

export { clampCell, contains, moveFocus, rangeOf, selectAll, toTsv };
export type { CellRange, CellRef, Extent, Move, Selection };
