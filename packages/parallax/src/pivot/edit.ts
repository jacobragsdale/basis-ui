/* Edits to a pivot's layout from its field list, as pure functions: a field placed in Rows, Columns or Values, a chip
 * moved or removed, a field ticked or unticked, and the options. Each returns a new layout. Changing the row groups
 * forgets which groups were opened by hand, because their paths no longer mean the same thing. */

import type { SourceField } from "#grid/fields.ts";
import type { Layout, LayoutMeasure } from "#layout/layout.ts";

import { isNumeric } from "./labels.ts";
import type { Area, ChipArea } from "./labels.ts";
import { addMeasure, measure, moved, moveMeasure, removeMeasure } from "./measures.ts";

/** Which list of group columns an edit applies to. */
type Axis = "group_by" | "split_by";

/** A chip in an area, by its position there. */
interface Placed {
  readonly area: ChipArea;
  readonly index: number;
}

/** A place a chip or field goes: an area, before chip `at` there, or at its end for null. */
interface Target {
  readonly area: ChipArea;
  readonly at: number | null;
}

const axisOf: Readonly<Record<"rows" | "columns", Axis>> = {
  columns: "split_by",
  rows: "group_by",
};

/** Keeps `expanded` only while the row groups stay the same. */
function withAxis(layout: Layout, axis: Axis, columns: readonly string[]): Layout {
  return axis === "group_by"
    ? { ...layout, expanded: [], group_by: [...columns] }
    : { ...layout, split_by: [...columns] };
}

/** Removes the group at `index`. */
function removeGroup(layout: Layout, axis: Axis, index: number): Layout {
  return withAxis(
    layout,
    axis,
    layout[axis].filter((_column, at) => at !== index),
  );
}

/** The measure a field gets on Values: the mean of a number column, and the count of any other. Excel sums a number,
 * but most of a desk's numbers, its prices, yields, spreads and durations, do not add, so a sum is picked in the
 * value's menu where one is meant. */
function defaultMeasure(field: SourceField): LayoutMeasure {
  return isNumeric(field) ? measure("mean", field.name) : measure("count", field.name);
}

/** Where a position before which to insert lands once the item at `from` is taken out; null is the end. */
function landing(at: number | null, from: number, length: number): number {
  let target = at ?? length - 1;
  if (at !== null && at > from) {
    target = at - 1;
  }
  return Math.max(0, Math.min(target, length - 1));
}

/** Inserts `item` before position `at`, or at the end for null. */
function insert<TItem>(items: readonly TItem[], at: number | null, item: TItem): readonly TItem[] {
  const index = at === null ? items.length : Math.max(0, Math.min(at, items.length));
  return [...items.slice(0, index), item, ...items.slice(index)];
}

/**
 * Puts a field in Rows, Columns or Values, before chip `at` or at the end. A field groups one way, so it leaves the
 * other axis; on Values it becomes a new measure. A filter is not part of the layout until it says what to keep, so
 * the field list keeps filters that are being set up.
 */
function placeField(layout: Layout, field: SourceField, { area, at }: Target): Layout {
  if (area === "values") {
    const added = addMeasure(layout, defaultMeasure(field));
    const last = added.measures.length - 1;
    return at === null ? added : moveMeasure(added, last, at - last);
  }
  const axis = axisOf[area];
  const other: Axis = axis === "group_by" ? "split_by" : "group_by";
  const cleared = layout[other].includes(field.name)
    ? withAxis(
        layout,
        other,
        layout[other].filter((column) => column !== field.name),
      )
    : layout;
  const kept = cleared[axis].filter((column) => column !== field.name);
  return withAxis(cleared, axis, insert(kept, at, field.name));
}

/** The column a chip shows, or null for a count of rows, which has none. */
function chipColumn(layout: Layout, chip: Placed): string | null {
  return chip.area === "values"
    ? (layout.measures[chip.index]?.column ?? null)
    : (layout[axisOf[chip.area]][chip.index] ?? null);
}

/** How many chips an area holds. */
function chipCount(layout: Layout, area: ChipArea): number {
  return area === "values" ? layout.measures.length : layout[axisOf[area]].length;
}

