/* What the crosshair reads, worked out without the DOM so that tests can check it: the series' points at an axis
 * position, and the indicators and events read beside them. The mark under the pointer is in `marks-at.ts`. */

import type { ChartFrameData, IndicatorLineData, SeriesData } from "#frame/chart-data.ts";

import type { Range } from "./range.ts";
import type { ChartModel, IndicatorStyle, Scale } from "./model-types.ts";
import { pixel } from "./scale.ts";

/** A row of a tooltip: the value leads, the label follows, the series' colour keys it. */
interface TipRow {
  readonly value: string;
  readonly label: string;
  readonly color: string | null;
}

/** What the crosshair or the pointer reads. */
interface Reading {
  readonly title: string;
  readonly rows: readonly TipRow[];
  /** The x the crosshair snapped to, in pixels, or null for a mark without one. */
  readonly crosshair: number | null;
}

/** Where the crosshair reads: the axis position, and the series hidden from the plot, by their legend labels. */
interface ReadAt {
  readonly hidden: readonly string[];
  readonly x: number;
}

/** How far from the crosshair, in pixels, another series' point may be and still be read. */
const near = 6;
/** Under this many pixels from the crosshair, an indicator's point is the crosshair's own. */
const samePixel = 0.5;

/** The first index in `[0, high)` of sorted `xs` whose value `before` refuses, by bisection. */
function bisect(xs: Float64Array, high: number, before: (value: number) => boolean): number {
  let [low, top] = [0, high];
  while (low < top) {
    const middle = Math.floor((low + top) / 2);
    if (before(xs[middle] ?? 0)) {
      low = middle + 1;
    } else {
      top = middle;
    }
  }
  return low;
}

/** The index of the value in sorted `xs` nearest to `x`, or -1 if there is none. */
function nearestIndex(xs: Float64Array, x: number): number {
  if (xs.length === 0) {
    return -1;
  }
  const low = bisect(xs, xs.length - 1, (value) => value < x);
  const before = low - 1;
  return before >= 0 && Math.abs((xs[before] ?? 0) - x) <= Math.abs((xs[low] ?? 0) - x)
    ? before
    : low;
}

/** A line with text per point: a series or an indicator's line. */
interface Points {
  readonly x: Float64Array;
  readonly yText: readonly (string | null)[];
}

/** Whether point `i` of `points` is drawn, rather than a break between segments. */
function drawn(points: Points, i: number): boolean {
  return (points.yText[i] ?? null) !== null;
}

/** The first drawn point at or left of `i`, or -1. */
function drawnLeftOf(points: Points, i: number): number {
  let left = i;
  while (left >= 0 && !drawn(points, left)) {
    left -= 1;
  }
  return left;
}

/** The first drawn point at or right of `i`, or past the end. */
function drawnRightOf(points: Points, i: number): number {
  let right = i;
  while (right < points.x.length && !drawn(points, right)) {
    right += 1;
  }
  return right;
}

/** The index of the drawn point of `points` nearest `x`, skipping breaks, or -1 if there is none. */
function nearestDrawn(points: Points, x: number): number {
  const i = nearestIndex(points.x, x);
  if (i < 0) {
    return -1;
  }
  // The nearest drawn point is the first one met going left from the nearest point, or going right.
  const [left, right] = [drawnLeftOf(points, i), drawnRightOf(points, i)];
  if (right >= points.x.length) {
    return left;
  }
  return left >= 0 && Math.abs((points.x[left] ?? 0) - x) <= Math.abs((points.x[right] ?? 0) - x)
    ? left
    : right;
}

/** A shown series of a line or area chart, with its legend colour. */
interface Shown {
  readonly series: SeriesData;
  readonly color: string | null;
}

/** Where the crosshair snapped: its axis position on `scale`, and the colour of a chart's one line. */
interface Snapped {
  readonly scale: Scale;
  readonly at: number;
  readonly lone: string | null;
}

/** The series shown, with their legend colours: not hidden, and with points. */
function shownSeries(
  series: readonly SeriesData[],
  model: ChartModel,
  hidden: readonly string[],
): Shown[] {
  return series
    .map((line, i): Shown => ({ color: model.legend[i]?.color ?? null, series: line }))
    .filter(({ series: line }) => !hidden.includes(line.label) && line.x.length > 0);
}

/** The drawn point nearest `x` of any shown series, and its title. */
function snapped(
  shown: readonly Shown[],
  x: number,
): { readonly at: number; readonly title: string } | null {
  let best: { readonly at: number; readonly title: string } | null = null;
  for (const { series } of shown) {
    const i = nearestDrawn(series, x);
    const at = series.x[i];
    if (at !== undefined && (best === null || Math.abs(at - x) < Math.abs(best.at - x))) {
      best = { at, title: series.xText[i] ?? "" };
    }
  }
  return best;
}

/** A shown series' row at the crosshair's position, or none without a drawn point within a few pixels. */
function seriesRow({ series, color }: Shown, { scale, at, lone }: Snapped): TipRow[] {
  const i = nearestDrawn(series, at);
  const [point, value] = [series.x[i], series.yText[i]];
  if (
    point === undefined ||
    value === null ||
    value === undefined ||
    Math.abs(pixel(scale, point) - pixel(scale, at)) > near
  ) {
    return [];
  }
  const label = point === at ? series.label : `${series.label}, ${series.xText[i] ?? ""}`;
  return [{ color: color ?? lone, label, value }];
}

