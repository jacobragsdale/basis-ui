/* Where a grid's columns and rows sit. Data columns have their own widths, chosen by the user and kept in the layout,
 * so positions are prefix sums. A pivot repeats its measures once per column-pivot value and then for the row total,
 * so its widths repeat with a period of one set of measures, and a column far to the right is placed without knowing
 * the columns before it. */

import { measureWidthKey, treeWidthKey } from "#layout/layout.ts";

/** Width of a data column the user has not resized, in CSS pixels. */
const defaultWidth = 140;
/** Width of the group column the user has not resized. */
const defaultTreeWidth = 260;
/** The narrowest a column can be dragged. */
const minWidth = 40;
/** Browsers cap element heights near 33 million pixels; the spacer stays well below. */
const maxScrollPx = 15_000_000;
/** The column index of the row selection's checkboxes, at the far left, before the group column's -1. */
const selectColumn = -2;
/** The checkbox column's width: room for a checkbox and the padding either side of it. */
const selectColumnPx = 32;

/** Positions of a view's columns in content coordinates, which start at the grid's left edge: the row selection's
 * checkboxes, then the group column, then the data columns. */
interface ColumnGeometry {
  /** Data columns in the whole view. */
  readonly count: number;
  /** Width of the row selection's checkbox column, at the left edge, or 0 when rows are not selected by checkbox. */
  readonly selectPx: number;
  /** Width of the pinned group column, after the checkboxes, or 0 for a flat view. */
  readonly treePx: number;
  /** How many data columns, the first ones, are pinned at the left beside the group column. */
  readonly pinned: number;
  /** Where the scrolling columns start on screen: after the checkboxes, the group column and the pinned columns. */
  readonly frozenPx: number;
  /** Total width of the content. */
  readonly contentWidth: number;
  /** The left edge of data column `column`. */
  readonly x: (column: number) => number;
  /** The width of data column `column`. */
  readonly width: (column: number) => number;
  /** The data column at content offset `x`, clamped to the view's columns. */
  readonly indexAt: (x: number) => number;
  /** The `column_widths` key that data column `column` reads its width from. */
  readonly widthKey: (column: number) => string;
}

type Widths = Readonly<Record<string, number>>;

/** A flat view's columns: their names in order, how many are pinned, the widths fitted to their values, the group
 * column of a detail view before them, and the checkbox column before that, each 0 wide for none. */
interface FlatColumns {
  readonly names: readonly string[];
  readonly pinned: number;
  readonly fitted: Widths;
  readonly treePx: number;
  readonly selectPx: number;
}

const noColumns: FlatColumns = { fitted: {}, names: [], pinned: 0, selectPx: 0, treePx: 0 };

/** A stored width, kept at or above the minimum so that every column can be found and grabbed. */
function widthOr(widths: Widths, key: string, fallback: number): number {
  return Math.max(minWidth, widths[key] ?? fallback);
}

function prefixSums(widths: readonly number[]): readonly number[] {
  const sums = [0];
  for (const width of widths) {
    sums.push((sums.at(-1) ?? 0) + width);
  }
  return sums;
}

/** The last index whose prefix sum is at most `x`. */
function search(sums: readonly number[], x: number): number {
  let low = 0;
  let high = sums.length - 2;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((sums[middle] ?? 0) <= x) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return Math.max(0, low);
}

/**
 * Geometry of a flat view, or of a detail view's columns after its group column, whose columns are `columns.names` in
 * order. The first `columns.pinned` stay at the left. A column without a saved width takes its fitted width, else the
 * default; columns past the names known so far get the default.
 */
function flatGeometry(
  count: number,
  widths: Widths,
  columns: Partial<FlatColumns> = noColumns,
): ColumnGeometry {
  const { names = [], pinned = 0, fitted = {}, treePx = 0, selectPx = 0 } = columns;
  const key = (column: number): string => names[column] ?? `#${String(column)}`;
  const own = Array.from({ length: count }, (_entry, column) =>
    widthOr(widths, key(column), fitted[key(column)] ?? defaultWidth),
  );
  // The data columns start after the checkboxes and the group column.
  const lead = selectPx + treePx;
  const sums = prefixSums(own).map((x) => x + lead);
  const total = sums.at(-1) ?? lead;
  const frozen = Math.min(pinned, count);
  return {
    contentWidth: total,
    count,
    frozenPx: sums[frozen] ?? lead,
    indexAt: (x) => (count === 0 ? 0 : search(sums, Math.max(x, lead))),
    pinned: frozen,
    selectPx,
    treePx,
    width: (column) => (sums[column + 1] ?? total) - (sums[column] ?? total),
    widthKey: key,
    x: (column) => sums[column] ?? total,
  };
}

