/* Zooming and panning a chart's x range, and the filters a brushed range selects, worked out without the DOM so that
 * tests can check them. */

import type { CandleData, ChartFrameData, SeriesData } from "#frame/chart-data.ts";
import type { LayoutFilter, LayoutScalar } from "#layout/layout.ts";

/** An x range in axis positions. */
type Range = readonly [number, number];

/** The smallest share of the full range a zoom may reach. */
const minShare = 1e-6;

/** Keeps `range` within `full`, at least its smallest share wide, moving it rather than shrinking it at the edges. */
function clamp(range: Range, full: Range | null): Range {
  if (full === null) {
    return range;
  }
  const span = Math.min(
    full[1] - full[0],
    Math.max(range[1] - range[0], (full[1] - full[0]) * minShare),
  );
  const from = Math.min(Math.max(range[0], full[0]), full[1] - span);
  return [from, from + span];
}

/** How a zoom moves a range: around which axis position, by what factor, and within what full range. */
interface Zoom {
  readonly anchor: number;
  /** Below 1 zooms in, above 1 out. */
  readonly factor: number;
  readonly full: Range | null;
}

/** Zooms `range` by `factor` around `anchor`: below 1 zooms in, above 1 out. Null when it reaches the full range. */
function zoomRange(range: Range, { anchor, factor, full }: Zoom): Range | null {
  const next = clamp(
    [anchor - (anchor - range[0]) * factor, anchor + (range[1] - anchor) * factor],
    full,
  );
  return full !== null && next[0] <= full[0] && next[1] >= full[1] ? null : next;
}

/** Moves `range` by `delta` axis units, staying within the full range. */
function panRange(range: Range, delta: number, full: Range | null): Range {
  return clamp([range[0] + delta, range[1] + delta], full);
}

/** A JSON scalar, or undefined for a missing value or anything else. */
function scalar(json: string | null | undefined): LayoutScalar | undefined {
  if (json === null || json === undefined) {
    return undefined;
  }
  const value: unknown = JSON.parse(json);
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value
    : undefined;
}

/** A point or bucket a brush covers: where it starts and ends on the axis, and those bounds' exact values. */
interface Span {
  readonly from: number;
  readonly to: number;
  readonly fromJson: string | null;
  readonly toJson: string | null;
}

/** The drawn points of the shown series inside `[from, to]`. */
function pointsIn(
  series: readonly SeriesData[],
  hidden: readonly string[],
  [from, to]: Range,
): Span[] {
  const spans: Span[] = [];
  for (const shown of series.filter((line) => !hidden.includes(line.label))) {
    for (const [i, x] of shown.x.entries()) {
      if (x >= from && x <= to && (shown.yText[i] ?? null) !== null) {
        const json = shown.xJson[i] ?? null;
        spans.push({ from: x, fromJson: json, to: x, toJson: json });
      }
    }
  }
  return spans;
}

/** The buckets that overlap `[from, to]`, each whole: from its start up to the next bucket's start. */
function bucketsIn(candles: CandleData, [from, to]: Range): Span[] {
  const spans: Span[] = [];
  for (const [i, start] of candles.from.entries()) {
    const end = candles.to[i] ?? start;
    if (start <= to && end > from) {
      spans.push({
        from: start,
        fromJson: candles.xJson[i] ?? null,
        to: end,
        toJson: candles.endJson[i] ?? null,
      });
    }
  }
  return spans;
}

/** A brushed range's selection: the filters that select it, and the x range it covers, which the band snaps to. */
interface Brushed {
  readonly filters: readonly LayoutFilter[];
  readonly range: Range;
}

/** What a brush selects among: the x column's name, the series hidden, and the range brushed, either way round. */
interface Brush {
  readonly column: string;
  readonly hidden: readonly string[];
  readonly range: Range;
}

/** The spans a brushed range covers, in the frame's content. */
function spansIn(frame: ChartFrameData, hidden: readonly string[], range: Range): Span[] {
  const { content } = frame;
  if (content.kind === "series") {
    return pointsIn(content.series, hidden, range);
  }
  if (content.kind === "candles") {
    return bucketsIn(content.candles, range);
  }
  return [];
}

/** The span that starts first, and the one that ends last. */
function outerSpans(spans: readonly Span[]): { readonly first: Span; readonly last: Span } | null {
  let first: Span | null = null;
  let last: Span | null = null;
  for (const span of spans) {
    if (first === null || span.from < first.from) {
      first = span;
    }
    if (last === null || span.to > last.to) {
      last = span;
    }
  }
  return first === null || last === null ? null : { first, last };
}

/**
 * What a brushed x range selects: on a line or area chart, from the first drawn point inside it to the last; on candles,
 * every bucket it touches, whole. Each bound is the exact value the engine sent, so a linked view's rows are those the
 * chart drew there, and the band snaps to the selection so that it shows exactly what was selected. Null if nothing is
 * selected.
 */
function brushFilters(frame: ChartFrameData, { column, hidden, range }: Brush): Brushed | null {
  const ordered: Range = range[0] <= range[1] ? range : [range[1], range[0]];
  const outer = outerSpans(spansIn(frame, hidden, ordered));
  if (outer === null) {
    return null;
  }
  const { first, last } = outer;
  const [low, high] = [scalar(first.fromJson), scalar(last.toJson)];
  if (low === undefined || high === undefined) {
    return null;
  }
  // A bucket stops short of the next one's start; a point includes itself.
  const op = frame.content.kind === "candles" ? "lt" : "le";
  return {
    filters: [
      { column, columns: [], op: "ge", value: low, values: [] },
      { column, columns: [], op, value: high, values: [] },
    ],
    range: [first.from, last.to],
  };
}

export { brushFilters, panRange, scalar, zoomRange };
export type { Brush, Brushed, Range, Zoom };
