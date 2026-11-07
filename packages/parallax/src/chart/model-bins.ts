/* The draw models of a histogram's bins, side by side per series, and of a scatter's density, a cell per few pixels
 * shaded by its count. */

import type { ChartContent, ChartFrameData, HistogramSeries } from "#frame/chart-data.ts";

import type { ChartModel, Hit, Mark, ModelInput, Rect, Scale } from "./model-types.ts";
import {
  axis,
  columnStyle,
  count,
  gap,
  hidden,
  legendOf,
  onto,
  padOf,
  plotFor,
  rampColor,
  seriesColor,
  valueScale,
  xAxisHeight,
} from "./model-shared.ts";
import { linearScale, pixel } from "./scale.ts";

type Content<TKind extends ChartContent["kind"]> = Extract<ChartContent, { kind: TKind }>;

/** A histogram's series shown, its place among all of them, and its place among those shown. */
interface Shown {
  readonly series: HistogramSeries;
  readonly i: number;
  readonly place: number;
}

/** How a histogram's bins are placed: the axes, the baseline, and how many series share a bin. */
interface BinPlot {
  readonly x: Scale;
  readonly y: Scale;
  readonly base: number;
  readonly sharing: number;
}

/** Bin `bin` of a series shown, or null when it is empty or has no room. */
function binMark(
  input: ModelInput,
  { series, i, place, bin }: Shown & { readonly bin: number },
  { x, y, base, sharing }: BinPlot,
): Mark | null {
  const binCount = series.counts[bin] ?? 0;
  const [from, to] = [pixel(x, series.from[bin] ?? 0), pixel(x, series.to[bin] ?? 0)];
  // Series share a bin side by side; bins keep a surface gap between them.
  const share = (to - from - gap) / sharing;
  if (binCount <= 0 || share <= 0) {
    return null;
  }
  const top = pixel(y, binCount);
  const hit: Hit = {
    rows: [{ label: series.label, value: count.format(binCount) }],
    title: `${series.fromText[bin] ?? ""} to ${series.toText[bin] ?? ""}`,
  };
  const rect = { height: base - top, width: share, x: from + gap / 2 + place * share, y: top };
  return { color: seriesColor(input, i), hit, kind: "rect", rect, round: "top" };
}

/** One series' bins, side by side with the other series' in each bin. */
function binMarks(input: ModelInput, shown: Shown, plot: BinPlot): Mark[] {
  const marks: Mark[] = [];
  for (let bin = 0; bin < shown.series.counts.length; bin += 1) {
    const mark = binMark(input, { ...shown, bin }, plot);
    if (mark !== null) {
      marks.push(mark);
    }
  }
  return marks;
}

/** The model of a histogram. */
function histogramModel(
  input: ModelInput,
  frame: ChartFrameData,
  content: Content<"histogram">,
): ChartModel {
  const visible = content.series
    .map((series, i) => ({ i, series }))
    .filter(({ series }) => !hidden(input, series.label));
  const counts = visible.flatMap(({ series }) => series.counts);
  const range: readonly [number, number] = [input.height - xAxisHeight, padOf(input)];
  const scale = valueScale(input, counts, { range, zero: true });
  const plot = plotFor(input, { left: axis("left", scale).ticks, right: null });
  const y = onto(scale, [plot.y + plot.height, plot.y]);
  const x = linearScale([frame.xFrom, frame.xTo], [plot.x, plot.x + plot.width]);
  const base = pixel(y, y.log ? y.domain[0] : 0);
  const binPlot = { base, sharing: visible.length, x, y };
  return {
    empty: counts.every((binCount) => binCount === 0) ? "No data in this range" : null,
    events: [],
    height: input.height,
    indicators: [],
    legend: legendOf(
      input,
      content.series.map((series) => series.label),
      "rect",
    ),
    marks: visible.flatMap((shown, place) => binMarks(input, { ...shown, place }, binPlot)),
    panes: [],
    plot,
    width: input.width,
    x,
    xTicks: frame.ticks.map((tick) => ({ label: tick.label, px: pixel(x, tick.x) })),
    yAxes: [axis("left", y)],
    yLabels: [],
  };
}

/** The most points a density's cell holds. */
function mostOf(counts: Uint32Array): number {
  // A density has a cell per 4 px square, too many to spread as arguments.
  let most = 0;
  for (const cellCount of counts) {
    most = Math.max(most, cellCount);
  }
  return most;
}

/** A density's cell of `count` points, where the fullest holds `most`. */
function densityCell(
  input: ModelInput,
  {
    cell,
    count: cellCount,
    most,
  }: { readonly cell: Rect; readonly count: number; readonly most: number },
): Mark {
  // Counts span orders of magnitude, so the ramp follows their logarithm.
  const share = Math.log1p(cellCount) / Math.log1p(most);
  return { color: rampColor(input.colors.ramp, share), hit: null, kind: "cell", rect: cell };
}

/** A density's cells, each shaded by its count on a ramp that follows the counts' logarithm. */
function densityCells(input: ModelInput, content: Content<"density">, plot: Rect): Mark[] {
  const most = mostOf(content.counts);
  const [width, height] = [plot.width / content.columns, plot.height / content.rows];
  const marks: Mark[] = [];
  for (let row = 0; row < content.rows; row += 1) {
    for (let column = 0; column < content.columns; column += 1) {
      const cellCount = content.counts[row * content.columns + column] ?? 0;
      if (cellCount > 0) {
        const cell = {
          height,
          width,
          x: plot.x + column * width,
          y: plot.y + plot.height - (row + 1) * height,
        };
        marks.push(densityCell(input, { cell, count: cellCount, most }));
      }
    }
  }
  return marks;
}

/** The model of a scatter, drawn as a density. */
function densityModel(
  input: ModelInput,
  frame: ChartFrameData,
  content: Content<"density">,
): ChartModel {
  const range: readonly [number, number] = [input.height - xAxisHeight, padOf(input)];
  const scale = linearScale([content.yFrom, content.yTo], range);
  const style = columnStyle(input, input.chart.y[0]);
  const plot = plotFor(input, { left: axis("left", scale, { style }).ticks, right: null });
  const y = linearScale([content.yFrom, content.yTo], [plot.y + plot.height, plot.y]);
  const x = linearScale([frame.xFrom, frame.xTo], [plot.x, plot.x + plot.width]);
  const marks = densityCells(input, content, plot);
  return {
    empty: marks.length === 0 ? "No data in this range" : null,
    events: [],
    height: input.height,
    indicators: [],
    legend: [],
    marks,
    panes: [],
    plot,
    width: input.width,
    x,
    xTicks: frame.ticks.map((tick) => ({ label: tick.label, px: pixel(x, tick.x) })),
    yAxes: [axis("left", y, { style })],
    yLabels: [],
  };
}

export { densityModel, histogramModel };
