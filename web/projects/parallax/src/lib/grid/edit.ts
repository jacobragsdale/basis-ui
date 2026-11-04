/**
 * Pure edits of a grid's layout and what the toolbar and header menus show about it: which columns a search looks
 * in, the text of each filter's chip, and where a search's text appears in a cell. The pivot's own edits are in
 * `pivot/edit.ts`.
 */

import type { Layout, LayoutFilter, LayoutMeasure, LayoutScalar } from "../layout";
import { operandOf } from "../pivot/edit";
import { label } from "../pivot/labels";
import type { SourceField } from "./grid-source";

/** Whether a layout groups its rows: a pivot, or a detail view. */
export function isGroupedLayout(layout: Layout): boolean {
  return layout.group_by.length > 0 || layout.split_by.length > 0 || layout.measures.length > 0;
}

/**
 * The columns a flat or detail grid shows, in order, as the engine orders them: the pinned ones first, then the rest
 * of `columns`, or of the dataset's when `columns` is empty.
 */
export function shownColumns(layout: Layout, fields: readonly SourceField[]): readonly string[] {
  const rest = layout.columns.length > 0 ? layout.columns : fields.map((f) => f.name);
  return [...layout.pinned, ...rest.filter((c) => !layout.pinned.includes(c))];
}

/**
 * The columns a search looks in, as the engine resolves it: the text columns a flat grid shows; those and the group
 * columns of a detail view; the group and column-pivot columns of a pivot.
 */
export function searchColumns(layout: Layout, fields: readonly SourceField[]): readonly string[] {
  const text = new Set(fields.filter((f) => f.kind === "text").map((f) => f.name));
  const candidates = isGroupedLayout(layout) ? [...layout.group_by, ...(layout.detail ? shownColumns(layout, fields) : layout.split_by)] : shownColumns(layout, fields);
  return [...new Set(candidates.filter((c) => text.has(c)))];
}

/** A filter value as a chip shows it: `(blank)` for null. */
function valueText(value: LayoutScalar): string {
  return value === null ? "(blank)" : String(value);
}

/** The most values a chip lists before it says how many more there are. */
const CHIP_VALUES = 3;

/** The text of a filter's chip, such as `sector: Energy, Utilities` or `price ≥ 100`. `title` names a column. */
export function filterLabel(filter: LayoutFilter, title: (column: string) => string): string {
  const columns = [filter.column, ...filter.columns].map(title);
  const subject = columns.length > 1 ? `${columns[0] ?? ""} or ${String(columns.length - 1)} more` : (columns[0] ?? "");
  switch (operandOf(filter.op)) {
    case "many": {
      const shown = filter.values.slice(0, CHIP_VALUES).map(valueText).join(", ");
      const more = filter.values.length > CHIP_VALUES ? ` +${String(filter.values.length - CHIP_VALUES)} more` : "";
      return `${subject}: ${filter.op === "not_in" ? "not " : ""}${shown}${more}`;
    }
    case "none":
      return `${subject} ${label(filter.op)}`;
    case "one":
      return `${subject} ${label(filter.op)} ${valueText(filter.value)}`;
  }
}

/** The layout without its filter at `index`. */
export function withoutFilter(layout: Layout, index: number): Layout {
  return { ...layout, filters: layout.filters.filter((_, i) => i !== index) };
}

/** The layout without any filter or search. */
export function withoutFilters(layout: Layout): Layout {
  return { ...layout, filters: [], search: "" };
}

/** The layout with its search set to `text`. */
export function withSearch(layout: Layout, text: string): Layout {
  return { ...layout, search: text };
}

/**
 * Where `search` appears in `text`, ignoring case, as start and end offsets, each match after the last. Empty when
 * lowering the text changes its length, which a few scripts do, rather than mark the wrong letters.
 */
export function highlightRanges(text: string, search: string): readonly (readonly [number, number])[] {
  if (search === "" || text === "") {
    return [];
  }
  const lower = text.toLowerCase();
  const needle = search.toLowerCase();
  if (lower.length !== text.length) {
    return [];
  }
  const out: (readonly [number, number])[] = [];
  let from = lower.indexOf(needle);
  while (from !== -1) {
    out.push([from, from + needle.length]);
    from = lower.indexOf(needle, from + needle.length);
  }
  return out;
}

/** A column's filter as the header menu edits it: a list of values to keep, a condition, a range, or none. */
export type ColumnCondition =
  | { readonly kind: "none" }
  | { readonly kind: "values"; readonly values: readonly LayoutScalar[] }
  | { readonly kind: "one"; readonly op: LayoutFilter["op"]; readonly value: LayoutScalar }
  | { readonly kind: "between"; readonly from: LayoutScalar; readonly to: LayoutScalar };

