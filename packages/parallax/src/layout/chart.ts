/* A layout's chart: what it draws, its technical-analysis indicators and the drawings on it, mirroring
 * parallax-protocol's Rust types as the rest of the layout does. */

import { z } from "zod";

import { name } from "./scalars.ts";

// The engine's bounds, as the Rust types state them.
const maxPeriod = 100_000;
/** The longest note a drawing holds, in characters, as in the engine. */
const maxNote = 500;

// TA-Lib's usual periods, which the engine defaults to.
const talib = {
  bands: 20,
  deviations: 2,
  fast: 12,
  oscillator: 14,
  signal: 9,
  slow: 26,
  smoothing: 3,
} as const;

/** A New York time a session opens or closes at, as HH:MM. */
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u, "a session's times are HH:MM");

/**
 * What a chart draws. Bar charts, heatmaps, pies and waterfalls draw the layout's grouped view; the engine reduces
 * the others.
 */
const chartKinds = [
  "line",
  "area",
  "bar",
  "scatter",
  "heatmap",
  "histogram",
  "candlestick",
  "ohlc",
  "pie",
  "waterfall",
] as const;

/** The technical-analysis indicators a chart computes. */
const indicatorKinds = [
  "sma",
  "ema",
  "wma",
  "bollinger",
  "rsi",
  "macd",
  "atr",
  "stochastic",
  "vwap",
  "volume",
] as const;

/** A period of rows, `fallback` when the layout gives none. */
function period(fallback: number): z.ZodDefault<z.ZodInt> {
  return z.int().min(1).max(maxPeriod).default(fallback);
}

const indicatorSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("sma"), period: period(talib.bands) }),
  z.strictObject({ kind: z.literal("ema"), period: period(talib.bands) }),
  z.strictObject({ kind: z.literal("wma"), period: period(talib.bands) }),
  z.strictObject({
    kind: z.literal("bollinger"),
    period: period(talib.bands),
    deviations: z.number().positive().default(talib.deviations),
  }),
  z.strictObject({ kind: z.literal("rsi"), period: period(talib.oscillator) }),
  z
    .strictObject({
      kind: z.literal("macd"),
      fast: period(talib.fast),
      slow: period(talib.slow),
      signal: period(talib.signal),
    })
    .refine((macd) => macd.fast < macd.slow, {
      message: "MACD's fast average must be shorter than its slow one",
      path: ["fast"],
    }),
  z.strictObject({ kind: z.literal("atr"), period: period(talib.oscillator) }),
  z.strictObject({
    kind: z.literal("stochastic"),
    // oxlint-disable-next-line eslint/id-length -- %K is the layout's JSON field, as parallax-protocol's Rust names it.
    k: period(talib.oscillator),
    k_smooth: period(talib.smoothing),
    // oxlint-disable-next-line eslint/id-length -- %D is the layout's JSON field, as parallax-protocol's Rust names it.
    d: period(talib.smoothing),
  }),
  z.strictObject({ kind: z.literal("vwap") }),
  z.strictObject({ kind: z.literal("volume") }),
]);

/** Chart kinds that draw the layout's grouped view, rather than the engine's reduction to the plot's pixels. */
const groupedKinds: ReadonlySet<(typeof chartKinds)[number]> = new Set([
  "bar",
  "heatmap",
  "pie",
  "waterfall",
]);

/** Chart kinds drawn along an x axis over a price: they take drawings and share crosshairs. */
const drawableKinds: readonly (typeof chartKinds)[number][] = [
  "line",
  "area",
  "candlestick",
  "ohlc",
];

/** The kinds of drawing a chart holds. */
const drawingKinds = ["trend", "horizontal", "fibonacci", "rectangle", "note"] as const;

/** A point a drawing is anchored to: a value of the x column, as in a filter, and a value on the price's axis. */
const anchorSchema = z.strictObject({
  x: z.union([z.string(), z.number(), z.boolean()]),
  y: z.number(),
});

const drawingSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("trend"), from: anchorSchema, to: anchorSchema }),
  z.strictObject({ kind: z.literal("horizontal"), y: z.number() }),
  z.strictObject({ kind: z.literal("fibonacci"), from: anchorSchema, to: anchorSchema }),
  z.strictObject({ kind: z.literal("rectangle"), from: anchorSchema, to: anchorSchema }),
  z.strictObject({ kind: z.literal("note"), at: anchorSchema, text: z.string().max(maxNote) }),
]);

/** A pane under a line or area chart's plot: its columns, as lines or bars, and a title. Its default kind and empty
 * title are left out, as in Rust. */
const paneSchema = z.strictObject({
  columns: z.array(name),
  kind: z.enum(["line", "bar"]).optional(),
  title: z.string().optional(),
});

const chartSchema = z.strictObject({
  kind: z.enum(chartKinds),
  x: z.string().default(""),
  y: z.array(name).default([]),
  y_right: z.array(name).default([]),
  series: name.nullable().default(null),
  ohlc: z.strictObject({ open: name, high: name, low: name, close: name }).nullable().default(null),
  axis: z.enum(["value", "trading", "tenor"]).default("value"),
  log_y: z.boolean().default(false),
  stacked: z.boolean().default(false),
  horizontal: z.boolean().default(false),
  range: z.strictObject({ from: z.number(), to: z.number() }).nullable().default(null),
  hidden: z.array(z.string()).default([]),
  indicators: z.array(indicatorSchema).default([]),
  volume: name.nullable().default(null),
  drawings: z.array(drawingSchema).default([]),
  compare: z.boolean().default(false),
  events: name.nullable().default(null),
  // A pie is a ring, with the total in the middle, unless this is off.
  donut: z.boolean().default(true),
  // Values on bars and shares on slices, where they fit, unless this is off.
  labels: z.boolean().default(true),
  // A scatter's dots: the column sizing them, the one naming them, more for the tooltip, and the API's fitted curve.
  // The Rust leaves them out of a layout that does not set them, so they have no default here either.
  size: name.optional(),
  id: name.optional(),
  tooltip: z.array(name).optional(),
  fit: name.optional(),
  // How a tenor axis spaces tenors: the standard ones a step apart, or by length. Left out at its default, as in Rust.
  tenor_spacing: z.enum(["even", "length"]).optional(),
  // A trading-time axis's market, and the session it keeps in New York time, the market's regular one if unset: one
  // that closes before it opens trades overnight, for the day it closes on. Left out when unset, as in Rust.
  calendar: z.enum(["nyse", "sifma"]).optional(),
  session: z.strictObject({ opens: clock, closes: clock }).optional(),
  // Panes under a line or area chart's plot, each with columns of its own. Left out when unset, as in Rust.
  panes: z.array(paneSchema).optional(),
});

/** A chart of a layout. */
type LayoutChart = z.output<typeof chartSchema>;
/** A technical-analysis indicator of a chart. */
type LayoutIndicator = z.output<typeof indicatorSchema>;
/** A drawing on a chart. */
type LayoutDrawing = z.output<typeof drawingSchema>;
/** A point a drawing is anchored to. */
type LayoutAnchor = z.output<typeof anchorSchema>;

export {
  chartKinds,
  chartSchema,
  drawableKinds,
  drawingKinds,
  groupedKinds,
  indicatorKinds,
  maxNote,
};
export type { LayoutAnchor, LayoutChart, LayoutDrawing, LayoutIndicator };
