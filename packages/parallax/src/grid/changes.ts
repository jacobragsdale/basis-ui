/* The layout changes the grid's canvas makes itself: a header click's sort, a dragged or fitted width, a dropped
 * header's new place, and how a header's sort mark reads the layout. */

import { treeWidthKey } from "#layout/layout.ts";
import type { Layout } from "#layout/layout.ts";

import { isGroupedLayout, isPivotLayout } from "./edit.ts";
import { minWidth } from "./geometry.ts";
import type { SortMark } from "./paint/scene.ts";

/** A sort of the groups by their keys: ascending, then descending, then back. */
function keySort(layout: Layout): Layout {
  const descending = layout.group_sort.by === "key" ? !layout.group_sort.descending : false;
  return { ...layout, group_sort: { by: "key", descending } };
}

/** A pivot's sort by measure `measure`: largest last, then first, then by the groups' keys again. */
function measureSort(layout: Layout, measure: number): Layout {
  const { by, descending } = layout.group_sort;
  if (by === "key" || by.measure !== measure) {
    return { ...layout, group_sort: { by: { measure }, descending: false } };
  }
  return {
    ...layout,
    group_sort: descending
      ? { by: "key", descending: false }
      : { by: { measure }, descending: true },
  };
}

/** The next sort a header click gives a column sorted as `existing`: ascending, descending, then off. */
function nextSort(
  name: string,
  existing: Layout["sort"][number] | undefined,
): Layout["sort"][number] | null {
  if (existing === undefined) {
    return { column: name, descending: false };
  }
  return existing.descending ? null : { column: name, descending: true };
}

/** A flat view's sort by `name`: ascending, descending, then off. `additive` adds it to the other sorts. */
function columnSort(layout: Layout, name: string, additive: boolean): Layout {
  const existing = layout.sort.find((sort) => sort.column === name);
  const next = nextSort(name, existing);
  if (!additive) {
    return { ...layout, sort: next === null ? [] : [next] };
  }
  const others = layout.sort.filter((sort) => sort.column !== name);
  if (next === null) {
    return { ...layout, sort: others };
  }
  const placed =
    existing === undefined
      ? [...others, next]
      : layout.sort.map((sort) => (sort.column === name ? next : sort));
  return { ...layout, sort: placed };
}

/**
 * Cycles a column's sort, as a header click does: ascending, descending, then off. Shift, `additive`, adds it to the
 * sorts of a flat view. The group column sorts the groups by their keys, and a pivot's columns by their measure.
 * `name` is the source column of a flat view's data column.
 */
function sortedBy(
  layout: Layout,
  column: number,
  { name, additive }: { readonly name: string; readonly additive: boolean },
): Layout {
  if (column === -1 && isGroupedLayout(layout)) {
    return keySort(layout);
  }
  if (isPivotLayout(layout)) {
    return measureSort(layout, column % Math.max(1, layout.measures.length));
  }
  return columnSort(layout, name, additive);
}

/** The layout with the column whose width is kept under `key` at `width`, at least the narrowest a column can be. */
function withWidth(layout: Layout, key: string, width: number): Layout {
  return {
    ...layout,
    column_widths: { ...layout.column_widths, [key]: Math.max(minWidth, Math.round(width)) },
  };
}

/** A pivot's or the group column's sort mark: the groups' sort, when it is by this column's measure or keys. */
function groupMark(layout: Layout, column: number): SortMark | null {
  const { by, descending } = layout.group_sort;
  if (column === -1) {
    return by === "key" && descending ? { descending: true, priority: null } : null;
  }
  const measure = column % Math.max(1, layout.measures.length);
  return by !== "key" && by.measure === measure ? { descending, priority: null } : null;
}

/** How column `column`'s header marks its sort, -1 for the group column; `name` is a flat view's source column. */
function sortMarkOf(layout: Layout | null, column: number, name: string): SortMark | null {
  if (layout === null) {
    return null;
  }
  if (column === -1 || isPivotLayout(layout)) {
    return groupMark(layout, column);
  }
  const index = layout.sort.findIndex((sort) => sort.column === name);
  const sort = layout.sort[index];
  if (sort === undefined) {
    return null;
  }
  return { descending: sort.descending, priority: layout.sort.length > 1 ? index + 1 : null };
}

/** The key the width of data column `column`, -1 for the group column, is kept under; `key` gives a data column's. */
function widthKeyOf(column: number, key: (column: number) => string): string {
  return column === -1 ? treeWidthKey : key(column);
}

export { sortMarkOf, sortedBy, widthKeyOf, withWidth };
