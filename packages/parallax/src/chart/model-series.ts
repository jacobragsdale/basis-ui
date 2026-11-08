/* The draw model of a line or area chart: each series' line on the left or right axis, an area's wash down to its
 * baseline, the indicators over the price, and the events along its bottom. */

import type { ChartContent, ChartFrameData, SeriesData } from "#frame/chart-data.ts";

import { indicatorStyles } from "./indicators.ts";
import type { ChartModel, Mark, ModelInput, Rect, Scale } from "./model-types.ts";
import { eventMarks, legendWithOverlays, overlayMarks, overlayValues } from "./model-overlays.ts";
import {
  axis,
  columnStyle,
  hidden,
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

/** A series' line width. */
const lineWidth = 2;

/** A series shown, and its place among all the series, which picks its colour. */
interface Visible {
  readonly series: SeriesData;
  readonly i: number;
}

/** The plot of a line chart, and its value scales. */
interface LineAxes {
  readonly plot: Rect;
  readonly left: Scale;
  readonly right: Scale | null;
  /** "%" on a comparison, whose values are percentage changes. */
  readonly percent: string;
}

/** The plot and the left and right scales, fitted to the series shown and, on the left, to the overlays `over`. */
function lineAxes(
  input: ModelInput,
  visible: readonly Visible[],
  over: readonly number[],
): LineAxes {
  const values = (right: boolean): number[] => {
    const all: number[] = [];
    for (const { series } of visible) {
      if (series.right === right) {
        all.push(...series.y);
      }
    }
    return right ? all : [...all, ...over];
  };
  const area = input.chart.kind === "area";
  const range: readonly [number, number] = [input.height - xAxisHeight, padOf(input)];
  const leftScale = valueScale(input, values(false), { range, zero: area });
  const hasRight = visible.some(({ series }) => series.right);
  const rightScale = hasRight ? valueScale(input, values(true), { range, zero: area }) : null;
  // The gutters fit the labels as shown, a comparison's "%" included.
  const percent = input.chart.compare ? "%" : "";
  const plot = plotFor(input, {
    left: axis("left", leftScale, { style: columnStyle(input, input.chart.y[0]), suffix: percent })
      .ticks,
    right:
      rightScale === null
        ? null
        : axis("right", rightScale, {
            style: columnStyle(input, input.chart.y_right[0]),
            suffix: percent,
          }).ticks,
  });
  const [bottom, top] = [plot.y + plot.height, plot.y];
  return {
    left: onto(leftScale, upward(bottom, top, input.chart.reverse_y)),
    percent,
    plot,
    right:
      rightScale === null
        ? null
        : onto(rightScale, upward(bottom, top, input.chart.reverse_y_right)),
  };
}

/** Each series' line, on its own axis, with an area's baseline. */
function seriesMarks(
  input: ModelInput,
  visible: readonly Visible[],
  axes: LineAxes & { readonly x: Scale },
): Mark[] {
  const { plot, left, right, x } = axes;
  const area = input.chart.kind === "area";
  return visible.flatMap(({ series, i }): Mark[] => {
    const y = series.right && right !== null ? right : left;
    const segments = segmentsOf(series.x, series.y, { x, y });
    const baseline = area
      ? Math.min(plot.y + plot.height, Math.max(plot.y, pixel(y, y.log ? y.domain[0] : 0)))
      : null;
    return segments.length === 0
      ? []
      : [
          {
            baseline,
            color: seriesColor(input, i),
            dashed: false,
            kind: "line",
            segments,
            width: lineWidth,
          },
        ];
  });
}

/** The model of a line or area chart. */
function lineModel(
  input: ModelInput,
  frame: ChartFrameData,
  content: Extract<ChartContent, { kind: "series" }>,
): ChartModel {
  const visible = content.series
    .map((series, i) => ({ i, series }))
    .filter(({ series }) => !hidden(input, series.label));
  const styles = indicatorStyles(input.chart, frame, {
    colors: input.colors,
    muted: input.muted,
    plotted: content.series.length,
  });
  const axes = lineAxes(input, visible, overlayValues(input, frame, styles));
  const { plot, left, right, percent } = axes;
  const x = linearScale([frame.xFrom, frame.xTo], [plot.x, plot.x + plot.width]);
  const shape = input.chart.kind === "area" ? "rect" : "line";
  return {
    empty: content.series.every((series) => series.x.length === 0) ? "No data in this range" : null,
    events: eventMarks(input, frame, x),
    height: input.height,
    indicators: styles,
    legend: legendWithOverlays(
      input,
      content.series.map((series) => series.label),
      { shape, styles },
    ),
    marks: [
      ...seriesMarks(input, visible, { ...axes, x }),
      ...overlayMarks(input, { frame, styles, x, y: left }),
    ],
    panes: [],
    plot,
    width: input.width,
    x,
    xTicks: frame.ticks.map((tick) => ({ label: tick.label, px: pixel(x, tick.x) })),
    // In compare mode the engine sends percentage changes: the axes say so.
    yAxes:
      right === null
        ? [axis("left", left, { style: columnStyle(input, input.chart.y[0]), suffix: percent })]
        : [
            axis("left", left, { style: columnStyle(input, input.chart.y[0]), suffix: percent }),
            axis("right", right, {
              style: columnStyle(input, input.chart.y_right[0]),
              suffix: percent,
            }),
          ],
    yLabels: [],
  };
}

export { lineModel };
