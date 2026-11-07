/**
 * Edits to a pivot layout, as pure functions. Each returns a new layout and keeps
 * the parts that refer to measures or groups by position consistent: removing a
 * measure drops the sorts, filters and widths that named it and renumbers the
 * rest, and changing the row groups forgets which groups were expanded, because
 * their paths no longer mean the same thing.
 */

import type { FieldKind, SourceField } from "../grid/grid-source";
import { measureOfWidthKey, measureWidthKey } from "../layout";
import type { Layout, LayoutFilter, LayoutFormat, LayoutMeasure, LayoutScalar } from "../layout";
import { NUMERIC_KINDS } from "./labels";

/** Which list of group columns an edit applies to. */
export type Axis = "group_by" | "split_by";

function move<T>(items: readonly T[], index: number, delta: number): readonly T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return items;
  }
  const out = [...items];
  const [item] = out.splice(index, 1);
  if (item !== undefined) {
    out.splice(target, 0, item);
  }
  return out;
}

/** Keeps `expanded` only while the row groups stay the same. */
function withAxis(layout: Layout, axis: Axis, columns: readonly string[]): Layout {
  return axis === "group_by" ? { ...layout, group_by: [...columns], expanded: [] } : { ...layout, split_by: [...columns] };
}

/** Adds a column to the end of the row or column groups, if it is not there already. */
export function addGroup(layout: Layout, axis: Axis, column: string): Layout {
  return layout[axis].includes(column) ? layout : withAxis(layout, axis, [...layout[axis], column]);
}

/** Removes the group at `index`. */
export function removeGroup(layout: Layout, axis: Axis, index: number): Layout {
  return withAxis(
    layout,
    axis,
    layout[axis].filter((_, i) => i !== index)
  );
}

/** Moves the group at `index` up (`-1`) or down (`1`). */
export function moveGroup(layout: Layout, axis: Axis, index: number, delta: number): Layout {
  return withAxis(layout, axis, move(layout[axis], index, delta));
}

/** Renumbers measure references after the measures were reordered: `from[old]` is the new position, or null if removed. */
function renumber(layout: Layout, measures: readonly LayoutMeasure[], from: readonly (number | null)[]): Layout {
  const at = (old: number): number | null => from[old] ?? null;
  const by = layout.group_sort.by;
  const sortedBy = by === "key" ? null : at(by.measure);
  const widths: Record<string, number> = {};
  for (const [key, width] of Object.entries(layout.column_widths)) {
    const old = measureOfWidthKey(key);
    if (old === null) {
      widths[key] = width;
    } else {
      const now = at(old);
      if (now !== null) {
        widths[measureWidthKey(now)] = width;
      }
    }
  }
  const topMeasure = layout.top_n === null ? null : at(layout.top_n.measure);
  return {
    ...layout,
    measures: [...measures],
    group_sort: sortedBy === null ? { by: "key", descending: by === "key" ? layout.group_sort.descending : false } : { by: { measure: sortedBy }, descending: layout.group_sort.descending },
    having: layout.having.flatMap((h) => {
      const now = at(h.measure);
      return now === null ? [] : [{ ...h, measure: now }];
    }),
    top_n: layout.top_n === null || topMeasure === null ? null : { ...layout.top_n, measure: topMeasure },
    column_widths: widths
  };
}

/** A measure with every field at its default. */
export function measure(aggregate: LayoutMeasure["aggregate"], column: string | null): LayoutMeasure {
  return { column, aggregate, percentile: aggregate === "percentile" ? 0.5 : null, weight: null, unit_column: null, show_as: "value", format: null };
}

/** Adds a measure at the end. */
export function addMeasure(layout: Layout, added: LayoutMeasure): Layout {
  return { ...layout, measures: [...layout.measures, added] };
}

/** Removes the measure at `index`, with the sorts, filters and widths that named it. */
export function removeMeasure(layout: Layout, index: number): Layout {
  const from = layout.measures.map((_, i) => (i === index ? null : i < index ? i : i - 1));
  return renumber(
    layout,
    layout.measures.filter((_, i) => i !== index),
    from
  );
}

/** Moves the measure at `index` up (`-1`) or down (`1`). */
export function moveMeasure(layout: Layout, index: number, delta: number): Layout {
  const target = index + delta;
  if (index < 0 || index >= layout.measures.length || target < 0 || target >= layout.measures.length) {
    return layout;
  }
  const order = move(
    layout.measures.map((_, i) => i),
    index,
    delta
  );
  const from = layout.measures.map((_, old) => order.indexOf(old));
  return renumber(
    layout,
    order.map((old) => layout.measures[old]).filter((m) => m !== undefined),
    from
  );
}

/** Replaces fields of the measure at `index`. */
export function updateMeasure(layout: Layout, index: number, patch: Partial<LayoutMeasure>): Layout {
  return { ...layout, measures: layout.measures.map((m, i) => (i === index ? { ...m, ...patch } : m)) };
}

/** A filter with every field at its default. */
export function filter(column: string, op: LayoutFilter["op"]): LayoutFilter {
  return { column, op, value: null, values: [], columns: [] };
}

