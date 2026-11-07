/* Snapping the pointer to the data: a drawing's anchor goes to the x of the nearest point or candle, exactly as the
 * frame carries it, and to the pointer's price, rounded to what a pixel tells apart; and a measurement measures the
 * shown series whose line is nearest the press. */

import type { CandleData, ChartFrameData, SeriesData } from "#frame/chart-data.ts";
import type { LayoutAnchor } from "#layout/chart.ts";

import { priceScale } from "./drawings.ts";
import type { Snap } from "./drawings.ts";
import { nearestIndex } from "./interaction.ts";
import type { ChartModel, Point } from "./model-types.ts";
import { pixel } from "./scale.ts";

/** The most decimals an anchor's price keeps. */
const maxDecimals = 12;

/** Where the pointer is, and the series hidden from the plot, by their legend labels, which are never snapped to. */
interface SnapAt {
  readonly point: Point;
  readonly hidden?: readonly string[];
}

/** `value` rounded to what one pixel of the scale can show: no more digits than a pixel tells apart. */
function rounded(value: number, perPixel: number): number {
  if (!(perPixel > 0) || !Number.isFinite(value)) {
    return value;
  }
  const digits = -Math.floor(Math.log10(perPixel));
  const decimals = Math.max(0, Math.min(maxDecimals, digits));
  return Number(value.toFixed(decimals));
}

/** A JSON scalar of an x value, or null for anything else. */
function scalarOf(json: string): LayoutAnchor["x"] | null {
  const value: unknown = JSON.parse(json);
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value
    : null;
}

/** A point or candle a drawing may be anchored to: its axis position and exact x value. */
interface Candidate {
  readonly position: number;
  readonly json: string;
}

/** A candle chart's buckets, by their starts, that an anchor may snap to. */
function bucketCandidates(candles: CandleData): Candidate[] {
  const candidates: Candidate[] = [];
  for (const [i, position] of candles.from.entries()) {
    const json = candles.xJson[i];
    if (json !== null && json !== undefined) {
      candidates.push({ json, position });
    }
  }
  return candidates;
}

/** The drawn points of the series not hidden that an anchor may snap to. */
function pointCandidates(series: readonly SeriesData[], hidden: readonly string[]): Candidate[] {
  const candidates: Candidate[] = [];
  for (const line of series.filter((shown) => !hidden.includes(shown.label))) {
    for (const [i, position] of line.x.entries()) {
      const json = line.xJson[i];
      if (json !== null && json !== undefined && line.yText[i] !== null) {
        candidates.push({ json, position });
      }
    }
  }
  return candidates;
}

/** The frame's points and candles, among series not hidden, that an anchor may snap to. */
function candidatesOf(frame: ChartFrameData, hidden: readonly string[]): Candidate[] {
  const { content } = frame;
  if (content.kind === "candles") {
    return bucketCandidates(content.candles);
  }
  return content.kind === "series" ? pointCandidates(content.series, hidden) : [];
}

/** The frame's point or candle nearest axis position `at`, among series not hidden: its position and exact x value. */
function nearestData(
  frame: ChartFrameData,
  at: number,
  hidden: readonly string[],
): Candidate | null {
  let best: Candidate | null = null;
  for (const candidate of candidatesOf(frame, hidden)) {
    if (best === null || Math.abs(candidate.position - at) < Math.abs(best.position - at)) {
      best = candidate;
    }
  }
  return best;
}

/**
 * An anchor at the pointer: at the x of the frame's nearest point or candle, exactly as the frame carries it, and at
 * the pointer's price, rounded to what a pixel tells apart. Null where there is no data to anchor to.
 */
function snap(
  frame: ChartFrameData,
  model: ChartModel,
  { point, hidden = [] }: SnapAt,
): Snap | null {
  const [x, y] = [model.x, priceScale(model)];
  if (x === null || y === null) {
    return null;
  }
  const nearest = nearestData(frame, x.invert(point.x), hidden);
  const value = nearest === null ? null : scalarOf(nearest.json);
  if (nearest === null || value === null) {
    return null;
  }
  const price = rounded(y.invert(point.y), Math.abs(y.invert(point.y) - y.invert(point.y + 1)));
  return {
    anchor: { x: value, y: price },
    point: { x: pixel(x, nearest.position), y: pixel(y, price) },
  };
}

/** A series a measurement measures: its legend label, and its series value as text. */
interface SeriesChoice {
  readonly label: string;
  readonly key: string;
}

/** How far, in pixels, a series' line at axis position `at` is from `point`'s height, or null where it has no value. */
function lineDistance(
  model: ChartModel,
  series: SeriesData,
  { at, point }: { readonly at: number; readonly point: Point },
): number | null {
  const y = model.yAxes.find((axis) => axis.side === (series.right ? "right" : "left"))?.scale;
  const value = series.y[nearestIndex(series.x, at)];
  return y === undefined || value === undefined || Number.isNaN(value)
    ? null
    : Math.abs(pixel(y, value) - point.y);
}

/** Of `series`, the one whose line at axis position `at` is nearest `point`'s height, or null if none has a value. */
function nearestSeries(
  model: ChartModel,
  series: readonly SeriesData[],
  near: { readonly at: number; readonly point: Point },
): SeriesChoice | null {
  let best: (SeriesChoice & { readonly distance: number }) | null = null;
  for (const line of series) {
    const distance = lineDistance(model, line, near);
    if (distance !== null && (best === null || distance < best.distance)) {
      best = { distance, key: line.label.slice(line.column.length + 1), label: line.label };
    }
  }
  return best === null ? null : { key: best.key, label: best.label };
}

/**
 * The shown series nearest `point` on a line chart, by its line's value at the pointer's x: its legend label and its
 * series value as text. Null on charts of one series or candles, where there is only one to choose.
 */
function seriesAt(
  frame: ChartFrameData,
  model: ChartModel,
  { point, hidden = [] }: SnapAt,
): SeriesChoice | null {
  const { content } = frame;
  const { x } = model;
  if (content.kind !== "series" || x === null || content.series.length < 2) {
    return null;
  }
  const shown = content.series.filter((line) => !hidden.includes(line.label));
  return nearestSeries(model, shown, { at: x.invert(point.x), point });
}

export { seriesAt, snap };
export type { SeriesChoice, SnapAt };
