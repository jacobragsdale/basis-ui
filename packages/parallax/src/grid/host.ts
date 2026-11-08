/* What the grid's input handlers, the pointer's, the keyboard's and the clipboard's, ask of the grid they belong to. */

import type { ViewHandle } from "#engine/view.ts";
import type { Layout } from "#layout/layout.ts";

import type { GridDom } from "./dom.ts";
import type { Hit } from "./hit.ts";
import type { GridModel } from "./model.ts";
import type { Metrics } from "./paint/metrics.ts";
import type { CellRef, Selection } from "./selection.ts";

/** The grid, as its input handlers see it. */
interface GridHost {
  readonly model: GridModel;
  readonly dom: GridDom;
  /** The open view, for fetching rows to copy; null until it opens. */
  readonly handle: () => ViewHandle | null;
  /** The sizes the tokens give, once read. */
  readonly metrics: () => Metrics | null;
  /** What is at `x`, `y` on the canvas, once the tokens are read. */
  readonly hit: (x: number, y: number) => Hit | null;
  /** Draws the canvas again, once the current task's changes are all made. */
  readonly redraw: () => void;
  /** Tells React that what it shows of the grid may have changed. */
  readonly publish: () => void;
  /** Replaces the selection, drawing and announcing it. */
  readonly select: (selection: Selection | null) => void;
  /** Scrolls so that `cell` is in view. */
  readonly reveal: (cell: CellRef) => void;
  /** Changes the layout, which goes to the app and then to the engine. */
  readonly change: (update: (layout: Layout) => Layout) => void;
  /** Opens data column `column`'s menu below its header. */
  readonly openMenu: (column: number) => void;
  /** Expands or collapses the group at view row `row`. */
  readonly toggleRow: (row: number) => void;
  /** Checks or unchecks view row `row`, or with `range` checks every row from the last one checked; returns whether
   * the row can be checked. */
  readonly checkRow: (row: number, range: boolean) => boolean;
  /** Checks every row the view shows, or clears the choice when there is one, as the header's checkbox does. */
  readonly checkAll: () => void;
  /** Asks for the rows behind the cell at view row `row` and data column `column`. */
  readonly drill: (row: number, column: number) => void;
  /** The width that shows data column `column`'s header and values, -1 for the group column. */
  readonly fitWidth: (column: number) => number;
  /** Puts the cursor in the toolbar's search, as Ctrl+F does; returns whether there is one. */
  readonly focusSearch: () => boolean;
  /** Shows a short note in the status bar, such as the result of a copy. */
  readonly say: (message: string) => void;
  /** What a cell's tooltip says, by its key. */
  readonly note: (key: string) => string | undefined;
}

export type { GridHost };
