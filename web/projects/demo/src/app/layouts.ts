/** Layout pieces the demo's chart pages share. */

import type { ChartSelection, LayoutFilter, LayoutInput } from "parallax";

/** A measure and its share of the whole, which a pie's legend, slices and tooltip read; a count when `column` is null. */
export function withShare(column: string | null): LayoutInput["measures"] {
  const aggregate = column === null ? ("count_all" as const) : ("sum" as const);
  return [
    { column, aggregate },
    { column, aggregate, show_as: "percent_of_grand_total" }
  ];
}

/**
 * The layout with `column`'s own filters replaced by one keeping `selection`, or by none when the selection is
 * cleared; a search and the filters on other columns stay as the user set them.
 */
export function withSelection(layout: LayoutInput, column: string, selection: ChartSelection | null): LayoutInput {
  const others = (layout.filters ?? []).filter((f) => f.column !== column || (f.columns ?? []).length > 0);
  const kept: LayoutFilter[] = selection === null ? [] : [{ column, op: "eq", value: selection.value, values: [], columns: [] }];
  return { ...layout, filters: [...others, ...kept] };
}
