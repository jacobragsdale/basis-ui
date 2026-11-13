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

/** An indicator's period: how many of the x axis's points it reads, such as 20 for a 20-day average. */
const periodDoc = "the points each value reads";

const indicatorSchema = z.discriminatedUnion("kind", [
  /** A simple moving average over `period` points. */
  z.strictObject({ kind: z.literal("sma"), period: period(talib.bands).describe(periodDoc) }),
  /** An exponential moving average over `period` points. */
  z.strictObject({ kind: z.literal("ema"), period: period(talib.bands).describe(periodDoc) }),
  /** A weighted moving average over `period` points. */
  z.strictObject({ kind: z.literal("wma"), period: period(talib.bands).describe(periodDoc) }),
  /** Bollinger bands: a `period`-point average and the band `deviations` standard deviations either side. */
  z.strictObject({
    kind: z.literal("bollinger"),
    /** The points the average and deviation read. */
    period: period(talib.bands),
    /** How many standard deviations the bands sit from the average. */
    deviations: z.number().positive().default(talib.deviations),
  }),
  /** The relative strength index over `period` points, in a pane of its own. */
  z.strictObject({ kind: z.literal("rsi"), period: period(talib.oscillator).describe(periodDoc) }),
  /** MACD: the difference of a `fast` and a `slow` exponential average, and its `signal` average. */
  z
    .strictObject({
      kind: z.literal("macd"),
      /** The fast average's period, shorter than the slow one's. */
      fast: period(talib.fast),
      /** The slow average's period. */
      slow: period(talib.slow),
      /** The signal line's period, an average of the difference. */
      signal: period(talib.signal),
    })
    .refine((macd) => macd.fast < macd.slow, {
      message: "MACD's fast average must be shorter than its slow one",
      path: ["fast"],
    }),
  /** The average true range over `period` points. */
  z.strictObject({ kind: z.literal("atr"), period: period(talib.oscillator).describe(periodDoc) }),
  /** The stochastic oscillator: %K over `k` points smoothed over `k_smooth`, and %D its average over `d`. */
  z.strictObject({
    kind: z.literal("stochastic"),
    // oxlint-disable-next-line eslint/id-length -- %K is the layout's JSON field, as parallax-protocol's Rust names it.
    k: period(talib.oscillator),
    /** The points %K is smoothed over. */
    k_smooth: period(talib.smoothing),
    // oxlint-disable-next-line eslint/id-length -- %D is the layout's JSON field, as parallax-protocol's Rust names it.
    d: period(talib.smoothing),
  }),
  /** The volume-weighted average price, from each session's open. */
  z.strictObject({ kind: z.literal("vwap") }),
  /** The volume, as bars in a pane of its own. */
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
  /** The x column's value the point sits at. */
  x: z.union([z.string(), z.number(), z.boolean()]),
  /** The price the point sits at. */
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
  /** The columns the pane draws. */
  columns: z.array(name),
  /** Lines, by default, or bars. */
  kind: z.enum(["line", "bar"]).optional(),
  /** The pane's title, above it; none when empty. */
  title: z.string().optional(),
  /** Whether its axis is upside down, as yields often are. */
  reverse: z.boolean().optional(),
});

const chartSchema = z.strictObject({
  /** What it draws: a line, area, bar, candlestick, OHLC, scatter, heatmap, histogram, pie or waterfall chart. */
  kind: z.enum(chartKinds),
  /** The column along the x axis: a date, a time, a tenor, a number or a category. */
  x: z.string().default(""),
  /** The columns drawn against the left axis, a series each. */
  y: z.array(name).default([]),
  /** The columns a line or area chart draws against a right axis of their own; another kind, which has one value
   * axis, says so in place of its plot. */
  y_right: z.array(name).default([]),
  /** A column whose values split each y column into a series per value, such as a curve per date. */
  series: name.nullable().default(null),
  /** A candlestick's or OHLC bar's open, high, low and close columns. */
  ohlc: z.strictObject({ open: name, high: name, low: name, close: name }).nullable().default(null),
  /** How the x axis spaces its points: by value, by trading time with closed hours left out, or by tenor. */
  axis: z.enum(["value", "trading", "tenor"]).default("value"),
  /** Whether the left axis is logarithmic. */
  log_y: z.boolean().default(false),
  /** Whether a bar chart's series stack; another kind says it does not stack, in place of its plot. */
  stacked: z.boolean().default(false),
  /** Whether a bar chart's bars run across. */
  horizontal: z.boolean().default(false),
  /** The x range shown, as the x axis's numbers, which zooming and panning record; everything when null. */
  range: z.strictObject({ from: z.number(), to: z.number() }).nullable().default(null),
  /**
   * The series hidden from the legend. A line or area chart's series by its key: the series column's value on a chart
   * of one column, the column's name for a series not split, and the column and the value, a space between, on a
   * chart of several columns split by series; a legend label, as layouts saved before keys held, still hides its
   * series. Other charts' series, groups and overlays by their legend labels.
   */
  hidden: z.array(z.string()).default([]),
  /** Indicators over the price: moving averages, bands and oscillators. */
  indicators: z.array(indicatorSchema).default([]),
  /** The volume column, which `volume` indicators and VWAP read. */
  volume: name.nullable().default(null),
  /** The user's drawings: trend lines, horizontal lines, Fibonacci retracements, rectangles and notes. */
  drawings: z.array(drawingSchema).default([]),
  /** Whether series are drawn as their change from the first point shown, to compare them. */
  compare: z.boolean().default(false),
  /** A column of events, such as dividends, marked along the x axis where it has a value. */
  events: name.nullable().default(null),
  /** A pie is a ring, with the total in the middle, unless this is off. */
  donut: z.boolean().default(true),
  /** Values on bars and shares on slices, where they fit, unless this is off. */
  labels: z.boolean().default(true),
  // A scatter's dots: the column sizing them, the one naming them, more for the tooltip, and the API's fitted curve.
  // The Rust leaves them out of a layout that does not set them, so they have no default here either.
  /** The column sizing a scatter's dots. */
  size: name.optional(),
  /** The column naming each dot, which a click selects by. */
  id: name.optional(),
  /** More columns the tooltip lists. */
  tooltip: z.array(name).optional(),
  /** The API's fitted curve, drawn as a line through the dots. */
  fit: name.optional(),
  // How a tenor axis spaces tenors: the standard ones a step apart, or by length. Left out at its default, as in Rust.
  tenor_spacing: z.enum(["even", "length"]).optional(),
  // A trading-time axis's market, and the session it keeps in New York time, the market's regular one if unset: one
  // that closes before it opens trades overnight, for the day it closes on. Left out when unset, as in Rust.
  calendar: z.enum(["nyse", "sifma"]).optional(),
  /** The session a trading-time axis keeps, opening and closing as `HH:MM` in New York time. */
  session: z.strictObject({ opens: clock, closes: clock }).optional(),
  // Panes under a line or area chart's plot, each with columns of its own. Left out when unset, as in Rust.
  panes: z.array(paneSchema).optional(),
  // Value axes turned upside down, for yields, and which colour a rise takes. Left out when unset, as in Rust.
  reverse_y: z.boolean().optional(),
  /** Whether the right axis is upside down. */
  reverse_y_right: z.boolean().optional(),
  /** Which colour a rise takes: the gain's, or the loss's, as for a yield. */
  rising: z.enum(["gain", "loss"]).optional(),
  // The drawing tools above a line, area, candlestick or OHLC chart; off, the layout's drawings show but are not
  // edited. Left out when on, as in Rust.
  drawing_tools: z.boolean().optional(),
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