/** Adds a filter at the end. */
export function addFilter(layout: Layout, added: LayoutFilter): Layout {
  return { ...layout, filters: [...layout.filters, added] };
}

/** Removes the filter at `index`. */
export function removeFilter(layout: Layout, index: number): Layout {
  return { ...layout, filters: layout.filters.filter((_, i) => i !== index) };
}

/** Replaces fields of the filter at `index`. */
export function updateFilter(layout: Layout, index: number, patch: Partial<LayoutFilter>): Layout {
  return { ...layout, filters: layout.filters.map((f, i) => (i === index ? { ...f, ...patch } : f)) };
}

/** Whether an operator takes one value, a list, or none. */
export function operandOf(op: LayoutFilter["op"]): "one" | "many" | "none" {
  switch (op) {
    case "in":
    case "not_in":
      return "many";
    case "is_null":
    case "is_not_null":
      return "none";
    case "eq":
    case "ne":
    case "lt":
    case "le":
    case "gt":
    case "ge":
    case "contains":
    case "not_contains":
    case "starts_with":
    case "ends_with":
      return "one";
  }
}

/**
 * Reads typed filter text as the JSON value the engine expects for the column:
 * numbers for doubles, booleans for booleans, and text for everything else, which
 * keeps decimals and large integers exact. Empty text is null.
 */
export function filterValue(kind: FieldKind, text: string): LayoutScalar {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  switch (kind) {
    case "float": {
      const number = Number(trimmed);
      return Number.isFinite(number) ? number : trimmed;
    }
    case "boolean":
      return trimmed.toLowerCase() === "true" ? true : trimmed.toLowerCase() === "false" ? false : trimmed;
    case "integer":
    case "decimal":
    case "date":
    case "timestamp":
      return trimmed;
    case "text":
      return text;
  }
}

/** Sets or clears top-N. */
export function setTopN(layout: Layout, topN: Layout["top_n"]): Layout {
  return { ...layout, top_n: topN };
}

/** Sets how many levels open by default, forgetting groups opened or closed by hand. */
export function setExpandDepth(layout: Layout, depth: number): Layout {
  return { ...layout, expand_depth: Math.max(0, Math.floor(depth)), expanded: [] };
}

/**
 * A flat view of the rows behind one group: the pivot's filters plus one filter
 * per group level and, for a cell under column pivots, one per pivot level, with
 * the pivot's formats. An empty path is the grand total.
 */
export function drillLayout(layout: Layout, path: readonly LayoutScalar[], split: readonly LayoutScalar[] | null = null): Layout {
  const match = (columns: readonly string[], values: readonly LayoutScalar[]): (LayoutFilter | null)[] =>
    values.map((value, i) => {
      const column = columns[i];
      if (column === undefined) {
        return null;
      }
      return value === null ? filter(column, "is_null") : { ...filter(column, "eq"), value };
    });
  const levels = [...match(layout.group_by, path), ...match(layout.split_by, split ?? [])];
  return {
    ...layout,
    columns: [],
    group_by: [],
    split_by: [],
    measures: [],
    filters: [...layout.filters, ...levels.filter((f) => f !== null)],
    sort: [],
    group_sort: { by: "key", descending: false },
    having: [],
    top_n: null,
    expand_depth: 0,
    expanded: [],
    column_widths: {}
  };
}

/** The four places of a pivot's field list, as Excel names them. */
export type Area = "rows" | "columns" | "values" | "filters";

/** The areas that hold chips in the layout's own order: groups and measures. A filter is kept by column. */
export type ChipArea = "rows" | "columns" | "values";

/** A chip in an area, by its position there. */
export interface Placed {
  readonly area: ChipArea;
  readonly index: number;
}

const AXIS_OF: Readonly<Record<"rows" | "columns", Axis>> = { rows: "group_by", columns: "split_by" };

/** The measure a field gets on Values, as Excel gives it: the sum of a number column, and the count of any other. */
export function defaultMeasure(field: SourceField): LayoutMeasure {
  return NUMERIC_KINDS.includes(field.kind) ? measure("sum", field.name) : measure("count", field.name);
}

/** Where a position before which to insert lands once the item at `from` is taken out; null is the end. */
function landing(at: number | null, from: number, length: number): number {
  const target = at === null ? length - 1 : at > from ? at - 1 : at;
  return Math.max(0, Math.min(target, length - 1));
}

/** Inserts `item` before position `at`, or at the end for null. */
function insert<T>(items: readonly T[], at: number | null, item: T): readonly T[] {
  const index = at === null ? items.length : Math.max(0, Math.min(at, items.length));
  return [...items.slice(0, index), item, ...items.slice(index)];
}

/** Moves the measure at `from` to position `to`, renumbering what names measures by position. */
export function moveMeasureTo(layout: Layout, from: number, to: number): Layout {
  return moveMeasure(layout, from, to - from);
}

/**
 * Puts a field in Rows, Columns or Values, before chip `at` or at the end. A field groups one way, so it leaves the
 * other axis; on Values it becomes a new measure. A filter is not part of the layout until it says what to keep, so
 * the field list keeps filters that are being set up.
 */
