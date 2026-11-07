/* Layouts: the JSON document that describes a view.
 *
 * The Rust types in `parallax-protocol` are the source of truth; their JSON Schema is committed as
 * `schema/layout.schema.json`. This schema mirrors them, so that a layout from storage or a URL is checked before use.
 * A test reads the layouts the Rust crate writes, in `tests/fixtures/layouts.json`, and requires each to come back
 * unchanged, so the two cannot drift. */

import { z } from "zod";

import { chartSchema } from "./chart.ts";
import { count, name, scalar } from "./scalars.ts";

/** The layout version this package writes. Older documents are read and brought up to date. */
const layoutVersion = 2;

// The engine's bounds, as the Rust types state them.
const maxDecimals = 30;
const maxWidth = 4_294_967_295;

const formatSchema = z.strictObject({
  decimals: z.int().min(0).max(maxDecimals).nullable().default(null),
  thousands: z.boolean().nullable().default(null),
  percent: z.boolean().default(false),
  abbreviate: z.enum(["thousands", "millions", "billions"]).nullable().default(null),
  // Roadmap step 2.8's styles. The Rust leaves them out of a format that does not set them, so they have no default.
  suffixes: z.enum(["amount", "par"]).optional(),
  bps: z.boolean().optional(),
  thirty_seconds: z.enum(["thirty_seconds", "halves", "quarters", "eighths"]).optional(),
  negative: z.enum(["minus", "parentheses"]).default("minus"),
  zone: z.string().nullable().default(null),
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
] as const;

/** The filter operators. */
const filterOps = [
  "eq",
  "ne",
  "lt",
  "le",
  "gt",
  "ge",
  "in",
  "not_in",
  "is_null",
  "is_not_null",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
] as const;

/** A filter operator. */
type FilterOp = (typeof filterOps)[number];

/** The filter operators that match text, which only text columns take. */
const textFilterOps: readonly FilterOp[] = ["contains", "not_contains", "starts_with", "ends_with"];

const comparisons = ["gt", "ge", "lt", "le", "eq", "ne"] as const;

const measureSchema = z.strictObject({
  column: name.nullable().default(null),
  aggregate: z.enum(aggregates),
  percentile: z.number().min(0).max(1).nullable().default(null),
  weight: name.nullable().default(null),
  unit_column: name.nullable().default(null),
  show_as: z.enum(showAs).default("value"),
  format: formatSchema.nullable().default(null),
});

const filterSchema = z.strictObject({
  column: name,
  op: z.enum(filterOps),
  value: scalar.default(null),
  values: z.array(scalar).default([]),
  // More columns tested: the filter passes when it holds in any, as a search does.
  columns: z.array(name).default([]),
});

const sortSchema = z.strictObject({ column: name, descending: z.boolean().default(false) });

const groupSortSchema = z.strictObject({
  by: z.union([z.literal("key"), z.strictObject({ measure: count })]).default("key"),
  descending: z.boolean().default(false),
});

const havingSchema = z.strictObject({ measure: count, op: z.enum(comparisons), value: z.number() });

const topNSchema = z.strictObject({
  // oxlint-disable-next-line eslint/id-length -- `n` is the layout's JSON field, as parallax-protocol's Rust names it.
  n: count,
  measure: count,
  largest: z.boolean().default(true),
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
  // Older versions are read and brought up to date, as the Rust crate does.
  version: z
    .int()
    .min(0)
    .max(layoutVersion)
    .optional()
    .transform((): typeof layoutVersion => layoutVersion),
  dataset: z.string().default(""),
  // Vestigial: the engine still reads them, but no table in the browser has parameters, so views name a dataset alone.
  parameters: z.record(z.string(), z.string()).default({}),
  columns: z.array(name).default([]),
  group_by: z.array(name).default([]),
  split_by: z.array(name).default([]),
  measures: z.array(measureSchema).default([]),
  filters: z.array(filterSchema).default([]),
  sort: z.array(sortSchema).default([]),
  group_sort: groupSortSchema.default({ by: "key", descending: false }),
  having: z.array(havingSchema).default([]),
  top_n: topNSchema.nullable().default(null),
  expand_depth: count.default(0),
  expanded: z.array(expandedSchema).default([]),
  formats: z.record(name, formatSchema).default({}),
  column_widths: z.record(z.string(), z.int().min(0).max(maxWidth)).default({}),
  chart: chartSchema.nullable().default(null),
  search: z.string().default(""),
  pinned: z.array(name).default([]),
  titles: z.record(name, z.string()).default({}),
  totals: z.array(measureSchema).default([]),
  detail: z.boolean().default(false),
  // Orders of text columns, by column. The Rust leaves them out of a layout that sets none, so there is no default.
  orders: z.record(name, orderSchema).optional(),
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

export {
  aggregates,
  checkLayout,
  filterOps,
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
  FilterOp,
  Layout,
  LayoutCheck,
  LayoutFilter,
  LayoutFormat,
  LayoutInput,
  LayoutMeasure,
  LayoutOrder,
  LayoutScalar,
};
