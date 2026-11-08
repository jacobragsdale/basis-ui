/* What the pointer's unit tests read charts from: a layout's chart, a chart frame without ticks, a model of it in the
 * light scheme's colours with every character 6 px wide, and series, candles and days to build frames of. */

import { chartModel } from "#chart/model.ts";
import type { CategoryData, ChartModel } from "#chart/model-types.ts";
import type { CandleData, ChartContent, ChartFrameData, SeriesData } from "#frame/chart-data.ts";
import type { LayoutChart } from "#layout/chart.ts";
import { parseLayout } from "#layout/layout.ts";
import type { LayoutInput } from "#layout/layout.ts";
import { chartColors } from "#theme/charts.ts";

const characterWidth = 6;
const defaultWidth = 400;
const defaultHeight = 300;
const lastX = 10;

/** Every character 6 px wide. */
function measure(text: string): number {
  return text.length * characterWidth;
}

/** A chart as the layout's schema fills it in. */
function chartOf(chart: NonNullable<LayoutInput["chart"]>): LayoutChart {
  const layout = parseLayout({ chart });
  if (layout.chart === null) {
    throw new Error("The layout has no chart.");
  }
  return layout.chart;
}

/** A chart frame of `content` over x from `xFrom` to `xTo`, without ticks. */
function frameOf(content: ChartContent, { xFrom = 0, xTo = lastX } = {}): ChartFrameData {
  return {
    anchors: new Map(),
    configVersion: 0n,
    content,
    events: [],
    eventsTotal: 0,
    fits: [],
    extentFrom: xFrom,
    extentTo: xTo,
    indicators: [],
    loadVersion: 1n,
    pushed: false,
    sourceAsOfMicros: 0n,
    ticks: [],
    viewId: 1,
    xFrom,
    xTo,
  };
}

/** What a model draws, and at what size: 400 by 300 pixels by default. */
interface ModelData {
  readonly frame?: ChartFrameData;
  readonly categories?: CategoryData;
  readonly width?: number;
  readonly height?: number;
}

/** The draw model of `chart` over a frame or a grouped view's categories. */
function modelOf(chart: LayoutChart, data: ModelData): ChartModel {
  return chartModel({
    categories: data.categories ?? null,
    chart,
    colors: chartColors.light,
    frame: data.frame ?? null,
    height: data.height ?? defaultHeight,
    measure,
    muted: "#999999",
    width: data.width ?? defaultWidth,
  });
}

/** A series at the given x positions, with null for a gap, each x written as "day N" and dated from 2024-01-01. */
function pointsOf(
  label: string,
  points: readonly (readonly [number, number | null])[],
): SeriesData {
  return {
    column: "close",
    key: "",
    label,
    right: false,
    x: Float64Array.from(points, ([x]) => x),
    xJson: points.map(([x]) => JSON.stringify(`2024-01-${String(x + 1).padStart(2, "0")}`)),
    xText: points.map(([x]) => `day ${String(x)}`),
    y: Float64Array.from(points, ([, y]) => y ?? Number.NaN),
    yText: points.map(([, y]) => (y === null ? null : y.toFixed(2))),
  };
}

/** Numbers as written, which a candle's values are read from as its text is. */
function written(text: string): readonly string[] {
  return text.split(" ");
}

/** Three daily candles, Monday to Wednesday, from 2024-01-01, each price read from its text. */
const threePrices = {
  close: written("12 10 11.5"),
  high: written("13 13 12"),
  low: written("9 10 10"),
  open: written("10 12 11"),
};
const threeCandles: CandleData = {
  close: Float64Array.from(threePrices.close, Number),
  closeText: threePrices.close,
  endJson: ['"2024-01-02"', '"2024-01-03"', '"2024-01-04"'],
  from: Float64Array.from(written("0 1 2"), Number),
  high: Float64Array.from(threePrices.high, Number),
  highText: threePrices.high,
  interval: "day",
  low: Float64Array.from(threePrices.low, Number),
  lowText: threePrices.low,
  open: Float64Array.from(threePrices.open, Number),
  openText: threePrices.open,
  to: Float64Array.from(written("1 2 3"), Number),
  volume: null,
  volumeText: null,
  xJson: ['"2024-01-01"', '"2024-01-02"', '"2024-01-03"'],
  xText: ["Mon", "Tue", "Wed"],
};

/** Day 0 to day 9. */
const days = Array.from({ length: lastX }, (_day, day) => day);

/** Day 0's prices: each later day's are a unit more. */
const firstDay = { close: 100.5, high: 101, low: 99, open: 100 };

/** Ten daily candles, day 0 to day 9, priced from 100 to 109, dated from 2026-01-01. */
const tenCandles: CandleData = {
  close: Float64Array.from(days, (day) => firstDay.close + day),
  closeText: days.map(String),
  endJson: days.map((day) => JSON.stringify(`2026-01-${String(day + 2).padStart(2, "0")}`)),
  from: Float64Array.from(days),
  high: Float64Array.from(days, (day) => firstDay.high + day),
  highText: days.map(String),
  interval: "day",
  low: Float64Array.from(days, (day) => firstDay.low + day),
  lowText: days.map(String),
  open: Float64Array.from(days, (day) => firstDay.open + day),
  openText: days.map(String),
  to: Float64Array.from(days, (day) => day + 1),
  volume: null,
  volumeText: null,
  xJson: days.map((day) => JSON.stringify(`2026-01-${String(day + 1).padStart(2, "0")}`)),
  xText: days.map((day) => `day ${String(day)}`),
};

export { chartOf, days, frameOf, measure, modelOf, pointsOf, tenCandles, threeCandles };
