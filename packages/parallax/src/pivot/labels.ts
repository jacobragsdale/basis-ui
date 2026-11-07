/* Words and choices for the pivot's settings, by the layout's names, as Excel's PivotTable field list says them. The
 * names themselves are the grid's, in `#grid/labels.ts`, so a value reads the same in a header, a chip and a menu. */

import type { FieldKind, SourceField } from "#grid/fields.ts";
import { label } from "#grid/labels.ts";
import type { LayoutMeasure } from "#layout/layout.ts";

type Aggregate = LayoutMeasure["aggregate"];

/** One option of a select: the value the layout holds, and the text the user reads. */
interface Choice {
  readonly value: string;
  readonly text: string;
}

/** The four places of a pivot's field list, as Excel names them. */
type Area = "rows" | "columns" | "values" | "filters";

/** The areas that hold chips in the layout's own order: groups and measures. A filter is kept by its column. */
type ChipArea = "rows" | "columns" | "values";

/** Each area's heading. */
const areaNames: Readonly<Record<Area, string>> = {
  columns: "Columns",
  filters: "Filters",
  rows: "Rows",
  values: "Values",
};

/** The kinds of column that hold numbers. */
const numericKinds: ReadonlySet<FieldKind> = new Set(["integer", "float", "decimal"]);

/** The aggregates that need a column of numbers. */
const numericAggregates: ReadonlySet<Aggregate> = new Set([
  "sum",
  "mean",
  "weighted_mean",
  "variance",
  "std_dev",
  "median",
  "percentile",
]);

/** Whether a column holds numbers. */
function isNumeric(field: SourceField): boolean {
  return numericKinds.has(field.kind);
}

/** Choices for a list of layout names, in their labels. */
function choices(keys: readonly string[]): readonly Choice[] {
  return keys.map((key) => ({ text: label(key), value: key }));
}

/** Choices for columns, by their names. */
function fieldChoices(fields: readonly SourceField[]): readonly Choice[] {
  return fields.map((field) => ({ text: field.name, value: field.name }));
}

export { areaNames, choices, fieldChoices, isNumeric, numericAggregates };
export type { Area, ChipArea, Choice };
