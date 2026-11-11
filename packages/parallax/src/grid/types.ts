/* The types a grid's controller and its React component share, and how the row selection props become the
 * controller's. */

import type { Layout, LayoutScalar } from "#layout/layout.ts";

import type { SourceField } from "./fields.ts";
import type { HeaderDrag } from "./paint/scene.ts";
import type { GridCell, GridMenuItem, GridRow } from "./events.ts";
import type { RowSelectionInputs, RowsChosen } from "./row-selection.ts";
import type { Selection } from "./selection.ts";

/** A request for the rows behind one group of a pivot, which a double click on its value makes. */
interface DrillRequest {
  /** The group's values from the outermost level; empty for the grand total. */
  readonly path: readonly LayoutScalar[];
  /** The pivot values of the cell's column, or null for a row total or a flat column. */
  readonly split: readonly LayoutScalar[] | null;
  /** The group's label as shown. */
  readonly label: string;
}

/** What React gives a grid's controller on each render. */
interface GridInputs {
  /** The layout with its defaults, or null when it is not valid. */
  readonly layout: Layout | null;
  readonly fields: readonly SourceField[];
  /** Hands a changed layout to the app. */
  readonly change: (layout: Layout) => void;
  /** Asks for the rows behind a pivot's cell, on a double click; null ignores the double click. */
  readonly drill: ((request: DrillRequest) => void) | null;
  /** Whether a pivot's measure headers open a menu. */
  readonly measureMenus: boolean;
  /** The tallest a grid that sizes itself to its rows grows, or null for one that fills its container. */
  readonly maxHeight: number | null;
  /** Row selection, when the app asks for it. */
  readonly rowSelection: RowSelectionInputs | null;
}

/** Choosing rows: by checkbox, any number (`true`), or the focused cell's row alone (`"single"`), each named by its
 * value in the `rowKey` column. */
type GridRowSelection =
  | {
      readonly selectable?: false | undefined;
      readonly rowKey?: undefined;
      readonly selected?: undefined;
      readonly onSelectionChange?: undefined;
      readonly onRowsChange?: undefined;
    }
  | {
      /** Chooses rows: by checkbox, any number (`true`), or the focused cell's row alone (`"single"`). */
      readonly selectable: true | "single";
      /** The column whose value names a row, such as a trade id or a CUSIP: one of the view's columns, with a
       * different value on every row. A row's key is the column's text as a copy writes it, every digit of a number. */
      readonly rowKey: string;
      /** The rows chosen, when the app holds them: their keys, or `RowsChosen`, which can say every row but some;
       * without it, the grid keeps the choice itself. */
      readonly selected?: readonly string[] | RowsChosen | undefined;
      /** Takes the keys of the rows chosen, in the order they were chosen, whenever the user changes them. For every
       * row of a flat view, the header's checkbox, they are fetched, up to 1,000,000. */
      readonly onSelectionChange?: ((keys: readonly string[]) => void) | undefined;
      /** Takes the rows chosen whenever the user changes them: `{ all: false, keys }` for those rows, or
       * `{ all: true, keys }` for every row the view shows but those, which the header's checkbox chooses in a flat
       * view without fetching a key, however many rows the view has. */
      readonly onRowsChange?: ((rows: RowsChosen) => void) | undefined;
    };

/** What the controller takes of the row selection props. */
function rowSelectionOf(props: GridRowSelection): GridInputs["rowSelection"] {
  if (props.selectable !== true && props.selectable !== "single") {
    return null;
  }
  return {
    key: props.rowKey,
    mode: props.selectable === "single" ? "single" : "multiple",
    onChange: props.onSelectionChange,
    onRows: props.onRowsChange,
    selected: props.selected,
  };
}

/** What the app hears of the grid's cells, and adds to the menu a right click opens on them. */
interface GridEventProps {
  /** Takes a click on a data cell: its row, column, text and value, its row's key, and whether it is a link. */
  readonly onCellClick?: ((cell: GridCell) => void) | undefined;
  /** Takes a row activated by a double click or Enter on one of its cells. */
  readonly onRowActivate?: ((row: GridRow) => void) | undefined;
  /** Takes the cell a right click opens the grid's menu on, or null off the cells. */
  readonly onContextMenu?: ((cell: GridCell | null) => void) | undefined;
  /** The app's own items in that menu, after the grid's, for the cell it opened on. */
  readonly contextMenuItems?: ((cell: GridCell | null) => readonly GridMenuItem[]) | undefined;
}

/** An open header menu: its data column, and the source column it edits or, for a pivot, the measure. */
interface OpenMenu {
  readonly column: number;
  readonly name: string;
  readonly measure: number | null;
}

/** What the user is doing with the grid: the selection, what the pointer is over, a header being dragged, and the
 * menu open. */
interface Interaction {
  selection: Selection | null;
  /** The view row under the pointer, which the theme's row hover highlights. */
  hoverRow: number | null;
  /** The header column under the pointer. */
  hoverHeader: number | null;
  /** Where the pointer is over the canvas, to find the row under it again after a scroll; null once it leaves. */
  pointerAt: { readonly x: number; readonly y: number } | null;
  drag: HeaderDrag | null;
  /** Whether a dragged header is over the group panel, where dropping it groups by its column. */
  overPanel: boolean;
  menu: OpenMenu | null;
}

export { rowSelectionOf };
export type { DrillRequest, GridEventProps, GridInputs, GridRowSelection, Interaction, OpenMenu };
