/* The geometry of indicator panes and polylines: how tall each pane is, the range and ticks of its axis, and a line's
 * runs between its breaks. */

import type { CandleData, IndicatorLineData } from "#frame/chart-data.ts";

import { plain, styledTicks } from "./axis-styles.ts";
import type { AxisStyle } from "./axis-styles.ts";
import type { IndicatorStyle, Rect, Scale, ValueTick } from "./model-types.ts";
import type { ColumnPane } from "./pane-series.ts";
import { linearScale, niceDomain, pixel, valueTicks } from "./scale.ts";

/** A pane of its own for one indicator. */
interface PaneSpec {
  readonly title: string;
  /** A fixed value range, as for oscillators from 0 to 100, or null to fit the values. */
  readonly domain: readonly [number, number] | null;
  /** Lines drawn across the pane at these values, such as RSI's 30 and 70. */
  readonly guides: readonly number[];
  /** Whether the pane holds a candle chart's volume. */
  readonly volume: boolean;
  /** A pane of the layout's own: the columns it draws. */
  readonly columns?: ColumnPane;
}

/** The shortest pane worth drawing. */
const shortest = 16;
/** The tallest and shortest a pane is wanted, and the share of the plot it is wanted at. */
const tallestWanted = 140;
const shortestWanted = 48;
const shareOfPlot = 5;
/** The most of the plot that panes together take, leaving the price the rest. */
const panesShare = 0.6;
/** Pixels between the price and the first pane, and between panes. */
const paneGap = 10;
/** Pixels per tick on a pane's axis. */
const pixelsPerTick = 28;
/** A tick this close to a pane's top would be labelled into the axis above it. */
const topMargin = 8;

/**
 * Pixel heights of panes: about a fifth of the plot each, never leaving the price less than two fifths. Zero when that
 * leaves panes too short to read, and then none are drawn.
 */
function paneHeight(count: number, available: number): number {
  if (count === 0) {
    return 0;
  }
  const wanted = Math.min(
    tallestWanted,
    Math.max(shortestWanted, Math.round(available / shareOfPlot)),
  );
  const most = (available * panesShare) / count - paneGap;
  const height = Math.min(wanted, most);
  return height < shortest ? 0 : height;
}

/** A pane's value range: fixed, or fitted to its values with zero in view. */
function paneDomain(
  spec: PaneSpec,
  values: readonly number[],
  height: number,
): readonly [number, number] {
  if (spec.domain !== null) {
    return spec.domain;
  }
  let [low, high] = [spec.volume ? 0 : Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const value of values) {
    if (Number.isFinite(value)) {
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
  }
  if (!(low <= high)) {
    return [0, 1];
  }
  return niceDomain(low, high, {
    count: Math.max(2, height / pixelsPerTick),
    zero: spec.guides.includes(0) || spec.volume,
  });
}

/** Which of a frame's lines a pane holds, and what it is. */
interface PaneLines {
  readonly lines: readonly IndicatorLineData[];
  readonly styles: readonly IndicatorStyle[];
  readonly candles: CandleData | null;
  readonly spec: PaneSpec;
}

/** The values pane `pane` draws, for fitting its range. */
function paneValues(pane: number, { lines, styles, candles, spec }: PaneLines): number[] {
  if (spec.volume) {
    return candles?.volume === null || candles === null ? [] : [...candles.volume];
  }
  return lines.flatMap((line, i) => (styles[i]?.pane === pane ? [...line.y] : []));
}

/** A pane's scale and ticks for its box, labelled in `style`: a layout pane's first column's format. */
function paneScale(
  domain: readonly [number, number],
  box: Rect,
  {
    style = plain,
    reversed = false,
  }: { readonly style?: AxisStyle; readonly reversed?: boolean } = {},
): { readonly scale: Scale; readonly ticks: readonly ValueTick[] } {
  const [bottom, top] = [box.y + box.height, box.y];
  const scale = linearScale(domain, reversed ? [top, bottom] : [bottom, top]);
  const count = Math.max(2, box.height / pixelsPerTick);
  const all = style.kind === "plain" ? valueTicks(scale, count) : styledTicks(scale, count, style);
  // A tick at the very top would be labelled into the axis above it.
  const ticks = all.filter((tick) => tick.px >= top + topMargin);
  return { scale, ticks };
}

/** The x and y scales a polyline is drawn on. */
interface Axes {
  readonly x: Scale;
  readonly y: Scale;
}

/** A polyline's runs between breaks, as pixel pairs; values a scale cannot place, such as zero on a log axis, break it
 * too. */
function segmentsOf(xs: Float64Array, ys: Float64Array, { x, y }: Axes): Float64Array[] {
  const segments: Float64Array[] = [];
  let current: number[] = [];
  const close = (): void => {
    if (current.length > 0) {
      segments.push(Float64Array.from(current));
    }
    current = [];
  };
  for (let point = 0; point < xs.length; point += 1) {
    const value = ys[point] ?? Number.NaN;
    if (Number.isNaN(value) || (y.log && value <= 0)) {
      close();
    } else {
      current.push(pixel(x, xs[point] ?? 0), pixel(y, value));
    }
  }
  close();
  return segments;
}

export { paneDomain, paneGap, paneHeight, paneScale, paneValues, segmentsOf };
export type { Axes, PaneLines, PaneSpec };
