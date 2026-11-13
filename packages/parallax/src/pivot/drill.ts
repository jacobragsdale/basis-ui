/* Drilling through a pivot's value into the rows behind it: a flat view of the same dataset, filtered to the group's
 * rows, which the pivot shows below its table until the groups or filters change. */

import type { Layout, LayoutFilter, LayoutScalar } from "#layout/layout.ts";

/** A filter of `column` to `value`, or to blanks for null. */
function matching(column: string, value: LayoutScalar): LayoutFilter {
  const base = { column, columns: [], value: null, values: [] };
  return value === null ? { ...base, op: "is_null" } : { ...base, op: "eq", value };
}

/** A filter per level: each value under the column of its level. */
function levelFilters(
  columns: readonly string[],
  values: readonly LayoutScalar[],
): readonly LayoutFilter[] {
  return values.flatMap((value, level) => {
    const column = columns[level];
    return column === undefined ? [] : [matching(column, value)];
  });
}

/**
 * A flat view of the rows behind one group: the pivot's filters plus one filter per group level and, for a cell under
 * column pivots, one per pivot level, with the pivot's formats. An empty path is the grand total.
 */
function drillLayout(
  layout: Layout,
  path: readonly LayoutScalar[],
  split: readonly LayoutScalar[] | null = null,
): Layout {
  const levels = [
    ...levelFilters(layout.group_by, path),
    ...levelFilters(layout.split_by, split ?? []),
  ];
  return {
    ...layout,
    column_widths: {},
    columns: [],
    expand_depth: 0,
    expanded: [],
    filters: [...layout.filters, ...levels],
    group_by: [],
    group_sort: { by: "key", descending: false },
    having: [],
    measures: [],
    sort: [],
    split_by: [],
    top_n: null,
  };
}

/** What decides the rows behind a group: the dataset, its filters, its search and the groups. When it changes, rows
 * drilled into no longer add up to the values above them. */
function drillSource(layout: Layout): string {
  return JSON.stringify([
    layout.dataset,
    layout.parameters,
    layout.filters,
    layout.search,
    layout.group_by,
    layout.split_by,
  ]);
}

export { drillLayout, drillSource };
