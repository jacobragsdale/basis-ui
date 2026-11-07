/* A grid's filters and search, as its toolbar and header menus show and edit them: the text of each filter's chip,
 * where a search's text appears in a cell, and a column's own filter as the header menu reads and writes it. */

import type { Layout, LayoutFilter, LayoutScalar } from "#layout/layout.ts";

import { label, operandOf } from "./labels.ts";

/** The most values a chip lists before it says how many more there are. */
const chipValues = 3;

/** A filter value as a chip shows it: `(blank)` for null. */
function valueText(value: LayoutScalar): string {
  return value === null ? "(blank)" : String(value);
}

/** A list filter's values, as a chip shows them: the first few, then how many more. */
function listText(filter: LayoutFilter): string {
  const shown = filter.values.slice(0, chipValues).map((value) => valueText(value));
  const more =
    filter.values.length > chipValues ? ` +${String(filter.values.length - chipValues)} more` : "";
  return `${filter.op === "not_in" ? "not " : ""}${shown.join(", ")}${more}`;
}

/** The text of a filter's chip, such as `sector: Energy, Utilities` or `price ≥ 100`. `title` names a column. */
function filterLabel(filter: LayoutFilter, title: (column: string) => string): string {
  const columns = [filter.column, ...filter.columns].map((column) => title(column));
  const [first = ""] = columns;
  const subject = columns.length > 1 ? `${first} or ${String(columns.length - 1)} more` : first;
  const operand = operandOf(filter.op);
  if (operand === "many") {
    return `${subject}: ${listText(filter)}`;
  }
  if (operand === "none") {
    return `${subject} ${label(filter.op)}`;
  }
  return `${subject} ${label(filter.op)} ${valueText(filter.value)}`;
}

/** The layout without its filter at `index`. */
function withoutFilter(layout: Layout, index: number): Layout {
  return { ...layout, filters: layout.filters.filter((_filter, at) => at !== index) };
}

/** The layout without any filter or search. */
function withoutFilters(layout: Layout): Layout {
  return { ...layout, filters: [], search: "" };
}

/** The layout with its search set to `text`. */
function withSearch(layout: Layout, text: string): Layout {
  return { ...layout, search: text };
}

/** Ranges of a cell's text, as start and end offsets. */
type Ranges = readonly (readonly [number, number])[];

/**
 * Where `search` appears in `text`, ignoring case, as start and end offsets, each match after the last. Empty when
 * lowering the text changes its length, which a few scripts do, rather than mark the wrong letters.
 */
function highlightRanges(text: string, search: string): Ranges {
  const lower = text.toLowerCase();
  if (search === "" || text === "" || lower.length !== text.length) {
    return [];
  }
  const needle = search.toLowerCase();
  const found: (readonly [number, number])[] = [];
  for (
    let from = lower.indexOf(needle);
    from !== -1;
    from = lower.indexOf(needle, from + needle.length)
  ) {
    found.push([from, from + needle.length]);
  }
  return found;
}

/** A column's filter as the header menu edits it: a list of values to keep, a condition, a range, or none. */
type ColumnCondition =
  | { readonly kind: "none" }
  | { readonly kind: "values"; readonly values: readonly LayoutScalar[] }
  | { readonly kind: "one"; readonly op: LayoutFilter["op"]; readonly value: LayoutScalar }
  | { readonly kind: "between"; readonly from: LayoutScalar; readonly to: LayoutScalar };

/** Whether `filter` is one of `column`'s own, which the header menu owns; a search or a filter across columns is not. */
function isOwn(filter: LayoutFilter, column: string): boolean {
  return filter.column === column && filter.columns.length === 0;
}

/** How the header menu reads `column`'s filters: a list, a condition, a range of `ge` and `le`, or none. */
function columnCondition(layout: Layout, column: string): ColumnCondition {
  const own = layout.filters.filter((filter) => isOwn(filter, column));
  const [first, second] = own;
  if (first === undefined) {
    return { kind: "none" };
  }
  if (own.length === 2 && second !== undefined && first.op === "ge" && second.op === "le") {
    return { from: first.value, kind: "between", to: second.value };
  }
  if (first.op === "in") {
    return { kind: "values", values: first.values };
  }
  return { kind: "one", op: first.op, value: first.value };
}

/** The filters a condition on `column` adds. */
function conditionFilters(column: string, condition: ColumnCondition): readonly LayoutFilter[] {
  const base = { column, columns: [], value: null, values: [] };
  switch (condition.kind) {
    case "none": {
      return [];
    }
    case "values": {
      return condition.values.length === 0
        ? []
        : [{ ...base, op: "in", values: [...condition.values] }];
    }
    case "one": {
      return [{ ...base, op: condition.op, value: condition.value }];
    }
    case "between": {
      return [
        { ...base, op: "ge", value: condition.from },
        { ...base, op: "le", value: condition.to },
      ];
    }
    default: {
      return condition satisfies never;
    }
  }
}

/** The layout with `column`'s own filters replaced by `condition`, leaving every other filter as it was. */
function withColumnCondition(layout: Layout, column: string, condition: ColumnCondition): Layout {
  const others = layout.filters.filter((filter) => !isOwn(filter, column));
  return { ...layout, filters: [...others, ...conditionFilters(column, condition)] };
}

/** Whether `column` has a filter of its own, which fills its header's funnel. */
function isFiltered(layout: Layout, column: string): boolean {
  return layout.filters.some((filter) => isOwn(filter, column));
}

export {
  columnCondition,
  filterLabel,
  highlightRanges,
  isFiltered,
  withColumnCondition,
  withoutFilter,
  withoutFilters,
  withSearch,
};
export type { ColumnCondition, Ranges };
