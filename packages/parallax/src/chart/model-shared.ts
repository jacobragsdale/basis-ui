/* What the draw model's builders share: the plot's padding and gutters, value scales and axes, series colours, the
 * legend, and the model of a chart with nothing to draw.
 *
 * Marks follow fixed specs: 2 px lines with an area wash at 10 % opacity, bars and columns at most 24 px thick with
 * 4 px rounded data ends and square baselines, a 2 px surface gap between touching bars and cells, and hairline
 * gridlines. Series take the categorical colours in a fixed order by their place in the data, never cycled, so hiding
 * one never repaints the others; series past the eighth are drawn in the muted colour. */

import type {
  ChartModel,
  IndicatorStyle,
  LegendEntry,
  ModelInput,
  Rect,
  Scale,
  ValueAxis,
  ValueTick,
} from "./model-types.ts";
import { linearScale, logDomain, logScale, niceDomain, valueTicks } from "./scale.ts";

/** The padding around the plot, and a compact chart's. */
const pad = 8;
const compactPad = 4;
/** The x axis's height under the plot. */
const xAxisHeight = 22;
/** The thickest a bar of a grouped view is drawn, so that a big chart's bars are solid but a few bars don't fill it. */
const maxBar = 56;
/** The widest a candle or an x-axis column is drawn. */
const maxColumn = 24;
/** A column's share of the space it has. */
const columnShare = 0.7;
/** The longest a turned category label is drawn, in pixels. */
const maxLabel = 120;
/** The surface gap between touching bars and cells. */
const gap = 2;
/** About one tick on a value axis every this many pixels. */
const pixelsPerTick = 56;
const ticksPerPixel = 1 / pixelsPerTick;
/** A label's height where labels stack down the side. */
const lineHeight = 16;

const count = new Intl.NumberFormat("en-US");

/** The padding around the plot. */
function padOf(input: ModelInput): number {
  return input.compact === true ? compactPad : pad;
}

/** Whether a group is drawn faint, because another is selected. */
function dimmed(input: ModelInput, label: string): boolean {
  const selected = input.selected ?? null;
  return selected !== null && selected !== label;
}

function seriesColor(input: ModelInput, index: number): string {
  return input.colors.series[index] ?? input.muted;
}

function hidden(input: ModelInput, label: string): boolean {
  return input.chart.hidden.includes(label);
}

/** Whether an indicator line is shown: neither it nor the series it follows is hidden. */
function shown(input: ModelInput, style: IndicatorStyle): boolean {
  return !hidden(input, style.group) && !hidden(input, style.follows);
}

/** A legend entry per series, in the series' colours. */
function seriesEntries(
  input: ModelInput,
  labels: readonly string[],
  shape: LegendEntry["shape"],
): LegendEntry[] {
  return labels.map((label, i) => ({
    color: seriesColor(input, i),
    hidden: hidden(input, label),
    label,
    shape,
  }));
}

/** A legend, when there is more than one series to tell apart. */
function legendOf(
  input: ModelInput,
  labels: readonly string[],
  shape: LegendEntry["shape"],
): readonly LegendEntry[] {
  return labels.length < 2 ? [] : seriesEntries(input, labels, shape);
}

function extent(values: Iterable<number>, positive: boolean): readonly [number, number] | null {
  let [low, high] = [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const value of values) {
    if (Number.isFinite(value) && (!positive || value > 0)) {
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
  }
  return low <= high ? [low, high] : null;
}

/** The pixels a value scale spans, and whether it reaches zero. */
interface ScaleSpan {
  readonly range: readonly [number, number];
  readonly zero: boolean;
}

/** A value scale over `values` for the plot's height, logarithmic if asked and possible. */
function valueScale(
  input: ModelInput,
  values: readonly number[],
  { range, zero }: ScaleSpan,
): Scale {
  const ticks = Math.max(2, Math.abs(range[0] - range[1]) * ticksPerPixel);
  // Percentage changes run through zero and below it: a comparison is never on a log scale.
  if (input.chart.log_y && !input.chart.compare) {
    const positive = extent(values, true);
    if (positive !== null) {
      return logScale(logDomain(positive[0], positive[1]), range);
    }
  }
  const all = extent(values, false) ?? [0, 1];
  return linearScale(niceDomain(all[0], all[1], { count: ticks, zero }), range);
}

function axis(side: "left" | "right", scale: Scale, suffix = ""): ValueAxis {
  const ticks = valueTicks(
    scale,
    Math.max(2, Math.abs(scale.range[0] - scale.range[1]) * ticksPerPixel),
  );
  return {
    scale,
    side,
    ticks:
      suffix === ""
        ? ticks
        : ticks.map((tick) => ({
            label: `${tick.label}${suffix}`,
            px: tick.px,
            value: tick.value,
          })),
  };
}

function gutter(input: ModelInput, ticks: readonly ValueTick[]): number {
  return (
    Math.ceil(Math.max(0, ...ticks.map((tick) => input.measure(tick.label)))) + padOf(input) + 2
  );
}

/** The ticks a plot's gutters must hold, and the x axis's height under it. */
interface Gutters {
  readonly left: readonly ValueTick[];
  readonly right: readonly ValueTick[] | null;
  readonly xAxis?: number;
}

/** The plot area once the value axes' labels have room, over an x axis `xAxis` pixels tall. */
function plotFor(input: ModelInput, { left, right, xAxis = xAxisHeight }: Gutters): Rect {
  const padding = padOf(input);
  const x = Math.max(gutter(input, left), input.minGutter ?? 0);
  const width = input.width - x - (right === null ? padding : gutter(input, right));
  return {
    height: Math.max(1, input.height - padding - xAxis),
    width: Math.max(1, width),
    x,
    y: padding,
  };
}

/** Re-ranges a scale onto a new pixel range, keeping its domain. */
function onto(scale: Scale, range: readonly [number, number]): Scale {
  return scale.log ? logScale(scale.domain, range) : linearScale(scale.domain, range);
}

/** The model of a chart with nothing to draw, which says `message` instead. */
function emptyModel(input: ModelInput, message: string): ChartModel {
  const padding = padOf(input);
  const plot = {
    height: Math.max(1, input.height - padding - xAxisHeight),
    width: Math.max(1, input.width - 2 * padding),
    x: padding,
    y: padding,
  };
  return {
    empty: message,
    events: [],
    height: input.height,
    indicators: [],
    legend: [],
    marks: [],
    panes: [],
    plot,
    width: input.width,
    x: null,
    xTicks: [],
    yAxes: [],
    yLabels: [],
  };
}

/** The ramp step for a share of the most, `0 < share <= 1`. */
function rampColor(ramp: readonly string[], share: number): string {
  const step = Math.min(ramp.length - 1, Math.max(0, Math.ceil(share * ramp.length) - 1));
  return ramp[step] ?? ramp.at(-1) ?? "#000000";
}

/** A column's width in `space` pixels: most of it, at least a pixel and at most `maxColumn`. */
function columnWidth(space: number): number {
  return Math.max(1, Math.min(maxColumn, space * columnShare));
}

export {
  axis,
  columnWidth,
  count,
  dimmed,
  emptyModel,
  extent,
  gap,
  gutter,
  hidden,
  legendOf,
  lineHeight,
  maxBar,
  maxLabel,
  onto,
  padOf,
  pad,
  plotFor,
  rampColor,
  seriesColor,
  seriesEntries,
  shown,
  valueScale,
  xAxisHeight,
};
export type { Gutters, ScaleSpan };
