/* Layouts: the JSON document that describes a view.
 *
 * The Rust types in `parallax-protocol` are the source of truth; their JSON Schema is committed as
 * `schema/layout.schema.json`. This schema mirrors them, so that a layout from storage or a URL is checked before use.
 * A test reads the layouts the Rust crate writes, in `tests/fixtures/layouts.json`, and requires each to come back
 * unchanged, so the two cannot drift. */

import { z } from "zod";

import { chartSchema } from "./chart.ts";
import { cellFields } from "./cells.ts";
import { count, filterOps, name, scalar } from "./scalars.ts";
import type { FilterOp } from "./scalars.ts";

/** The layout version this package writes. Older documents are read and brought up to date. */
const layoutVersion = 2;

// The engine's bounds, as the Rust types state them.
const maxDecimals = 30;
const maxWidth = 4_294_967_295;

const formatSchema = z.strictObject({
  /** Digits after the decimal point, at most 30. Unset, the column's type decides: a decimal's scale, none for an
   * integer, one when abbreviating, and two otherwise. */
  decimals: z.int().min(0).max(maxDecimals).nullable().default(null),
  /** Whether thousands are grouped with commas; they are unless it is false. */
  thousands: z.boolean().nullable().default(null),
  /** Multiplies a fraction by 100 and writes `%`: 0.0525 is `5.25%`. */
  percent: z.boolean().default(false),
  /** Divides by a thousand, a million or a billion and writes `K`, `M` or `B`, or as `suffixes` says. */
  abbreviate: z.enum(["thousands", "millions", "billions"]).nullable().default(null),
  // Roadmap step 2.8's styles. The Rust leaves them out of a format that does not set them, so they have no default.
  /** How an abbreviation is written: `amount`'s `K`, `M` and `B`, or `par`'s `M`, `MM` and `BN`, as bond markets do. */
  suffixes: z.enum(["amount", "par"]).optional(),
  /** Writes a rate, a fraction, in basis points: 0.0025 is `25 bp`. */
  bps: z.boolean().optional(),
  /** Writes a price in 32nds, such as `99-16+`, to its finest step: a 32nd, or a half, quarter or eighth of one. */
  thirty_seconds: z.enum(["thirty_seconds", "halves", "quarters", "eighths"]).optional(),
  /** How a negative number is written: with a minus sign, by default, or in parentheses. */
  negative: z.enum(["minus", "parentheses"]).default("minus"),
  /** The IANA zone instants are shown in; New York unless set. */
  zone: z.string().nullable().default(null),
  /** The sub-second digits instants show; whole seconds unless set. */
  precision: z.enum(["seconds", "milliseconds", "microseconds"]).default("seconds"),
});

/** The aggregates a measure can use. */
const aggregates = [
  "count",
  "count_all",
  "sum",
  "mean",
  "weighted_mean",
  "min",
  "max",
  "first",
  "last",
  "distinct_count",
  "variance",
  "std_dev",
  "median",
  "percentile",
] as const;

/** How a measure can be shown. */
const showAs = [
  "value",
  "percent_of_grand_total",
  "percent_of_column_total",
  "percent_of_row_total",
  "percent_of_parent",
  "running_total",
] as const;

/** The filter operators that match text, which only text columns take. */
const textFilterOps: readonly FilterOp[] = ["contains", "not_contains", "starts_with", "ends_with"];

const comparisons = ["gt", "ge", "lt", "le", "eq", "ne"] as const;

const measureSchema = z.strictObject({
  /** The column aggregated; none for `count_all`, which counts the rows. */
  column: name.nullable().default(null),
  /** The aggregate, such as `sum`, `mean`, `weighted_mean` or `percentile`. */
  aggregate: z.enum(aggregates),
  /** The percentile, from 0 to 1, for `percentile`: 0.5 is the median. */
  percentile: z.number().min(0).max(1).nullable().default(null),
  /** The weight column, for `weighted_mean`, such as market value for a yield. */
  weight: name.nullable().default(null),
  /** A column naming each row's unit, such as its currency: a group whose rows mix units says so, not a value. */
  unit_column: name.nullable().default(null),
  /** How the value is shown: itself, by default, a share of a total or of its parent group, or a running total. */
  show_as: z.enum(showAs).default("value"),
  /** The display format, in place of the one taken from the column's. */
  format: formatSchema.nullable().default(null),
});

