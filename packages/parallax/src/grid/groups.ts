/* A grouped grid's groups: opening and closing one, which the layout records, and the rows behind a pivot's value,
 * which a double click asks for. */

import type { FrameData } from "#frame/frame.ts";
import type { Layout } from "#layout/layout.ts";

import { isPivotLayout } from "./edit.ts";
import type { DrillRequest } from "./types.ts";
import { groupPath, toggledEntry, withExpanded } from "./window.ts";

/** The row in the frame of view row `row`, or null when the frame does not hold it. */
function localRow(frame: FrameData | null, row: number): number | null {
  const local = frame === null ? -1 : row - frame.firstRow;
  return frame !== null && local >= 0 && local < frame.rowCount ? local : null;
}

/** The layout change that expands or collapses the group at view row `row`, or null for a row that is no group. */
function toggleAt(frame: FrameData | null, row: number): ((layout: Layout) => Layout) | null {
  const local = localRow(frame, row);
  const entry = frame === null || local === null ? null : toggledEntry(frame, local);
  return entry === null ? null : (layout): Layout => withExpanded(layout, entry);
}

/** The pivot values a column's title names before its measure, as `Bond` in `Bond | sum(mv)`. */
function pivotValues(title: string): string {
  return title.slice(0, title.lastIndexOf(" | "));
}

/** The request for the rows behind the cell at view row `row` and data column `column`, if its row is one group of
 * a pivot rather than an Other row. */
function drillAt(
  { frame, layout }: { readonly frame: FrameData | null; readonly layout: Layout | null },
  row: number,
  column: number,
): DrillRequest | null {
  const tree = frame?.tree ?? null;
  const local = localRow(frame, row);
  if (
    frame === null ||
    local === null ||
    tree === null ||
    layout === null ||
    !isPivotLayout(layout)
  ) {
    return null;
  }
  if (tree.kind(local) === "other") {
    return null;
  }
  const data = frame.columns[column - frame.firstColumn];
  const split = data?.split ?? null;
  const label =
    split === null ? tree.label(local) : `${tree.label(local)}, ${pivotValues(data?.title ?? "")}`;
  return { label, path: groupPath(frame, local), split };
}

export { drillAt, toggleAt };
