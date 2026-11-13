/* What a chart says in words: the status line's summary of what it draws, and the text alternative a screen reader
 * reads in place of the canvas, with the values the chart shows, as the engine wrote them. */

import type { CandleData, ChartFrameData, PointSeries, SeriesData } from "#frame/chart-data.ts";
import { groupedKinds } from "#layout/chart.ts";
import type { LayoutChart } from "#layout/chart.ts";

import { bucketTitle } from "./model-candles.ts";
import type { CategoryData } from "./model-types.ts";
import { unreadProblem } from "./group-limits.ts";

const count = new Intl.NumberFormat("en-US");

/** The most groups or series a text alternative lists; the rest are counted. */
const mostListed = 40;

/** What a summary or text alternative is made from. */
interface SummaryInput {
  readonly chart: LayoutChart;
  readonly frame: ChartFrameData | null;
  readonly categories: CategoryData | null;
  readonly zoomed: boolean;
  /** Drawings whose anchors the axis cannot place, as after the x column changed. */
  readonly unplaced: number;
}

function groupsKind(chart: LayoutChart): boolean {
  return groupedKinds.has(chart.kind);
}

/** The sum of whole counts. */
function sum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total;
}

/** A count of dots, in words. */
function dots(total: number): string {
  return `${count.format(total)} ${total === 1 ? "dot" : "dots"}`;
}

/** How much a frame draws: points, dots, bins or candles. */
function drawnOf(frame: ChartFrameData): string {
  const { content } = frame;
  switch (content.kind) {
    case "series": {
      return `${count.format(sum(content.series.map((series) => series.x.length)))} points drawn`;
    }
    case "histogram": {
      return `${count.format(content.series[0]?.counts.length ?? 0)} bins`;
    }
    case "points": {
      return dots(sum(content.series.map((series) => series.x.length)));
    }
    case "density": {
      return `${count.format(sum(content.counts))} points`;
    }
    case "candles": {
      return `${count.format(content.candles.from.length)} ${content.candles.interval} candles`;
    }
    default: {
      return content satisfies never;
    }
  }
}

/** What the chart draws, or that it is loading. */
function drawn({ chart, frame, categories }: SummaryInput): string {
  if (categories !== null && groupsKind(chart)) {
    return (
      unreadProblem(chart.kind, categories.unread) ??
      `${count.format(categories.categories.length)} groups`
    );
  }
  if (frame === null) {
    return "loading…";
  }
  // The engine bins a density by value, so its axis is linear, though the dots it stands for were on a log one.
  const linear = frame.content.kind === "density" && chart.log_y && !chart.compare;
  return linear ? `${drawnOf(frame)}, on a linear axis` : drawnOf(frame);
}

/** The status line's summary: what the chart draws, whether it is zoomed, drawings it cannot place, and events past
 * those marked. */
function chartSummary(input: SummaryInput): string {
  const what = drawn(input);
  if (what === "loading…") {
    return what;
  }
  const zoomed = input.zoomed ? ", zoomed in" : "";
  const { unplaced, frame } = input;
  const note =
    unplaced === 0
      ? ""
      : `, ${String(unplaced)} ${unplaced === 1 ? "drawing" : "drawings"} not placed`;
  const events =
    frame === null || frame.eventsTotal <= frame.events.length
      ? ""
      : `, ${count.format(frame.events.length)} of ${count.format(frame.eventsTotal)} events marked`;
  return `${what}${zoomed}${note}${events}`;
}

/** The first and last value a series shows, with their x. */
function seriesWords(series: SeriesData): string {
  const first = series.yText.findIndex((text) => text !== null);
  const last = series.yText.findLastIndex((text) => text !== null);
  if (first === -1) {
    return `${series.label}: no values shown`;
  }
  const at = (index: number): string =>
    `${series.yText[index] ?? ""} at ${series.xText[index] ?? ""}`;
  return `${series.label}: from ${at(first)} to ${at(last)}`;
}

/** A scatter series' dots: how many, and the lowest and highest y they reach, with the ids of the dots there. */
function dotWords(series: PointSeries): string {
  if (series.y.length === 0) {
    return `${series.label}: no dots shown`;
  }
  let [low, high] = [0, 0];
  for (let dot = 1; dot < series.y.length; dot += 1) {
    low = (series.y[dot] ?? 0) < (series.y[low] ?? 0) ? dot : low;
    high = (series.y[dot] ?? 0) > (series.y[high] ?? 0) ? dot : high;
  }
  const at = (dot: number): string => {
    const id = series.idText[dot] ?? null;
    return `${series.yText[dot] ?? ""}${id === null ? "" : ` (${id})`}`;
  };
  const where = low === high ? `at ${at(low)}` : `from ${at(low)} to ${at(high)}`;
  return `${series.label}: ${dots(series.y.length)}, ${where}`;
}

/** Each group's values, as a table would read them. */
function groupWords(data: CategoryData): readonly string[] {
  return data.categories.slice(0, mostListed).map((category, index) => {
    const values = data.series.map((series) => `${series.label} ${series.texts[index] ?? ""}`);
    return `${category}: ${values.join(", ")}`;
  });
}

/** A candle chart's first open and last close. */
function candleWords(candles: CandleData): readonly string[] {
  const last = candles.from.length - 1;
  return last < 0
    ? []
    : [
        `${bucketTitle(candles.interval, candles.xText[0] ?? "")}: opens at ${candles.openText[0] ?? ""}`,
        `${bucketTitle(candles.interval, candles.xText[last] ?? "")}: closes at ${candles.closeText[last] ?? ""}`,
      ];
}

/** The values a frame shows, in words. */
function frameWords(frame: ChartFrameData | null): readonly string[] {
  if (frame === null) {
    return [];
  }
  const { content } = frame;
  if (content.kind === "series") {
    return content.series.slice(0, mostListed).map((series) => seriesWords(series));
  }
  if (content.kind === "points") {
    return content.series.slice(0, mostListed).map((series) => dotWords(series));
  }
  return content.kind === "candles" ? candleWords(content.candles) : [];
}

/** What the chart shows, for a screen reader: its summary, then its values. */
function chartWords(input: SummaryInput): string {
  const { chart, frame, categories } = input;
  const grouped = categories !== null && groupsKind(chart) && categories.unread === undefined;
  const values = grouped ? groupWords(categories) : frameWords(frame);
  return [chartSummary(input), ...values].join(". ");
}

/** The zone the status line shows times in, the firm's. */
const timeZone = "America/New_York";
const microsPerMilli = 1000n;
const timeFormat = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  second: "2-digit",
  timeZone,
  year: "numeric",
});

/** Microseconds since the epoch as `YYYY-MM-DD HH:MM:SS` in New York. */
function statusTime(micros: bigint): string {
  const formatted = timeFormat.formatToParts(new Date(Number(micros / microsPerMilli)));
  const parts = new Map(formatted.map((part) => [part.type, part.value]));
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.get(type) ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

/** A time of zero means the source gave none. */
const noTime = 0n;

/** The status line's `as of`, when the source was read; empty when it gave no time, rather than another time. */
function asOfLine(micros: bigint | null): string {
  return micros === null || micros === noTime ? "" : `as of ${statusTime(micros)}`;
}

export { asOfLine, chartSummary, chartWords };
export type { SummaryInput };
