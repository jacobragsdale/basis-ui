/* Pure edits of a grid's layout, which its toolbar, header menus and column tools make: which columns it shows and in
 * what order, sorting, hiding, pinning, titles, totals and grouping. Every edit is a new layout. */

import type { Layout, LayoutMeasure } from "#layout/layout.ts";

import type { FieldKind, SourceField } from "./fields.ts";

type Aggregate = LayoutMeasure["aggregate"];

/** Whether a layout groups its rows: a pivot, or a detail view. */
function isGroupedLayout(layout: Layout): boolean {
  return layout.group_by.length > 0 || layout.split_by.length > 0 || layout.measures.length > 0;
}

/** A pivot of measures, rather than a list of rows, grouped or not. */
function isPivotLayout(layout: Layout): boolean {
  return isGroupedLayout(layout) && !layout.detail;
}

/**
 * The columns a flat or detail grid shows, in order, as the engine orders them: the pinned ones first, then the rest
 * of `columns`, or of the dataset's when `columns` is empty.
 */
function shownColumns(layout: Layout, fields: readonly SourceField[]): readonly string[] {
  const rest = layout.columns.length > 0 ? layout.columns : fields.map((field) => field.name);
  return [...layout.pinned, ...rest.filter((column) => !layout.pinned.includes(column))];
}

/**
 * The columns a search looks in, as the engine resolves it: the text columns a flat grid shows; those and the group
 * columns of a detail view; the group and column-pivot columns of a pivot.
 */
function searchColumns(layout: Layout, fields: readonly SourceField[]): readonly string[] {
  const text = new Set(fields.filter((field) => field.kind === "text").map((field) => field.name));
  const inGroups = layout.detail ? shownColumns(layout, fields) : layout.split_by;
  const candidates = isGroupedLayout(layout)
    ? [...layout.group_by, ...inGroups]
    : shownColumns(layout, fields);
  return [...new Set(candidates.filter((column) => text.has(column)))];
}

/** Sorts a flat or detail grid by `column` alone, or stops sorting by it when `descending` is null. */
function withSort(layout: Layout, column: string, descending: boolean | null): Layout {
  return {
    ...layout,
    sort:
      descending === null
        ? layout.sort.filter((sort) => sort.column !== column)
        : [{ column, descending }],
  };
}

/** Hides `column`, listing the columns that stay when the layout listed none. */
function withHidden(layout: Layout, column: string, fields: readonly SourceField[]): Layout {
  const shown = shownColumns(layout, fields).filter((name) => name !== column);
  return { ...layout, columns: shown, pinned: layout.pinned.filter((name) => name !== column) };
}

/** Pins `column` at the left, after the columns pinned before it, or unpins it. */
function withPinned(layout: Layout, column: string, pinned: boolean): Layout {
  const rest = layout.pinned.filter((name) => name !== column);
  return { ...layout, pinned: pinned ? [...rest, column] : rest };
}

/** Gives `column` a title, or its name back when `title` is empty. */
function withTitle(layout: Layout, column: string, title: string): Layout {
  const titles = Object.fromEntries(
    Object.entries(layout.titles).filter(([name]) => name !== column),
  );
  const kept = title.trim() === "" || title === column;
  return { ...layout, titles: kept ? titles : { ...titles, [column]: title.trim() } };
}

/** The aggregates a column's total can use, by the column's kind. */
function totalChoices(kind: FieldKind): readonly Aggregate[] {
  if (kind === "integer" || kind === "float" || kind === "decimal") {
    return ["sum", "mean", "min", "max", "count", "distinct_count"];
  }
  if (kind === "date" || kind === "timestamp") {
    return ["min", "max", "count", "distinct_count"];
  }
  return ["count", "distinct_count"];
}

/** The total of `column`, or null without one. */
function totalOf(layout: Layout, column: string): Aggregate | null {
  return layout.totals.find((total) => total.column === column)?.aggregate ?? null;
}

