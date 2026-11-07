/* Layout pieces the demo's pages share. */

import type { ChartSelection, LayoutFilter, LayoutInput } from "@basis/parallax";

/** The groups sorted by the first measure, largest first. */
const largestFirst = { by: { measure: 0 }, descending: true } as const;

/** A measure and its share of the whole, which a pie's legend, slices and tooltip read; a count when `column` is null. */
function withShare(column: string | null): LayoutInput["measures"] {
  const aggregate = column === null ? "count_all" : "sum";
  return [
    { aggregate, column },
    { aggregate, column, show_as: "percent_of_grand_total" },
  ];
}

/** A filter keeping the rows whose `column` is the value picked. */
function pickedFilter(selection: ChartSelection): LayoutFilter {
  return { column: selection.column, columns: [], op: "eq", value: selection.value, values: [] };
}

/**
 * The layout with `column`'s own filters replaced by one keeping `selection`, or by none when the selection is
 * cleared; a search and the filters on other columns stay as the user set them.
 */
function withSelection(
  layout: LayoutInput,
  column: string,
  selection: ChartSelection | null,
): LayoutInput {
  const others = (layout.filters ?? []).filter(
    (filter) => filter.column !== column || (filter.columns ?? []).length > 0,
  );
  const kept = selection === null ? [] : [pickedFilter(selection)];
  return { ...layout, filters: [...others, ...kept] };
}

/** Whether a layout groups, pivots or aggregates, so that it opens as a pivot rather than a grid. */
function grouped(layout: LayoutInput): boolean {
  return (
    (layout.group_by?.length ?? 0) > 0 ||
    (layout.split_by?.length ?? 0) > 0 ||
    (layout.measures?.length ?? 0) > 0
  );
}

export { grouped, largestFirst, pickedFilter, withSelection, withShare };