const filterSchema = z.strictObject({
  /** The column tested. */
  column: name,
  /** The operator, such as `eq`, `in`, `contains` or `is_null`. */
  op: z.enum(filterOps),
  /** The operand of an operator that takes one value. */
  value: scalar.default(null),
  /** The operands of `in` and `not_in`. */
  values: z.array(scalar).default([]),
  /** More columns tested beside `column`: the filter passes when it holds in any, as a search does. */
  columns: z.array(name).default([]),
});

const sortSchema = z.strictObject({
  /** The column sorted by. */
  column: name,
  /** Whether the largest comes first; the smallest does by default. */
  descending: z.boolean().default(false),
});

const groupSortSchema = z.strictObject({
  /** Groups by their key, or by a measure, by its index among the measures. */
  by: z.union([z.literal("key"), z.strictObject({ measure: count })]).default("key"),
  /** Whether the largest come first. */
  descending: z.boolean().default(false),
});

const havingSchema = z.strictObject({ measure: count, op: z.enum(comparisons), value: z.number() });

const topNSchema = z.strictObject({
  // oxlint-disable-next-line eslint/id-length -- `n` is the layout's JSON field, as parallax-protocol's Rust names it.
  n: count,
  /** The measure, by its index among the measures, that ranks the groups. */
  measure: count,
  /** Whether the largest are kept, or the smallest. */
  largest: z.boolean().default(true),
  /** Whether the rest are summed in an Other row. */
  other: z.boolean().default(true),
});

const expandedSchema = z.strictObject({ path: z.array(scalar), expanded: z.boolean() });

/** How a text column's values are ordered: by name, a listed order, or another column's smallest value. */
const listedValues = z.array(z.string());
const orderSchema = z.union([
  z.enum(["text", "tenor", "rating"]),
  z.strictObject({ values: listedValues }),
  z.strictObject({ by: name }),
]);

/** The schema of a layout document. Unknown fields are errors, as in Rust. */
const layoutSchema = z.strictObject({
  /** The layout's version, `layoutVersion` in what this package writes. Older versions are read and brought up to date,
   * as the Rust crate does. */
  version: z
    .int()
    .min(0)
    .max(layoutVersion)
    .optional()
    .transform((): typeof layoutVersion => layoutVersion),
  /** The dataset the view reads. A component's or `useView`'s layout may leave it empty, since its dataset names it;
   * when both are given they must agree. */
  dataset: z.string().default(""),
  /** The dataset's parameters. Vestigial: the engine still reads them, but no table in the browser has parameters, so
   * views name a dataset alone. */
  parameters: z.record(z.string(), z.string()).default({}),
  /** The columns of a flat view, in order; every column when empty. */
  columns: z.array(name).default([]),
  /** The row groups, outermost first: a grid's groups, or a pivot's rows. */
  group_by: z.array(name).default([]),
  /** The column groups of a pivot: each value of these columns heads its own columns of the measures. */
  split_by: z.array(name).default([]),
  /** The measures of a grouped view, each an aggregate of a column, such as the sum of `market_value_usd`. */
  measures: z.array(measureSchema).default([]),
  /** The row filters, such as `{ column: "ticker", op: "eq", value: "UST10Y" }`. */
  filters: z.array(filterSchema).default([]),
  /** The sorts of a flat view, the first deciding first. */
  sort: z.array(sortSchema).default([]),
  /** How groups are ordered among their siblings: by their key, by default, or by a measure. */
  group_sort: groupSortSchema.default({ by: "key", descending: false }),
  /** Filters on the groups' measures, such as the groups whose sum passes a value. */
  having: z.array(havingSchema).default([]),
  /** Keeps the N largest or smallest groups among each set of siblings, by a measure, with an Other row for the rest
   * unless `other` is false. */
  top_n: topNSchema.nullable().default(null),
  /** How many levels of groups open by default; none unless set. */
  expand_depth: count.default(0),
  /** The groups the user opened or closed, each by its values from the outermost level. */
  expanded: z.array(expandedSchema).default([]),
  /** Display formats by source column, in place of the API's; a measure takes its column's unless it sets its own. */
  formats: z.record(name, formatSchema).default({}),
  /** Column widths in CSS pixels, as the user set them: by source column in a flat view, `__measure:0`, `__measure:1`
   * and so on for a grouped view's data columns, and `__tree` for its group column. The engine ignores them. */
  column_widths: z.record(z.string(), z.int().min(0).max(maxWidth)).default({}),
  /** Draws the view as a chart: its kind, columns, axis, indicators, panes and drawings, which `<Chart>` reads. */
  chart: chartSchema.nullable().default(null),
  /** Text a row must hold, ignoring case, in one of the searched columns, as well as pass the filters: a flat view's
   * text columns, or a pivot's group and column-group columns. Empty searches nothing. */
  search: z.string().default(""),
  /** Columns of a flat or detail view kept at the left while the rest scroll, in order; they come first, whatever
   * `columns` says. */
  pinned: z.array(name).default([]),
  /** Header text by source column, or by a measure's header such as `sum(par)`; a column without one shows its name. An
   * export's headers and a chart's legend take them too. */
  titles: z.record(name, z.string()).default({}),
  /** The totals row of a flat or detail view: at most one measure of each column, such as its sum. */
  totals: z.array(measureSchema).default([]),
  /** Groups by `group_by` with the rows under them, in `sort` order and with `columns`, as a grid does, rather than as
   * a pivot of measures. */
  detail: z.boolean().default(false),
  /** How text columns' values are ordered, by column: `"tenor"` by length, `"rating"` best first, `{ values }` as
   * listed, or `{ by }` by another column's smallest value. The Rust leaves them out of a layout that sets none, so
   * there is no default. */
  orders: z.record(name, orderSchema).optional(),
  ...cellFields,
});

