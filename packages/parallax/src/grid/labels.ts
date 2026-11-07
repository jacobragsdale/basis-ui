/* Words for a layout's names, as the grid's menus and chips say them, and the values a filter reads from what the
 * user types. The pivot's settings say the same names the same way. */

import type { FilterOp, LayoutMeasure, LayoutScalar } from "#layout/layout.ts";

import type { FieldKind } from "./fields.ts";

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

/** How many values a filter operator takes: a list, one, or none. */
function operandOf(op: FilterOp): "one" | "many" | "none" {
  if (op === "in" || op === "not_in") {
    return "many";
  }
  return op === "is_null" || op === "is_not_null" ? "none" : "one";
}

/** A typed number as a double's filter value, kept as text when it is not a number. */
function floatValue(trimmed: string): LayoutScalar {
  const number = Number(trimmed);
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
 * A filter value from text the user typed, for a column of `kind`: numbers for doubles, booleans for booleans, and
 * text for everything else, which keeps decimals and large integers exact. Empty text is null.
 */
function filterValue(kind: FieldKind, text: string): LayoutScalar {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  if (kind === "float") {
    return floatValue(trimmed);
  }
  if (kind === "boolean") {
    return booleanValue(trimmed);
  }
  return kind === "text" ? text : trimmed;
}

export { aggregateLabel, filterValue, label, operandOf };