export function placeField(layout: Layout, field: SourceField, area: ChipArea, at: number | null = null): Layout {
  if (area === "values") {
    const added = addMeasure(layout, defaultMeasure(field));
    return at === null ? added : moveMeasureTo(added, added.measures.length - 1, at);
  }
  const axis = AXIS_OF[area];
  const other: Axis = axis === "group_by" ? "split_by" : "group_by";
  const cleared = layout[other].includes(field.name)
    ? withAxis(
        layout,
        other,
        layout[other].filter((c) => c !== field.name)
      )
    : layout;
  const kept = cleared[axis].filter((c) => c !== field.name);
  return withAxis(cleared, axis, insert(kept, at, field.name));
}

/** The column a chip shows, or null for a count of rows, which has none. */
export function chipColumn(layout: Layout, chip: Placed): string | null {
  return chip.area === "values" ? (layout.measures[chip.index]?.column ?? null) : (layout[AXIS_OF[chip.area]][chip.index] ?? null);
}

/** Takes a chip out of its area. */
export function removeChip(layout: Layout, chip: Placed): Layout {
  return chip.area === "values" ? removeMeasure(layout, chip.index) : removeGroup(layout, AXIS_OF[chip.area], chip.index);
}

/**
 * Moves a chip to an area, before chip `at` as the area shows before the move, or to the end for null. Within an area
 * it reorders; to another area the field moves, as in Excel. A count of rows has no column to group by, so it stays.
 */
export function moveChip(layout: Layout, from: Placed, to: ChipArea, at: number | null, fields: readonly SourceField[]): Layout {
  if (from.area === to) {
    const length = to === "values" ? layout.measures.length : layout[AXIS_OF[to]].length;
    const target = landing(at, from.index, length);
    if (target === from.index) {
      return layout;
    }
    return to === "values" ? moveMeasureTo(layout, from.index, target) : moveGroup(layout, AXIS_OF[to], from.index, target - from.index);
  }
  const column = chipColumn(layout, from);
  const field = fields.find((f) => f.name === column);
  if (field === undefined) {
    return layout;
  }
  // Another area's chips keep their positions when this one leaves its own.
  return placeField(removeChip(layout, from), field, to, at);
}

/** The areas a field is in. */
export function areasOf(layout: Layout, column: string): readonly Area[] {
  const areas: Area[] = [];
  if (layout.group_by.includes(column)) {
    areas.push("rows");
  }
  if (layout.split_by.includes(column)) {
    areas.push("columns");
  }
  if (layout.measures.some((m) => m.column === column)) {
    areas.push("values");
  }
  if (layout.filters.some((f) => f.column === column && f.columns.length === 0)) {
    areas.push("filters");
  }
  return areas;
}

/** Ticks a field, which puts it where Excel does: a number on Values, and anything else on Rows. */
export function withField(layout: Layout, field: SourceField): Layout {
  return placeField(layout, field, NUMERIC_KINDS.includes(field.kind) ? "values" : "rows");
}

/** Unticks a field, which takes it out of every area: its groups, the measures of it or weighted by it, and its filters. */
export function withoutField(layout: Layout, column: string): Layout {
  let next = withAxis(
    withAxis(
      layout,
      "group_by",
      layout.group_by.filter((c) => c !== column)
    ),
    "split_by",
    layout.split_by.filter((c) => c !== column)
  );
  for (let i = next.measures.length - 1; i >= 0; i -= 1) {
    const m = next.measures[i];
    if (m !== undefined && (m.column === column || m.weight === column)) {
      next = removeMeasure(next, i);
    }
  }
  return { ...next, filters: next.filters.filter((f) => !(f.column === column && f.columns.length === 0)) };
}

/** A format with every part at its default, which shows a measure as its column does. */
const PLAIN_FORMAT: LayoutFormat = { decimals: null, thousands: null, percent: false, abbreviate: null, negative: "minus", zone: null, precision: "seconds" };

/** Changes parts of a measure's display format; with every part back at its default, the measure has none. */
export function withMeasureFormat(layout: Layout, index: number, patch: Partial<LayoutFormat>): Layout {
  const current = layout.measures[index];
  if (current === undefined) {
    return layout;
  }
  const format: LayoutFormat = { ...(current.format ?? PLAIN_FORMAT), ...patch };
  const parts = Object.entries(format);
  const plain = Object.entries(PLAIN_FORMAT).every(([key, value]) => parts.find(([k]) => k === key)?.[1] === value);
  return updateMeasure(layout, index, { format: plain ? null : format });
}

/** Sorts a pivot's groups by measure `index`, largest first when descending, or by their keys again for null. */
export function withMeasureSort(layout: Layout, index: number, descending: boolean | null): Layout {
  return { ...layout, group_sort: descending === null ? { by: "key", descending: false } : { by: { measure: index }, descending } };
}

/** Whether a pivot's groups are sorted by measure `index`: largest first, smallest first, or not by it. */
export function measureSort(layout: Layout, index: number): "descending" | "ascending" | null {
  const { by, descending } = layout.group_sort;
  if (by === "key" || by.measure !== index) {
    return null;
  }
  return descending ? "descending" : "ascending";
}
