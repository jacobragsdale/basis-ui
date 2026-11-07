/* Indicator lines and two weekly candles for the indicators' unit tests, and the model of a chart over them at 600 by
 * 500 pixels. */

import { chartModel } from "#chart/model.ts";
import type { ChartModel } from "#chart/model-types.ts";
import type {
  CandleData,
  ChartFrameData,
  IndicatorLineData,
  SeriesData,
} from "#frame/chart-data.ts";
import type { LayoutChart } from "#layout/chart.ts";
import type { LayoutInput } from "#layout/layout.ts";
import { chartColors } from "#theme/charts.ts";

import { chartOf, frameOf } from "./chart-model-inputs.ts";
// Two weekly candles over days 0 to 9, rising then falling, with their volume.
import weekly from "./weekly-candles.json" with { type: "json" };

const colors = chartColors.light;
const dayCount = 10;
const days = Array.from({ length: dayCount }, (_day, day) => day);
const modelWidth = 600;
const modelHeight = 500;
const characterWidth = 6;
const decimals = 2;

/** A candlestick chart, or a line chart, with `indicators`. */
function candleChart(
  indicators: NonNullable<LayoutInput["chart"]>["indicators"],
  kind: "candlestick" | "line" = "candlestick",
): LayoutChart {
  return chartOf({
    indicators,
    kind,
    ohlc: { close: "c", high: "h", low: "l", open: "o" },
    volume: "v",
    x: "date",
  });
}

/** Which indicator's line a line is, and the series it follows. */
interface LineOf {
  readonly indicator: number;
  readonly name: string;
  readonly series?: string;
}

/** An indicator's line through `points`, each day written "day N" and each value to two decimals. */
function line(
  { indicator, name, series = "" }: LineOf,
  points: readonly (readonly [number, number])[],
): IndicatorLineData {
  return {
    indicator,
    line: name,
    series,
    x: Float64Array.from(points.map(([x]) => x)),
    xText: points.map(([x]) => `day ${String(x)}`),
    y: Float64Array.from(points.map(([, y]) => y)),
    yText: points.map(([, y]) => (Number.isNaN(y) ? null : y.toFixed(decimals))),
  };
}

/** Two weekly candles over days 0 to 9, rising then falling, with their volume. */
const candles: CandleData = {
  ...weekly,
  close: Float64Array.from(weekly.close),
  from: Float64Array.from(weekly.from),
  high: Float64Array.from(weekly.high),
  low: Float64Array.from(weekly.low),
  open: Float64Array.from(weekly.open),
  to: Float64Array.from(weekly.to),
  volume: Float64Array.from(weekly.volume),
};

/** The two weekly candles with `indicators`' lines. */
function candleFrame(indicators: readonly IndicatorLineData[]): ChartFrameData {
  return { ...frameOf({ candles, kind: "candles" }), indicators, ticks: [] };
}

/** The model of `chart` over `data`. */
function model(chart: LayoutChart, data: ChartFrameData): ChartModel {
  return chartModel({
    categories: null,
    chart,
    colors,
    frame: data,
    height: modelHeight,
    measure: (text) => text.length * characterWidth,
    muted: "#999999",
    width: modelWidth,
  });
}

/** A series of closes, one a day. */
function closes(label: string, values: readonly number[]): SeriesData {
  return {
    column: "close",
    label,
    right: false,
    x: Float64Array.from(days),
    xJson: days.map(String),
    xText: days.map(String),
    y: Float64Array.from(values),
    yText: values.map(String),
  };
}

export { candleChart, candleFrame, closes, days, line, model };
export type { LineOf };
