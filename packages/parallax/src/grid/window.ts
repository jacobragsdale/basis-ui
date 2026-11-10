/* What a grid asks its view for: the rows and data columns in view, with a margin so that small scrolls need no
 * request, or the whole of a small view, so that scrolling it needs none at all. And the expansions a layout records
 * when the user opens or closes a group. */

import type { Viewport } from "#engine/view-types.ts";
import type { FrameData } from "#frame/frame.ts";
import { pathValue } from "#format.ts";
import type { Layout, LayoutScalar } from "#layout/layout.ts";

/** Rows and columns fetched beyond the visible ones, so small scrolls need no request. */
const rowMargin = 40;
const columnMargin = 2;
/**
 * A view of at most this many cells is fetched whole, so that scrolling it needs no request. So is one of up to this
 * many cells after a change, so that clearing a search that left it small needs no further request either.
 */
const wholeCells = 20_000;

/** The rows and columns a frame says its view has. */
interface Totals {
  readonly totalRows: number;
  readonly totalColumns: number;
}

/** Whether `outer` holds all of `inner`, within a view of `totals`. */
function covers(outer: Viewport, inner: Viewport, totals: Totals): boolean {
  const rowEnd = Math.min(inner.firstRow + inner.rowCount, totals.totalRows);
  const columnEnd = Math.min(inner.firstColumn + inner.columnCount, totals.totalColumns);
  return (
    outer.firstRow <= inner.firstRow &&
    outer.firstRow + outer.rowCount >= rowEnd &&
    outer.firstColumn <= inner.firstColumn &&
    outer.firstColumn + outer.columnCount >= columnEnd
  );
}

/** Whether the view `frame` comes from is small enough to hold whole. */
function isSmall(frame: Totals): boolean {
  return frame.totalRows * frame.totalColumns <= wholeCells;
}

/**
 * The window to ask for to show `wanted`. A view the latest frame, `shown`, says is small is asked for whole, with
 * rows to spare up to {@link wholeCells}, so that it can grow again; a larger one, for `wanted` and a margin.
 */
function windowFor(wanted: Viewport, shown: Totals | null): Viewport {
  const wantedColumns = wanted.firstColumn + wanted.columnCount + columnMargin;
  if (shown !== null && isSmall(shown)) {
    const columnCount = Math.max(shown.totalColumns, wantedColumns);
    const rowCount = Math.max(
      shown.totalRows,
      wanted.firstRow + wanted.rowCount + rowMargin,
      Math.floor(wholeCells / columnCount),
    );
    return { columnCount, firstColumn: 0, firstRow: 0, rowCount };
  }
  const firstRow = Math.max(0, wanted.firstRow - rowMargin);
  const firstColumn = Math.max(0, wanted.firstColumn - columnMargin);
  return {
    columnCount: wantedColumns - firstColumn,
    firstColumn,
    firstRow,
    rowCount: wanted.firstRow - firstRow + wanted.rowCount + rowMargin,
  };
}

/** What must be held to show `wanted`: all of a small view, or just `wanted` of a larger one. */
function needed(wanted: Viewport, shown: FrameData | null): Viewport {
  if (shown !== null && isSmall(shown)) {
    return {
      columnCount: shown.totalColumns,
      firstColumn: 0,
      firstRow: 0,
      rowCount: shown.totalRows,
    };
  }
  return wanted;
}

/** The rows and data columns a frame holds. */
function held(frame: FrameData): Viewport {
  return {
    columnCount: frame.columns.length,
    firstColumn: frame.firstColumn,
    firstRow: frame.firstRow,
    rowCount: frame.rowCount,
  };
}

const unknownTotals: Totals = {
  totalColumns: Number.MAX_SAFE_INTEGER,
  totalRows: Number.MAX_SAFE_INTEGER,
};

/**
 * The window to ask for so that `wanted` shows, or null when the frame shown, or the window asked for last, already
 * holds what it needs.
 */
function missingWindow(
  wanted: Viewport,
  shown: FrameData | null,
  asked: Viewport | null,
): Viewport | null {
  const need = needed(wanted, shown);
  if (shown !== null && covers(held(shown), need, shown)) {
    return null;
  }
  if (asked !== null && covers(asked, need, shown ?? unknownTotals)) {
    return null;
  }
  return windowFor(wanted, shown);
}

/**
 * Whether the grid keeps the frame it shows rather than `arriving`: an answer, late, for rows the user has since left,
 * of the same layout and table load, which lacks rows in view that the frame shown holds. A frame of a newer layout or
 * load always replaces it.
 */
function keepsShown(shown: FrameData, arriving: FrameData, wanted: Viewport | null): boolean {
  if (
    wanted === null ||
    shown.configVersion !== arriving.configVersion ||
    shown.loadVersion !== arriving.loadVersion
  ) {
    return false;
  }
  const need = needed(wanted, shown);
  return covers(held(shown), need, shown) && !covers(held(arriving), need, arriving);
}

/** A group the user expanded or collapsed, as the layout records it. */
interface ExpandedEntry {
  readonly path: readonly LayoutScalar[];
  readonly expanded: boolean;
}

/** The JSON path of the group in the frame's row `local`. */
function groupPath(frame: FrameData, local: number): readonly LayoutScalar[] {
  const depth = frame.tree?.depth(local) ?? 0;
  return frame.groups.slice(0, depth).map((key) => pathValue(key.value(local)));
}

/** What the layout records when the user toggles the group in the frame's row `local`; null for a row that is no
 * group. */
function toggledEntry(frame: FrameData, local: number): ExpandedEntry | null {
  const expanded = frame.tree?.expanded(local) ?? null;
  return expanded === null ? null : { expanded: !expanded, path: groupPath(frame, local) };
}

function pathKey(path: readonly LayoutScalar[]): string {
  return JSON.stringify(path);
}

/** Whether the engine opens a group at `path` by default: one as deep as the layout's `expand_depth`, or shallower. */
function expandedByDefault(layout: Layout, path: readonly LayoutScalar[]): boolean {
  return path.length <= layout.expand_depth;
}

/** Records a group as expanded or collapsed, replacing any earlier entry for the same path. A group back as the
 * layout's depth leaves it needs no entry, so toggling groups open and shut never lengthens the layout. */
function withExpanded(layout: Layout, entry: ExpandedEntry): Layout {
  const key = pathKey(entry.path);
  const others = layout.expanded.filter((earlier) => pathKey(earlier.path) !== key);
  if (entry.expanded === expandedByDefault(layout, entry.path)) {
    return { ...layout, expanded: others };
  }
  return { ...layout, expanded: [...others, { expanded: entry.expanded, path: [...entry.path] }] };
}

/** The search of a layout's JSON, or empty if it has none. */
function searchIn(json: string): string {
  const parsed: unknown = JSON.parse(json);
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "search" in parsed &&
    typeof parsed.search === "string"
  ) {
    return parsed.search;
  }
  return "";
}

export {
  groupPath,
  keepsShown,
  missingWindow,
  searchIn,
  toggledEntry,
  wholeCells,
  windowFor,
  withExpanded,
};
export type { ExpandedEntry, Totals };