/** A complete layout, with every default filled in. */
type Layout = z.output<typeof layoutSchema>;
/** A layout as written by hand: every field may be left out. */
type LayoutInput = z.input<typeof layoutSchema>;
/** One measure of a layout. */
type LayoutMeasure = z.output<typeof measureSchema>;
/** One filter of a layout. */
type LayoutFilter = z.output<typeof filterSchema>;
/** A display format. */
type LayoutFormat = z.output<typeof formatSchema>;
/** A JSON scalar in a filter or group path. */
type LayoutScalar = z.output<typeof scalar>;
/** How a text column's values are ordered. */
type LayoutOrder = z.output<typeof orderSchema>;

/** Reads and checks a layout from any source, filling in defaults. Throws a `ZodError` that says what is wrong. */
function parseLayout(value: unknown): Layout {
  return layoutSchema.parse(value);
}

/** The result of checking a layout: the layout with its defaults, or what is wrong with it. */
type LayoutCheck =
  | { readonly ok: true; readonly layout: Layout }
  | { readonly ok: false; readonly error: string };

/** Checks a layout from any source, filling in defaults, and describes any problem. */
function checkLayout(value: unknown): LayoutCheck {
  const result = layoutSchema.safeParse(value);
  return result.success
    ? { layout: result.data, ok: true }
    : { error: z.prettifyError(result.error), ok: false };
}

/** The prefix of measure keys in `column_widths`, which no column name is expected to start with. */
const measureWidthPrefix = "__measure:";

/** The key a measure's width is stored under in `column_widths`. */
function measureWidthKey(measure: number): string {
  return `${measureWidthPrefix}${String(measure)}`;
}

/** The measure a `column_widths` key belongs to, or null for a column name. */
function measureOfWidthKey(key: string): number | null {
  const rest = key.startsWith(measureWidthPrefix) ? key.slice(measureWidthPrefix.length) : "";
  return /^\d+$/u.test(rest) ? Number(rest) : null;
}

/** The key the group column's width is stored under in `column_widths`. */
const treeWidthKey = "__tree";

export { filterOps } from "./scalars.ts";
export type { FilterOp } from "./scalars.ts";
export {
  aggregates,
  checkLayout,
  layoutSchema,
  layoutVersion,
  measureOfWidthKey,
  measureWidthKey,
  parseLayout,
  showAs,
  textFilterOps,
  treeWidthKey,
};
export type {
  Layout,
  LayoutCheck,
  LayoutFilter,
  LayoutFormat,
  LayoutInput,
  LayoutMeasure,
  LayoutOrder,
  LayoutScalar,
};
