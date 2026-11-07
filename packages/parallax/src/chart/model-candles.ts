/* The draw models of candles and OHLC bars, with their indicators over the price, and of the engine's other
 * reductions along an x axis: a histogram's bins and a scatter's density. */

import type { CandleData, ChartContent, ChartFrameData } from "#frame/chart-data.ts";

import { indicatorStyles } from "./indicators.ts";
import type { CandleMark, ChartModel, Hit, Mark, ModelInput, Rect, Scale } from "./model-types.ts";
import { eventMarks, legendWithOverlays, overlayMarks, overlayValues } from "./model-overlays.ts";
import {
  axis,
  columnStyle,
  columnWidth,
  onto,
  padOf,
  plotFor,
  valueScale,
  xAxisHeight,
} from "./model-shared.ts";
import { linearScale, pixel } from "./scale.ts";

type Content<TKind extends ChartContent["kind"]> = Extract<ChartContent, { kind: TKind }>;

const periods: ReadonlyMap<string, string> = new Map([
  ["week", "Week"],
  ["month", "Month"],
  ["quarter", "Quarter"],
  ["year", "Year"],
]);

/** A bucket's title: a day's date, or the period it starts, such as "Month of 2024-06-01" or "5 minutes from
 * 09:30". */
function bucketTitle(interval: string, start: string): string {
  const period = periods.get(interval);
  if (period !== undefined) {
    return `${period} of ${start}`;
  }
  const many = /^(?<count>\d+)(?<unit>[my])$/u.exec(interval);
  if (many === null) {
    return start;
  }
  const [count, unit] = [
    many.groups?.["count"] ?? "",
    many.groups?.["unit"] === "m" ? "minute" : "year",
  ];
  return `${count} ${unit}${count === "1" ? "" : "s"} from ${start}`;
}

/** What a candle's tooltip reads: its prices, and its volume when the chart shows it. */
function candleHit(candles: CandleData, i: number): Hit {
  const volume =
    candles.volumeText === null ? [] : [{ label: "Volume", value: candles.volumeText[i] ?? "" }];
  return {
    rows: [
      { label: "Open", value: candles.openText[i] ?? "" },
      { label: "High", value: candles.highText[i] ?? "" },
      { label: "Low", value: candles.lowText[i] ?? "" },
      { label: "Close", value: candles.closeText[i] ?? "" },
      ...volume,
    ],
    title: bucketTitle(candles.interval, candles.xText[i] ?? ""),
  };
}

/** How candles are placed: the axes, and whether they are OHLC bars. */
interface CandlePlot {
  readonly x: Scale;
  readonly y: Scale;
  readonly bars: boolean;
}

/** The candle or OHLC bar for bucket `i`, or null if a price is missing. */
function candleMark(
  input: ModelInput,
  candles: CandleData,
  at: CandlePlot & { readonly i: number },
): CandleMark | null {
  const { x, y, bars, i } = at;
  const [open, high, low, close] = [
    candles.open[i] ?? Number.NaN,
    candles.high[i] ?? Number.NaN,
    candles.low[i] ?? Number.NaN,
    candles.close[i] ?? Number.NaN,
  ];
  if (![open, high, low, close].every((price) => Number.isFinite(price))) {
    return null;
  }
  const [from, to] = [pixel(x, candles.from[i] ?? 0), pixel(x, candles.to[i] ?? 0)];
  const up = close >= open;
  const hit = candleHit(candles, i);
  return {
    bars,
    close: pixel(y, close),
    color: up ? input.colors.up : input.colors.down,
    high: pixel(y, high),
    hit,
    // Rising candles are hollow and falling ones filled, so direction never rests on colour alone.
    hollow: up,
    kind: "candle",
    low: pixel(y, low),
    open: pixel(y, open),
    width: columnWidth(to - from),
    x: (from + to) / 2,
  };
}

/** Every bucket's candle or OHLC bar, leaving out those missing a price. */
function candleMarks(input: ModelInput, candles: CandleData, plot: CandlePlot): Mark[] {
  const marks: Mark[] = [];
  for (let i = 0; i < candles.from.length; i += 1) {
    const mark = candleMark(input, candles, { ...plot, i });
    if (mark !== null) {
      marks.push(mark);
    }
  }
  return marks;
}

/** The price's plot and its scale, fitted to `values`. */
function priceAxis(
  input: ModelInput,
  values: readonly number[],
): { readonly plot: Rect; readonly y: Scale } {
  const range: readonly [number, number] = [input.height - xAxisHeight, padOf(input)];
  const scale = valueScale(input, values, { range, zero: false });
  const style = columnStyle(input, input.chart.ohlc?.close);
  const plot = plotFor(input, { left: axis("left", scale, { style }).ticks, right: null });
  return { plot, y: onto(scale, [plot.y + plot.height, plot.y]) };
}

/** The model of a candlestick or OHLC chart. */
function candleModel(
  input: ModelInput,
  frame: ChartFrameData,
  content: Content<"candles">,
): ChartModel {
  const { candles } = content;
  const styles = indicatorStyles(input.chart, frame, {
    colors: input.colors,
    muted: input.muted,
    plotted: 0,
  });
  const { plot, y } = priceAxis(input, [
    ...candles.low,
    ...candles.high,
    ...overlayValues(input, frame, styles),
  ]);
  const x = linearScale([frame.xFrom, frame.xTo], [plot.x, plot.x + plot.width]);
  const marks = candleMarks(input, candles, { bars: input.chart.kind === "ohlc", x, y });
  return {
    empty: marks.length === 0 ? "No data in this range" : null,
    events: eventMarks(input, frame, x),
    height: input.height,
    indicators: styles,
    legend: legendWithOverlays(input, [], { shape: "line", styles }),
    marks: [...marks, ...overlayMarks(input, { frame, styles, x, y })],
    panes: [],
    plot,
    width: input.width,
    x,
    xTicks: frame.ticks.map((tick) => ({ label: tick.label, px: pixel(x, tick.x) })),
    yAxes: [axis("left", y, { style: columnStyle(input, input.chart.ohlc?.close) })],
    yLabels: [],
  };
}

export { bucketTitle, candleModel };
