/* What one draw of a grid's canvas depends on, the scene, and the pass a draw makes of it: the context, the tokens,
 * the geometry, and what it redraws. */

import type { FrameData } from "#frame/frame.ts";
import type { TreeRows } from "#frame/tree.ts";
import type { ColumnGeometry, RowGeometry } from "#grid/geometry.ts";
import type { HeaderCheck } from "#grid/row-selection.ts";
import type { CellRange, CellRef, Selection } from "#grid/selection.ts";
import type { Layout } from "#layout/layout.ts";
import type { Theme } from "#theme/read.ts";

import type { Exposed, Tally } from "./damage.ts";
import type { Metrics } from "./metrics.ts";
import type { Pen } from "./text.ts";

/** A column's sort as its header shows it: the direction, and the priority when there are several sorts. */
interface SortMark {
  readonly descending: boolean;
  readonly priority: number | null;
}

/** How a header with a menu shows its column's state: filtered, pinned, and the mark that opens its menu. */
interface HeaderLook {
  readonly filtered: boolean;
  readonly pinned: boolean;
  readonly mark: string;
}

/** A header being dragged to another place: the column, and the column it would go before, or the count for last. */
interface HeaderDrag {
  readonly from: number;
  readonly before: number;
}

/** The search a frame's rows matched, whose text is highlighted, empty for none; the columns it looks in; and
 * whether it looks in the group labels. */
interface Searched {
  readonly search: string;
  readonly searched: ReadonlySet<string>;
  readonly labelsSearched: boolean;
}

/** Everything one draw depends on. */
interface Scene {
  readonly frame: FrameData | null;
  readonly layout: Layout | null;
  readonly theme: Theme;
  readonly metrics: Metrics;
  readonly geometry: ColumnGeometry;
  readonly rows: RowGeometry;
  readonly scrollTop: number;
  readonly scrollLeft: number;
  /** The visible area's size, which the canvas fills. */
  readonly width: number;
  readonly height: number;
  readonly selection: Selection | null;
  /** The view row under the pointer, which the theme's row hover highlights. */
  readonly hoverRow: number | null;
  /** The header column under the pointer. */
  readonly hoverHeader: number | null;
  /** The column whose menu is open. */
  readonly menuColumn: number | null;
  readonly drag: HeaderDrag | null;
  readonly searched: Searched;
  /** How data column `column`'s header shows its menu, or null for a column without one. */
  readonly look: (column: number) => HeaderLook | null;
  /** Column `column`'s sort mark, -1 for the group column, or null for a column not sorted. */
  readonly sortMark: (column: number) => SortMark | null;
  /** The rows chosen, or null when rows are not selected: whether view row `row` is chosen, whether it can be, and
   * what the header's checkbox shows. */
  readonly rowSelection: {
    readonly selected: (row: number) => boolean;
    readonly selectable: (row: number) => boolean;
    readonly header: HeaderCheck;
  } | null;
}

/** What a pass draws over: the first row, the horizontal scroll and the size. */
interface Area {
  readonly first: number;
  readonly scrollLeft: number;
  readonly width: number;
  readonly height: number;
}

/** One pass of drawing: the scene, and what the pass made of it. */
interface Pass extends Searched {
  readonly scene: Scene;
  readonly context: CanvasRenderingContext2D;
  /** The device pixels of one CSS pixel, which the context's transform scales by and drawing snaps to. */
  readonly ratio: number;
  readonly pen: Pen;
  readonly theme: Theme;
  readonly metrics: Metrics;
  readonly geometry: ColumnGeometry;
  readonly scrollLeft: number;
  readonly width: number;
  /** The line under each row, or null for none. */
  readonly rowRule: string | null;
  /** The row under the pointer and its highlight, or null for none. */
  readonly hover: { readonly row: number; readonly color: string } | null;
  /** Whether the rows are a grouped grid's, whose group rows have a background of their own. */
  readonly detail: boolean;
  /** The fonts of the body, of group rows and of the header. */
  readonly fonts: { readonly body: string; readonly group: string; readonly header: string };
  /** Whether the pass redraws everything it draws over, rather than only the cells whose text or selection changed. */
  readonly full: boolean;
  /** Where the body's rows end, above the totals row if there is one, in CSS pixels; they start below the header. */
  readonly bodyBottom: number;
  /** The rows or columns a scroll exposed, when this pass paints them alone: it draws only the rows or columns that
   * meet them, under a clip to them. */
  readonly only: Exposed | null;
  /** The rows or columns a scroll exposed, when another pass paints them: this one leaves the cells wholly within. */
  readonly besides: Exposed | null;
  /** Counts the device pixels the pass repaints. */
  readonly tally: Tally;
  readonly range: CellRange | null;
  readonly focus: CellRef | null;
  /** Rows to redraw even if their text has not changed, because the selection or the pointer moved over them. */
  readonly stale: ReadonlySet<number>;
  /** What each cell drawn showed, by cell key, to skip a cell whose text has not changed. */
  readonly drawn: Map<string, string>;
  /** The view rows drawn, to clear a row that no longer has data. */
  readonly drawnRows: Set<number>;
  /** Whether each view row drawn was drawn chosen, to walk a row whose choice changed. */
  readonly chosenRows: Map<number, boolean>;
  /** Whether the frame and the search are those the canvas was last drawn with, so that no cell's text changed. */
  readonly sameFrame: boolean;
  /** The full text of cells drawn cut short, and notes for flagged cells, by cell key, for their tooltips. */
  readonly notes: Map<string, string>;
  /** The title each data column's header was drawn with, which the frame's columns give, by data column. */
  readonly titles: Map<number, string>;
}

/** Counts as the export writes them. */
const grouped = new Intl.NumberFormat("en-US");

/**
 * A row's text in the group column: its label and, for a detail view's group row, how many rows it holds, as the
 * export writes it. Drawing, fitting and copying share it, so the screen, the clipboard and the file agree.
 */
function groupText(tree: TreeRows, local: number): string {
  const count = tree.rows(local);
  return count === null ? tree.label(local) : `${tree.label(local)} (${grouped.format(count)})`;
}

/** A cell's key in the maps of what was drawn: its view row and data column, -1 for the group column. */
function cellKey(row: number, column: number): string {
  return `${String(row)}:${String(column)}`;
}

export { cellKey, groupText };
export type { Area, HeaderDrag, HeaderLook, Pass, Scene, Searched, SortMark };
