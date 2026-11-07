/* The types a grid's controller and its React component share. */

import type { Layout, LayoutScalar } from "#layout/layout.ts";

import type { SourceField } from "./fields.ts";
import type { HeaderDrag } from "./paint/scene.ts";
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

export type { DrillRequest, GridInputs, Interaction, OpenMenu };