/** Sets `column`'s total to `aggregate`, or removes it when null. */
function withTotal(layout: Layout, column: string, aggregate: Aggregate | null): Layout {
  const others = layout.totals.filter((total) => total.column !== column);
  if (aggregate === null) {
    return { ...layout, totals: others };
  }
  const total: LayoutMeasure = {
    aggregate,
    column,
    format: null,
    percentile: null,
    show_as: "value",
    unit_column: null,
    weight: null,
  };
  return { ...layout, totals: [...others, total] };
}

/** A column to move and the column it goes before, or null for the end of its zone. */
interface Placement {
  readonly column: string;
  readonly before: string | null;
}

/**
 * Moves a column to just before another, or to the end, within its own zone: a pinned column moves among the pinned
 * ones, any other among the rest.
 */
function withColumnBefore(
  layout: Layout,
  fields: readonly SourceField[],
  { column, before }: Placement,
): Layout {
  const pinned = layout.pinned.includes(column);
  const zone = pinned
    ? layout.pinned
    : shownColumns(layout, fields).filter((name) => !layout.pinned.includes(name));
  const others = zone.filter((name) => name !== column);
  const at = before === null ? -1 : others.indexOf(before);
  const moved =
    at === -1 ? [...others, column] : [...others.slice(0, at), column, ...others.slice(at)];
  return pinned
    ? { ...layout, pinned: moved }
    : { ...layout, columns: [...layout.pinned, ...moved] };
}

/** Shows or hides `column`; a column shown again comes last. */
function withShown(
  layout: Layout,
  fields: readonly SourceField[],
  { column, shown }: { readonly column: string; readonly shown: boolean },
): Layout {
  if (!shown) {
    return withHidden(layout, column, fields);
  }
  const listed = shownColumns(layout, fields);
  return listed.includes(column) ? layout : { ...layout, columns: [...listed, column] };
}

/**
 * Totals for a grid that has none: a count of its rows, under the first column it shows. No column is summed on its
 * own, since most of a desk's numbers, its prices, yields, spreads and durations, do not add; each column's menu
 * picks its total, a sum among them.
 */
function defaultTotals(layout: Layout, fields: readonly SourceField[]): Layout {
  const [first] = shownColumns(layout, fields);
  return first === undefined ? layout : withTotal({ ...layout, totals: [] }, first, "count");
}

/**
 * Groups a grid by `column`, after its other groups or before group `at`: its rows stay under their groups, as a
 * detail view, with every level open.
 */
function withGroupedBy(layout: Layout, column: string, at: number | null = null): Layout {
  const rest = layout.group_by.filter((name) => name !== column);
  const index = at === null ? rest.length : Math.max(0, Math.min(at, rest.length));
  const groupBy = [...rest.slice(0, index), column, ...rest.slice(index)];
  return {
    ...layout,
    detail: true,
    expand_depth: groupBy.length,
    expanded: [],
    group_by: groupBy,
    measures: [],
    split_by: [],
  };
}

/** Stops grouping by `column`; without groups left, the grid lists its rows again. */
function withoutGroup(layout: Layout, column: string): Layout {
  const groupBy = layout.group_by.filter((name) => name !== column);
  return {
    ...layout,
    detail: groupBy.length > 0 && layout.detail,
    expand_depth: Math.min(layout.expand_depth, groupBy.length),
    expanded: [],
    group_by: groupBy,
  };
}

/** Opens every group of a grouped grid, down to its rows, or closes every group, forgetting each one's own state. */
function withAllExpanded(layout: Layout, expanded: boolean): Layout {
  return { ...layout, expand_depth: expanded ? layout.group_by.length : 0, expanded: [] };
}

export {
  defaultTotals,
  isGroupedLayout,
  isPivotLayout,
  searchColumns,
  shownColumns,
  totalChoices,
  totalOf,
  withAllExpanded,
  withColumnBefore,
  withGroupedBy,
  withHidden,
  withoutGroup,
  withPinned,
  withShown,
  withSort,
  withTitle,
  withTotal,
};
export type { Placement };
