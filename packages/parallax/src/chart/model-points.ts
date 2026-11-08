/* The draw model of a scatter's dots: each row the engine sent as a dot in its series' colour, its area following
 * its size column's share of the largest in the chart, the API's fit line through each series, and the dot whose id
 * is selected ringed while the others fade. */

import type { ChartContent, ChartFrameData, FitLineData, PointSeries } from "#frame/chart-data.ts";

import type { DotColumns } from "./model-dots.ts";
import type { ChartModel, Mark, ModelInput, Rect, Scale } from "./model-types.ts";
import {
  axis,
  columnStyle,
  hidden,
  legendOf,
  onto,
  padOf,
  plotFor,
  seriesColor,
  valueScale,
  xAxisHeight,
  upward,
} from "./model-shared.ts";
import { segmentsOf } from "./panes.ts";
import { linearScale, pixel } from "./scale.ts";

type Content = Extract<ChartContent, { kind: "points" }>;

/** A dot's radius without a size, and the smallest and largest with one; a compact chart's are smaller. */
const plainRadius = 3.5;
const smallestRadius = 2.5;
const largestRadius = 12;
const compactSmallest = 2;
const compactLargest = 6;
/** The most of the plot's width the dots' inset at either side takes. */
const insetShare = 0.25;
/** The fit line is thinner than a series' line, and dashed, so that it reads as a model rather than data. */
const fitWidth = 1.5;

/** A series shown, and its place among all the series, which picks its colour. */
interface Visible {
  readonly points: PointSeries;
  readonly i: number;
}

/** The radius of a dot whose size is `share` of the chart's largest: its area grows in step with the share, from the
 * smallest to the largest, so a dot of no size still shows. */
function radiusOf(share: number, [smallest, largest]: readonly [number, number]): number {
  if (Number.isNaN(share)) {
    return plainRadius;
  }
  const clamped = Math.min(1, Math.max(0, share));
  return Math.sqrt(smallest ** 2 + (largest ** 2 - smallest ** 2) * clamped);
}

/** The columns the tooltip names, from the layout's chart. */
function dotColumns(input: ModelInput): DotColumns {
  const { chart } = input;
  return {
    fit: chart.fit ?? null,
    size: chart.size ?? null,
    tooltip: chart.tooltip ?? [],
    x: chart.x,
    y: chart.y[0] ?? "",
  };
}

/** The index of the dot whose id reads `selected` in a series, or -1. */
function selectedIn(points: PointSeries, selected: string | null): number {
  return selected === null ? -1 : points.idText.indexOf(selected);
}

interface Placement {
  readonly x: Scale;
  readonly y: Scale;
  readonly largest: readonly [number, number];
  readonly selected: string | null;
}

/** A series' dots, placed in pixels. */
function dotsMark(input: ModelInput, { points, i }: Visible, placement: Placement): Mark {
  const { x, y, largest, selected } = placement;
  const count = points.x.length;
  const [xs, ys, radius] = [
    new Float64Array(count),
    new Float64Array(count),
    new Float64Array(count),
  ];
  for (let dot = 0; dot < count; dot += 1) {
    xs[dot] = pixel(x, points.x[dot] ?? 0);
    ys[dot] = pixel(y, points.y[dot] ?? 0);
    radius[dot] = radiusOf(points.size[dot] ?? Number.NaN, largest);
  }
  const at = selectedIn(points, selected);
  return {
    color: seriesColor(input, i),
    columns: dotColumns(input),
    dim: selected !== null && at === -1,
    kind: "dots",
    points,
    radius,
    selected: at,
    x: xs,
    y: ys,
  };
}

/** The scales a scatter places its dots and fit lines on. */
interface DotScales {
  readonly plot: Rect;
  readonly x: Scale;
  readonly y: Scale;
  readonly largest: readonly [number, number];
}

/** A series' fit line, dashed and thin, in the series' colour. */
function fitMark(
  input: ModelInput,
  { fit, i }: { readonly fit: FitLineData; readonly i: number },
  scales: DotScales,
): Mark[] {
  const segments = segmentsOf(fit.x, fit.y, scales);
  return segments.length === 0
    ? []
    : [
        {
          baseline: null,
          color: seriesColor(input, i),
          dashed: true,
          kind: "line",
          segments,
          width: fitWidth,
        },
      ];
}

/** The plot and the scales the dots are placed on, both inset by the largest dot, so that a dot at the edge of the
 * range shows whole. */
function dotScales(input: ModelInput, frame: ChartFrameData, content: Content): DotScales {
  const range: readonly [number, number] = [input.height - xAxisHeight, padOf(input)];
  const scale = valueScale(input, [content.yFrom, content.yTo], { range, zero: false });
  const plot = plotFor(input, {
    left: axis("left", scale, { style: columnStyle(input, input.chart.y[0]) }).ticks,
    right: null,
  });
  const largest: readonly [number, number] =
    input.compact === true ? [compactSmallest, compactLargest] : [smallestRadius, largestRadius];
  const inset = Math.min(
    input.chart.size === undefined ? plainRadius : largest[1],
    plot.height * insetShare,
  );
  const across = Math.min(inset, plot.width * insetShare);
  return {
    largest,
    plot,
    x: linearScale([frame.xFrom, frame.xTo], [plot.x + across, plot.x + plot.width - across]),
    y: onto(scale, upward(plot.y + plot.height - inset, plot.y + inset, input.chart.reverse_y)),
  };
}

/** The model of a scatter whose rows the engine sent as dots. */
function pointsModel(input: ModelInput, frame: ChartFrameData, content: Content): ChartModel {
  const visible = content.series
    .map((points, i) => ({ i, points }))
    .filter(({ points }) => !hidden(input, points.label));
  const scales = dotScales(input, frame, content);
  const { plot, x, y } = scales;
  const fits = frame.fits.flatMap((fit, i) =>
    hidden(input, content.series[i]?.label ?? fit.label) ? [] : fitMark(input, { fit, i }, scales),
  );
  const placement = { ...scales, selected: input.selected ?? null };
  const dots = visible.map((shown) => dotsMark(input, shown, placement));
  return {
    empty: visible.every(({ points }) => points.x.length === 0) ? "No data in this range" : null,
    events: [],
    height: input.height,
    indicators: [],
    legend: legendOf(
      input,
      content.series.map((points) => points.label),
      "dot",
    ),
    marks: [...fits, ...dots],
    panes: [],
    plot,
    width: input.width,
    x,
    xTicks: frame.ticks.map((tick) => ({ label: tick.label, px: pixel(x, tick.x) })),
    yAxes: [axis("left", y, { style: columnStyle(input, input.chart.y[0]) })],
    yLabels: [],
  };
}

export { pointsModel, radiusOf };
