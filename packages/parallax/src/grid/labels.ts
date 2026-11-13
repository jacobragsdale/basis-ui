/* Words for a layout's names, as the grid's menus and chips say them, and the values a filter reads from what the
 * user types. The pivot's settings say the same names the same way. */

import type { FilterOp, LayoutFormat, LayoutMeasure, LayoutScalar } from "#layout/layout.ts";

import type { FieldKind } from "./fields.ts";
import { typedNumber } from "./typed-number.ts";

const labels: Readonly<Record<string, string>> = {
  count: "Count",
  count_all: "Count rows",
  sum: "Sum",
  mean: "Mean",
  weighted_mean: "Weighted mean",
  min: "Min",
  max: "Max",
  first: "First",
  last: "Last",
  distinct_count: "Distinct count",
  variance: "Variance",
  std_dev: "Std dev",
  median: "Median",
  percentile: "Percentile",
  value: "Value",
  percent_of_grand_total: "% of total",
  percent_of_column_total: "% of column",
  percent_of_row_total: "% of row",
  percent_of_parent: "% of parent",
  running_total: "Running total",
  eq: "=",
  ne: "≠",
  lt: "<",
  le: "≤",
  gt: ">",
  ge: "≥",
  in: "is one of",
  not_in: "is none of",
  is_null: "is blank",
  is_not_null: "is not blank",
  contains: "contains",
  not_contains: "does not contain",
  starts_with: "starts with",
  ends_with: "ends with",
};

/** The label for a layout name, such as `≥` for `ge` or `Sum` for `sum`. */
function label(key: string): string {
  return labels[key] ?? key;
}

/** The label of an aggregate. */
function aggregateLabel(aggregate: LayoutMeasure["aggregate"]): string {
  return label(aggregate);
}

/** A measure's short name, such as `Sum of pnl`, as a pivot's chips and menus say it. */
function measureName(measure: LayoutMeasure): string {
  return measure.aggregate === "count_all"
    ? label("count_all")
    : `${label(measure.aggregate)} of ${measure.column ?? "?"}`;
}

/** How many values a filter operator takes: a list, one, or none. */
function operandOf(op: FilterOp): "one" | "many" | "none" {
  if (op === "in" || op === "not_in") {
    return "many";
  }
  return op === "is_null" || op === "is_not_null" ? "none" : "one";
}

/** A typed number as a double's filter value, read as the column shows numbers, kept as text when it is not a number,
 * for the engine to refuse with its reason. */
function floatValue(trimmed: string, format: LayoutFormat | undefined): LayoutScalar {
  const read = typedNumber(trimmed, format);
  const number = read === null ? Number.NaN : Number(read);
  return Number.isFinite(number) ? number : trimmed;
}

/** A typed boolean, kept as text when it is neither true nor false. */
function booleanValue(trimmed: string): LayoutScalar {
  const lower = trimmed.toLowerCase();
  if (lower === "true") {
    return true;
  }
  return lower === "false" ? false : trimmed;
}

/**
 * A filter value from text the user typed, for a column of `kind` shown with `format`: numbers as the column shows
 * them, so 5 in a column shown as a percentage is 0.05 and `1,000` is a thousand, as doubles for doubles and as exact
 * text for decimals and integers; booleans for booleans; and text for everything else. What is not a number stays
 * text, for the engine to refuse with its reason. Empty text is null.
 */
function filterValue(kind: FieldKind, text: string, format?: LayoutFormat): LayoutScalar {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  if (kind === "float") {
    return floatValue(trimmed, format);
  }
  if (kind === "decimal" || kind === "integer") {
    return typedNumber(trimmed, format) ?? trimmed;
  }
  if (kind === "boolean") {
    return booleanValue(trimmed);
  }
  return kind === "text" ? text : trimmed;
}

export { aggregateLabel, filterValue, label, measureName, operandOf };
