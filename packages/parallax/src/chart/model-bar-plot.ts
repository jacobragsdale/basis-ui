/* How a bar chart's bars are sized and placed: the slots in a category's band, a bar's rectangle, the room past the
 * longest bar for its label, and the plot and value scale that leave that room. */

import { styleOf } from "./axis-styles.ts";
import type { CategoryData, CategorySeries, ModelInput, Rect, Scale } from "./model-types.ts";
import {
  axis,
  gap,
  lineHeightOf,
  maxBar,
  onto,
  padOf,
  plotFor,
  valueScale,
} from "./model-shared.ts";
import { pixel } from "./scale.ts";

/** A bar's thickness as a share of its band, alone or stacked, and a group's share when bars sit side by side. */
const aloneShare = 0.6;
const groupShare = 0.8;
/** Pixels between a bar's end and its label, beside a bar that runs across. */
const besideMargin = 6;
/** The most of the plot a label beside a bar may take. */
const labelShare = 4;

/** A missing value adds nothing to a stack. */
function finite(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? value : 0;
}

/** A series shown, and its place among all the series, which picks its colour. */
interface Visible {
  readonly series: CategorySeries;
  readonly i: number;
}

/** Where each bar of a category sits along its band, and how thick it is. */
function barSlots(
  band: number,
  visible: number,
  stacked: boolean,
): { readonly thickness: number; readonly offset: (place: number) => number } {
  if (stacked || visible <= 1) {
    const thickness = Math.max(1, Math.min(maxBar, band * aloneShare));
    return { offset: () => (band - thickness) / 2, thickness };
  }
  const thickness = Math.max(
    1,
    Math.min(maxBar, (band * groupShare - gap * (visible - 1)) / visible),
  );
  const group = visible * thickness + (visible - 1) * gap;
  return { offset: (place) => (band - group) / 2 + place * (thickness + gap), thickness };
}

/** How bars of one chart are laid out. */
interface BarGeometry {
  readonly value: Scale;
  readonly horizontal: boolean;
  readonly stacked: boolean;
  readonly thickness: number;
}

/** Where a bar runs: from `start` to `start + amount` along the value axis, at `across` on the category axis. */
interface BarSpan {
  readonly start: number;
  readonly amount: number;
  readonly across: number;
}

/** A bar from `start` to `start + amount` along the value axis, at `across` on the category axis. */
function barRect(
  geometry: BarGeometry,
  { start, amount, across }: BarSpan,
): {
  readonly kind: "rect";
  readonly rect: Rect;
  readonly round: "top" | "bottom" | "left" | "right";
} {
  const [from, to] = [pixel(geometry.value, start), pixel(geometry.value, start + amount)];
  // Segments of a stack keep a surface gap between them, cut from their baseline end.
  const inset = geometry.stacked && start !== 0 ? gap : 0;
  const size = Math.max(0, Math.abs(to - from) - inset);
  const low = Math.min(from, to);
  if (geometry.horizontal) {
    const rect = {
      height: geometry.thickness,
      width: size,
      x: amount > 0 ? low + inset : low,
      y: across,
    };
    return { kind: "rect", rect, round: amount > 0 ? "right" : "left" };
  }
  const rect = {
    height: size,
    width: geometry.thickness,
    x: across,
    y: amount > 0 ? low : low + inset,
  };
  return { kind: "rect", rect, round: amount > 0 ? "top" : "bottom" };
}

/**
 * The room at the end of the longest bar for its label, in pixels along the value axis: a line's height up a column,
 * or the widest label's width beside a bar, at most a quarter of the plot. None when bars are unlabelled.
 */
function labelRoom(
  input: ModelInput,
  texts: readonly string[],
  { horizontal, length }: { readonly horizontal: boolean; readonly length: number },
): number {
  if (!input.chart.labels || input.chart.stacked || texts.length === 0) {
    return 0;
  }
  return horizontal
    ? Math.min(
        length / labelShare,
        Math.max(0, ...texts.map((text) => input.measure(text))) + besideMargin,
      )
    : lineHeightOf(input) + 2;
}

/** A bar's label, its value within `room` pixels, unless bars are unlabelled, stacked or have no text. */
function barLabel(
  input: ModelInput,
  text: string,
  room: number,
): { readonly label?: { readonly text: string; readonly room: number } } {
  return input.chart.labels && !input.chart.stacked && text !== "" ? { label: { room, text } } : {};
}

/** Values stretched so that a scale over them leaves `room` of `length` pixels past the longest bar, for its label. */
function withRoom(values: readonly number[], room: number, length: number): readonly number[] {
  const stretch = length / Math.max(1, length - room);
  return room === 0 ? values : values.map((value) => value * stretch);
}

/** The values a bar chart's scale covers: each bar's, or each stack's positive and negative sums. */
function barExtent(
  data: CategoryData,
  visible: readonly Visible[],
  stacked: boolean,
): readonly number[] {
  const sum = (category: number, part: (value: number) => number): number => {
    let total = 0;
    for (const { series } of visible) {
      total += part(finite(series.values[category]));
    }
    return total;
  };
  return stacked
    ? data.categories.flatMap((_category, category) => [
        sum(category, (value) => Math.max(0, value)),
        sum(category, (value) => Math.min(0, value)),
      ])
    : visible.flatMap(({ series }) => series.values);
}

/** What a bar chart's plot is fitted to: the stacks' or bars' totals, the bars' texts, and the room around it. */
interface BarFit {
  readonly totals: readonly number[];
  readonly texts: readonly string[];
  readonly labelWidth: number;
  readonly xAxis: number;
}

/**
 * A bar chart's plot over an x axis `xAxis` pixels tall, beside category labels `labelWidth` wide when bars run across,
 * and its value scale over `totals`, with room past the longest bar for the label of `texts`' widest.
 */
function barPlot(
  input: ModelInput,
  { totals, texts, labelWidth, xAxis }: BarFit,
): { readonly plot: Rect; readonly value: Scale } {
  const { horizontal } = input.chart;
  const padding = padOf(input);
  const length = horizontal ? input.width - labelWidth - padding : input.height - xAxis - padding;
  const linear = { ...input, chart: { ...input.chart, log_y: false } };
  const room = labelRoom(input, texts, { horizontal, length });
  const scale = valueScale(linear, withRoom(totals, room, length), {
    range: [0, length],
    zero: true,
  });
  const plot = horizontal
    ? {
        height: Math.max(1, input.height - padding - xAxis),
        width: Math.max(1, input.width - labelWidth - padding),
        x: labelWidth,
        y: padding,
      }
    : plotFor(input, {
        left: axis("left", onto(scale, [input.height - xAxis, padding]), {
          style: styleOf(input.measureFormat),
        }).ticks,
        right: null,
        xAxis,
      });
  return {
    plot,
    value: horizontal
      ? onto(scale, [plot.x, plot.x + plot.width])
      : onto(scale, [plot.y + plot.height, plot.y]),
  };
}

export { barExtent, barLabel, barPlot, barRect, barSlots };
export type { BarFit, BarGeometry, BarSpan, Visible };