/** Takes a chip out of its area. */
function removeChip(layout: Layout, chip: Placed): Layout {
  return chip.area === "values"
    ? removeMeasure(layout, chip.index)
    : removeGroup(layout, axisOf[chip.area], chip.index);
}

/** Moves a chip within its own area, before chip `at` as the area shows before the move, or to the end for null. */
function reorderChip(layout: Layout, from: Placed, at: number | null): Layout {
  const target = landing(at, from.index, chipCount(layout, from.area));
  const delta = target - from.index;
  if (delta === 0) {
    return layout;
  }
  if (from.area === "values") {
    return moveMeasure(layout, from.index, delta);
  }
  const axis = axisOf[from.area];
  return withAxis(layout, axis, moved(layout[axis], from.index, delta));
}

/**
 * Moves a chip to an area, before chip `at` as the area shows before the move, or to the end for null. Within an area
 * it reorders; to another area the field moves, as in Excel. A count of rows has no column to group by, so it stays.
 */
function moveChip(
  layout: Layout,
  { from, to }: { readonly from: Placed; readonly to: Target },
  fields: readonly SourceField[],
): Layout {
  if (from.area === to.area) {
    return reorderChip(layout, from, to.at);
  }
  const column = chipColumn(layout, from);
  const field = fields.find((entry) => entry.name === column);
  // Another area's chips keep their positions when this one leaves its own.
  return field === undefined ? layout : placeField(removeChip(layout, from), field, to);
}

/** The areas a field is in. */
function areasOf(layout: Layout, column: string): readonly Area[] {
  const inAreas: readonly (readonly [Area, boolean])[] = [
    ["rows", layout.group_by.includes(column)],
    ["columns", layout.split_by.includes(column)],
    ["values", layout.measures.some((entry) => entry.column === column)],
    [
      "filters",
      layout.filters.some((filter) => filter.column === column && filter.columns.length === 0),
    ],
  ];
  return inAreas.filter(([, holds]) => holds).map(([area]) => area);
}

/** Ticks a field, which puts it where Excel does: a number on Values, and anything else on Rows. */
function withField(layout: Layout, field: SourceField): Layout {
  return placeField(layout, field, { area: isNumeric(field) ? "values" : "rows", at: null });
}

/** Unticks a field, which takes it out of every area: its groups, the measures of it or weighted by it, and its
 * filters. */
function withoutField(layout: Layout, column: string): Layout {
  const ungrouped = withAxis(
    withAxis(
      layout,
      "group_by",
      layout.group_by.filter((name) => name !== column),
    ),
    "split_by",
    layout.split_by.filter((name) => name !== column),
  );
  let unmeasured = ungrouped;
  for (let index = ungrouped.measures.length - 1; index >= 0; index -= 1) {
    const entry = ungrouped.measures[index];
    if (entry?.column === column || entry?.weight === column) {
      unmeasured = removeMeasure(unmeasured, index);
    }
  }
  return {
    ...unmeasured,
    filters: unmeasured.filters.filter(
      (filter) => !(filter.column === column && filter.columns.length === 0),
    ),
  };
}

/** A top-N of `count` groups by measure `by`, the largest, with the rest as Other. */
function topN(count: number, by: number): NonNullable<Layout["top_n"]> {
  // oxlint-disable-next-line eslint/id-length -- `n` is the layout's JSON field, as parallax-protocol's Rust names it.
  return { largest: true, measure: by, n: count, other: true };
}

/** Sets or clears top-N. */
function setTopN(layout: Layout, top: Layout["top_n"]): Layout {
  return { ...layout, top_n: top };
}

/** Sets how many levels open by default, forgetting groups opened or closed by hand. */
function setExpandDepth(layout: Layout, depth: number): Layout {
  return { ...layout, expand_depth: Math.max(0, Math.floor(depth)), expanded: [] };
}

export {
  areasOf,
  chipColumn,
  chipCount,
  defaultMeasure,
  moveChip,
  placeField,
  removeChip,
  removeGroup,
  setExpandDepth,
  setTopN,
  topN,
  withField,
  withoutField,
};
export type { Axis, Placed, Target };
