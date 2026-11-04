/**
 * Pure edits of a grid's layout and what the toolbar and header menus show about it: which columns a search looks
 * in, the text of each filter's chip, and where a search's text appears in a cell. The pivot's own edits are in
 * `pivot/edit.ts`.
 */

import type { Layout, LayoutFilter, LayoutScalar } from "../layout";
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