/** The colour of a chart's first line, for a series without a legend colour of its own. */
function loneColor(model: ChartModel): string | null {
  return model.marks.find((mark) => mark.kind === "line")?.color ?? null;
}

/**
 * What the crosshair reads at axis position `x` on a line or area chart: it snaps to the nearest point of any shown
 * series, then lists every shown series' point nearest it, so the pointer never has to land on a line. Breaks between
 * segments are never snapped to or read. The engine keeps different points of each series when it reduces them to the
 * pixels, so a series' nearest point may be of another x than the crosshair's; its row then names that x too, and a
 * series with no point within a few pixels, or a gap there, says nothing.
 */
function readSeries(
  frame: ChartFrameData,
  model: ChartModel,
  { hidden, x }: ReadAt,
): Reading | null {
  const { content } = frame;
  const scale = model.x;
  if (content.kind !== "series" || scale === null) {
    return null;
  }
  const shown = shownSeries(content.series, model, hidden);
  const point = snapped(shown, x);
  if (point === null) {
    return null;
  }
  const at = { at: point.at, lone: loneColor(model), scale };
  return {
    crosshair: pixel(scale, point.at),
    rows: shown.flatMap((line) => seriesRow(line, at)),
    title: point.title,
  };
}

/** The bucket holding axis position `x`, as its start and the next one's, or null outside every bucket or without candles. */
function bucketAt(frame: ChartFrameData, x: number): Range | null {
  if (frame.content.kind !== "candles") {
    return null;
  }
  const { candles } = frame.content;
  // The last bucket starting at or before `x`, if `x` is before its end.
  const low = bisect(candles.from, candles.from.length, (value) => value <= x);
  const [from, to] = [candles.from[low - 1], candles.to[low - 1]];
  return from === undefined || to === undefined || x >= to ? null : [from, to];
}

/** The index of the last drawn point of `line` inside `[from, to)`, or -1 if none is. */
function lastDrawnIn(line: Points, [from, to]: Range): number {
  // The first point at or past `to`, by bisection; the one before it is the last inside.
  const low = bisect(line.x, line.x.length, (value) => value < to);
  const i = drawnLeftOf(line, low - 1);
  return i >= 0 && (line.x[i] ?? Number.NaN) >= from ? i : -1;
}

/** An indicator line's value in a candle's bucket, at its last row, under that row's date. */
function readBucket(line: IndicatorLineData, style: IndicatorStyle, bucket: Range): TipRow[] {
  const at = lastDrawnIn(line, bucket);
  const [point, value] = [line.x[at], line.yText[at]];
  return point === undefined || value === null || value === undefined
    ? []
    : [{ color: style.color, label: `${style.label}, ${line.xText[at] ?? ""}`, value }];
}

/** An indicator line's value at its drawn point nearest `x`, within a few pixels, under its own x if that differs. */
function readNear(
  line: IndicatorLineData,
  style: IndicatorStyle,
  { scale, x }: { readonly scale: Scale; readonly x: number },
): TipRow[] {
  const at = nearestDrawn(line, x);
  const [point, value] = [line.x[at], line.yText[at]];
  if (
    point === undefined ||
    value === null ||
    value === undefined ||
    Math.abs(pixel(scale, point) - pixel(scale, x)) > near
  ) {
    return [];
  }
  const label =
    Math.abs(pixel(scale, point) - pixel(scale, x)) < samePixel
      ? style.label
      : `${style.label}, ${line.xText[at] ?? ""}`;
  return [{ color: style.color, label, value }];
}

/**
 * Each indicator line's value at axis position `x`: its drawn point nearest `x`, within a few pixels, under its own x
 * when that differs from the crosshair's, as for series. Hidden overlays read nothing.
 */
function indicatorRows(frame: ChartFrameData, model: ChartModel, { hidden, x }: ReadAt): TipRow[] {
  const scale = model.x;
  if (scale === null) {
    return [];
  }
  // On a candle, each indicator reads the last row inside the candle's bucket, the one its close comes from.
  const bucket = bucketAt(frame, x);
  return frame.indicators.flatMap((line, i): TipRow[] => {
    const style = model.indicators[i];
    if (style === undefined || hidden.includes(style.group) || hidden.includes(style.follows)) {
      return [];
    }
    return bucket === null ? readNear(line, style, { scale, x }) : readBucket(line, style, bucket);
  });
}

/**
 * The events at axis position `x`: on a candle, those in its bucket; otherwise those within a few pixels. The event
 * leads and its date follows, as values and labels do in other rows.
 */
function eventRows(frame: ChartFrameData, model: ChartModel, x: number): TipRow[] {
  const scale = model.x;
  if (scale === null) {
    return [];
  }
  const bucket = bucketAt(frame, x);
  const px = pixel(scale, x);
  return model.events
    .filter((event) =>
      bucket === null
        ? Math.abs(event.px - px) <= near
        : event.x >= bucket[0] && event.x < bucket[1],
    )
    .map((event) => ({ color: null, label: event.xText, value: event.text }));
}

export { categoryAt, markAt } from "./marks-at.ts";
export { eventRows, indicatorRows, nearestDrawn, nearestIndex, readSeries };
export type { ReadAt, Reading, TipRow };