/** The filters on `column` alone, which the header menu owns; a search or a filter across columns is not one. */
function ownFilters(layout: Layout, column: string): readonly LayoutFilter[] {
  return layout.filters.filter((f) => f.column === column && f.columns.length === 0);
}

/** How the header menu reads `column`'s filters: a list, a condition, a range of `ge` and `le`, or none. */
export function columnCondition(layout: Layout, column: string): ColumnCondition {
  const own = ownFilters(layout, column);
  const [first, second] = own;
  if (first === undefined) {
    return { kind: "none" };
  }
  if (own.length === 2 && second !== undefined && first.op === "ge" && second.op === "le") {
    return { kind: "between", from: first.value, to: second.value };
  }
  if (first.op === "in") {
    return { kind: "values", values: first.values };
  }
  return { kind: "one", op: first.op, value: first.value };
}

/** The layout with `column`'s own filters replaced by `condition`, leaving every other filter as it was. */
export function withColumnCondition(layout: Layout, column: string, condition: ColumnCondition): Layout {
  const others = layout.filters.filter((f) => !(f.column === column && f.columns.length === 0));
  const base = { column, value: null, values: [], columns: [] };
  const added: readonly LayoutFilter[] = ((): readonly LayoutFilter[] => {
    switch (condition.kind) {
      case "none":
        return [];
      case "values":
        return condition.values.length === 0 ? [] : [{ ...base, op: "in", values: [...condition.values] }];
      case "one":
        return [{ ...base, op: condition.op, value: condition.value }];
      case "between":
        return [
          { ...base, op: "ge", value: condition.from },
          { ...base, op: "le", value: condition.to }
        ];
    }
  })();
  return { ...layout, filters: [...others, ...added] };
}

/** Whether `column` has a filter of its own, which fills its header's funnel. */
export function isFiltered(layout: Layout, column: string): boolean {
  return ownFilters(layout, column).length > 0;
}

/** Sorts a flat or detail grid by `column` alone, or stops sorting by it when `descending` is null. */
export function withSort(layout: Layout, column: string, descending: boolean | null): Layout {
  return { ...layout, sort: descending === null ? layout.sort.filter((s) => s.column !== column) : [{ column, descending }] };
}

/** Hides `column`, listing the columns that stay when the layout listed none. */
export function withHidden(layout: Layout, column: string, fields: readonly SourceField[]): Layout {
  const shown = shownColumns(layout, fields).filter((c) => c !== column);
  return { ...layout, columns: shown, pinned: layout.pinned.filter((c) => c !== column) };
}

/** Pins `column` at the left, after the columns pinned before it, or unpins it. */
export function withPinned(layout: Layout, column: string, pinned: boolean): Layout {
  const rest = layout.pinned.filter((c) => c !== column);
  return { ...layout, pinned: pinned ? [...rest, column] : rest };
}

/** Gives `column` a title, or its name back when `title` is empty. */
export function withTitle(layout: Layout, column: string, title: string): Layout {
  const titles = Object.fromEntries(Object.entries(layout.titles).filter(([c]) => c !== column));
  return { ...layout, titles: title.trim() === "" || title === column ? titles : { ...titles, [column]: title.trim() } };
}

/** The aggregates a column's total can use, by the column's kind. */
export function totalChoices(kind: SourceField["kind"]): readonly LayoutMeasure["aggregate"][] {
  switch (kind) {
    case "integer":
    case "float":
    case "decimal":
      return ["sum", "mean", "min", "max", "count", "distinct_count"];
    case "date":
    case "timestamp":
      return ["min", "max", "count", "distinct_count"];
    case "text":
    case "boolean":
      return ["count", "distinct_count"];
  }
}

/** The total of `column`, or null without one. */
export function totalOf(layout: Layout, column: string): LayoutMeasure["aggregate"] | null {
  return layout.totals.find((t) => t.column === column)?.aggregate ?? null;
}

/** Sets `column`'s total to `aggregate`, or removes it when null. */
export function withTotal(layout: Layout, column: string, aggregate: LayoutMeasure["aggregate"] | null): Layout {
  const others = layout.totals.filter((t) => t.column !== column);
  if (aggregate === null) {
    return { ...layout, totals: others };
  }
  return { ...layout, totals: [...others, { column, aggregate, percentile: null, weight: null, unit_column: null, show_as: "value", format: null }] };
}
