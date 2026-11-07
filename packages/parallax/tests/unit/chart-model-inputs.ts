/* What the draw model's unit tests build models from: a layout's chart, a chart frame, a grouped view's categories,
 * and the model's input around them, at a fixed size, in the light scheme's colours, with every character 6 px wide. */

import { chartModel } from "#chart/model.ts";
import type { CategoryData, ChartModel, Mark, ModelInput } from "#chart/model-types.ts";
import type { ChartContent, ChartFrameData, SeriesData } from "#frame/chart-data.ts";
import type { LayoutChart } from "#layout/chart.ts";
import { parseLayout } from "#layout/layout.ts";
import type { LayoutInput } from "#layout/layout.ts";
import { chartColors } from "#theme/charts.ts";

/** The colour of series past the eighth, and of a pie's "Other". */
const muted = "#999999";
const characterWidth = 6;
const modelWidth = 400;
const modelHeight = 300;
/** The x range a frame shows by default. */
const lastX = 10;
const middleX = 5;

/** A chart as the layout's schema fills it in. */
function chartOf(chart: NonNullable<LayoutInput["chart"]>): LayoutChart {
  const layout = parseLayout({ chart });
  if (layout.chart === null) {
    throw new Error("The layout has no chart.");
  }
  return layout.chart;
}

/** A chart frame of `content` over x from `xFrom` to `xTo`, its only tick in the middle. */
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
    ticks: [{ label: "Mid", x: middleX }],
    viewId: 1,
    xFrom,
    xTo,
  };
}

/** What a model draws: a frame the engine reduced, or a grouped view's categories. */
interface Data {
  readonly frame?: ChartFrameData;
  readonly categories?: CategoryData;
}

/** A model's input for `chart` at 400 by 300 pixels. */
function inputOf(chart: LayoutChart, data: Data): ModelInput {
  return {
    categories: data.categories ?? null,
    chart,
    colors: chartColors.light,
    frame: data.frame ?? null,
    height: modelHeight,
    measure: (text) => text.length * characterWidth,
    muted,
    width: modelWidth,
  };
}

/** A series of points at x 0, 1, 2 and so on, each written as its value. */
function seriesOf(label: string, values: readonly number[], right = false): SeriesData {
  return {
    column: "close",
    label,
    right,
    x: Float64Array.from(values, (_value, i) => i),
    xJson: values.map((_value, i) => String(i)),
    xText: values.map(() => "x"),
    y: Float64Array.from(values),
    yText: values.map(String),
  };
}

/** One series of a grouped view, without a grand total. */
interface GroupSeries {
  readonly label: string;
  readonly values: readonly number[];
  readonly texts: readonly string[];
}

/** Category data with each group keyed by its label, none of them "Other", and no grand total. */
function categoriesOf(categories: readonly string[], series: readonly GroupSeries[]): CategoryData {
  return {
    categories,
    keys: categories,
    others: categories.map(() => false),
    series: series.map((entry) => ({ ...entry, total: null })),
  };
}

/** A frame of line series. */
function seriesFrame(series: readonly SeriesData[]): ChartFrameData {
  return frameOf({ kind: "series", series });
}

/** The model of `chart` over `data`, with `changes` to its input. */
function modelOf(
  chart: NonNullable<LayoutInput["chart"]>,
  data: Data,
  changes: Partial<ModelInput> = {},
): ChartModel {
  return chartModel({ ...inputOf(chartOf(chart), data), ...changes });
}

/** The marks of one kind. */
function marksOf<TKind extends Mark["kind"]>(
  marks: readonly Mark[],
  kind: TKind,
): Extract<Mark, { kind: TKind }>[] {
  return marks.filter((mark): mark is Extract<Mark, { kind: TKind }> => mark.kind === kind);
}

export { categoriesOf, chartOf, frameOf, inputOf, marksOf, modelOf, muted, seriesFrame, seriesOf };
export type { GroupSeries };