/** Geometry of a pivot with `count` data columns built from `measures` measures. */
function groupedGeometry(count: number, measures: number, widths: Widths): ColumnGeometry {
  const period = Math.max(1, measures);
  const treePx = widthOr(widths, treeWidthKey, defaultTreeWidth);
  const sums = prefixSums(
    Array.from({ length: period }, (_entry, measure) =>
      widthOr(widths, measureWidthKey(measure), defaultWidth),
    ),
  );
  const span = sums.at(-1) ?? defaultWidth;
  const x = (column: number): number =>
    treePx + Math.floor(column / period) * span + (sums[column % period] ?? 0);
  const indexAt = (at: number): number => {
    if (count === 0) {
      return 0;
    }
    const offset = Math.max(0, at - treePx);
    const set = Math.floor(offset / span);
    return Math.min(count - 1, set * period + search(sums, offset - set * span));
  };
  return {
    contentWidth: x(count),
    count,
    frozenPx: treePx,
    indexAt,
    pinned: 0,
    // A pivot's rows are groups, which no checkbox selects.
    selectPx: 0,
    treePx,
    width: (column) => (sums[(column % period) + 1] ?? 0) - (sums[column % period] ?? 0),
    widthKey: (column) => measureWidthKey(column % period),
    x,
  };
}

/** Maps a scroll offset to rows, scaling when there are too many rows to scroll natively. */
interface RowGeometry {
  readonly spacerPx: number;
  /** The first row visible at `scrollTop`. */
  readonly firstRow: (scrollTop: number, viewportPx: number) => number;
  /** The scroll offset that shows `row` first. */
  readonly scrollTopFor: (row: number, viewportPx: number) => number;
}

/** Computes scroll geometry for `rows` rows of `rowPx` pixels, under a header `headerPx` tall that never scrolls. */
function rowGeometry(rows: number, rowPx: number, headerPx = 0): RowGeometry {
  const natural = rows * rowPx + headerPx;
  if (natural <= maxScrollPx) {
    return {
      firstRow: (top) => Math.floor(top / rowPx),
      scrollTopFor: (row) => row * rowPx,
      spacerPx: natural,
    };
  }
  const span = (viewport: number): number => Math.max(0, rows - (viewport - headerPx) / rowPx);
  return {
    firstRow: (top, viewport) => {
      const fraction = top / Math.max(1, maxScrollPx - viewport);
      return Math.min(rows - 1, Math.floor(fraction * span(viewport)));
    },
    scrollTopFor: (row, viewport) =>
      Math.ceil((row / Math.max(1, span(viewport))) * Math.max(1, maxScrollPx - viewport)),
    spacerPx: maxScrollPx,
  };
}

/** Where data column `column` starts on screen: pinned columns stay put, the rest move with `scrollLeft`. */
function screenX(geometry: ColumnGeometry, column: number, scrollLeft: number): number {
  return column < geometry.pinned ? geometry.x(column) : geometry.x(column) - scrollLeft;
}

/** The column at screen offset `x`: `selectColumn` for the checkboxes, -1 for the group column, a data column, or
 * null past the last one. */
function columnAt(geometry: ColumnGeometry, x: number, scrollLeft: number): number | null {
  if (geometry.selectPx > 0 && x < geometry.selectPx) {
    return selectColumn;
  }
  if (geometry.treePx > 0 && x < geometry.selectPx + geometry.treePx) {
    return -1;
  }
  if (geometry.count === 0) {
    return null;
  }
  if (x < geometry.frozenPx) {
    return geometry.indexAt(x);
  }
  const content = x + scrollLeft;
  return content < geometry.contentWidth ? geometry.indexAt(content) : null;
}

/** The scrolling data columns that show in a view `width` wide, past the pinned ones. */
function scrolledColumns(
  geometry: ColumnGeometry,
  scrollLeft: number,
  width: number,
): readonly number[] {
  if (geometry.count <= geometry.pinned) {
    return [];
  }
  const left = Math.max(geometry.pinned, geometry.indexAt(geometry.frozenPx + scrollLeft));
  const right = geometry.indexAt(scrollLeft + width);
  return Array.from({ length: Math.max(0, right - left + 1) }, (_entry, index) => left + index);
}

/** The data columns in view, and the key column when rows are chosen. Pinned columns show whatever the scroll, so the
 * window always starts with them. */
function windowColumns(
  geometry: ColumnGeometry,
  { scrollLeft, width }: { readonly scrollLeft: number; readonly width: number },
  key: number | null,
): { readonly columnCount: number; readonly firstColumn: number } {
  const shown = geometry.pinned > 0 ? 0 : geometry.indexAt(geometry.frozenPx + scrollLeft);
  const left = Math.min(shown, key ?? shown);
  const right = Math.max(geometry.indexAt(scrollLeft + width), key ?? shown);
  return { columnCount: right - left + 1, firstColumn: left };
}

export {
  columnAt,
  defaultTreeWidth,
  defaultWidth,
  flatGeometry,
  groupedGeometry,
  minWidth,
  rowGeometry,
  screenX,
  scrolledColumns,
  selectColumn,
  selectColumnPx,
  windowColumns,
};
export type { ColumnGeometry, FlatColumns, RowGeometry };
