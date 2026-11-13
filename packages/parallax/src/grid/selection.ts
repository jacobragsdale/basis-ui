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

function sameCell(one: CellRef, other: CellRef): boolean {
  return one.row === other.row && one.column === other.column;
}

/** A selection kept within the view it is of, once the view has changed: each end clamped to its rows and columns, so a
 * selection of rows a filter left, or of a group column an ungroup took away, is of cells that exist; none for a view
 * with no rows or columns. The same selection when it is within already. */
function clampSelection(selection: Selection | null, extent: Extent): Selection | null {
  if (selection === null || extent.rows === 0 || (extent.columns === 0 && !extent.tree)) {
    return null;
  }
  const anchor = clampCell(selection.anchor, extent);
  const focus = clampCell(selection.focus, extent);
  const same = sameCell(anchor, selection.anchor) && sameCell(focus, selection.focus);
  return same ? selection : { anchor, focus };
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

/** Characters a spreadsheet reads as the start of a formula, or that hide one: OWASP's list, as `@basis/ui`'s CSV and
 * TSV writers have it. */
const formulaStarts = new Set(["=", "+", "-", "@", "\t", "\r"]);

/** Text that pastes into a spreadsheet as text, never as a formula: prefixed with `'` when it starts like one, as
 * `@basis/ui`'s writers prefix a text cell. A comment of `=HYPERLINK(...)` stays a comment. */
function pasteSafe(text: string): string {
  return formulaStarts.has(text.charAt(0)) ? `'${text}` : text;
}

/** Quotes a cell for tab-separated text as Excel does, when it holds a tab, a line break or a quote. */
function quote(cell: string): string {
  return /[\t\n\r"]/u.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

/** Joins cells into tab-separated text that pastes into Excel as cells. */
function toTsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map((cell) => quote(cell)).join("\t")).join("\r\n");
}

export { clampCell, clampSelection, contains, moveFocus, pasteSafe, rangeOf, selectAll, toTsv };
export type { CellRange, CellRef, Extent, Move, Selection };
