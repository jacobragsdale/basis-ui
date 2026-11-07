/* The draw model of a heatmap of the layout's grouped view: a row per series, a column per group, each cell shaded on
 * the sequential ramp, or on two arms around a neutral middle when its values take both signs. */

import type { ChartColors } from "#theme/charts.ts";

import { categoryAxis, categoryLabels } from "./model-categories.ts";
import type {
  CategoryData,
  CategorySeries,
  ChartModel,
  Mark,
  ModelInput,
  Rect,
} from "./model-types.ts";
import { extent, gap, hidden, padOf, rampColor } from "./model-shared.ts";

/** The most of the chart's width the rows' labels may take. */
const labelShare = 3;

/** The range of a heatmap's values. */
interface Span {
  readonly low: number;
  readonly high: number;
}

/** A heatmap cell's colour: one sequential ramp, or two arms around a neutral middle when values take both signs. */
function heatColor(colors: ChartColors, value: number, { low, high }: Span): string {
  if (low < 0 && high > 0) {
    const most = Math.max(-low, high);
    if (value === 0) {
      return colors.middle;
    }
    return rampColor(value > 0 ? colors.ramp : colors.negativeRamp, Math.abs(value) / most);
  }
  if (high <= 0 && low < 0) {
    // Only losses: the negative arm, the deepest darkest.
    return rampColor(colors.negativeRamp, Math.max(Number.EPSILON, value / low));
  }
  const span = high - low;
  return rampColor(colors.ramp, span === 0 ? 1 : Math.max(Number.EPSILON, (value - low) / span));
}

/** Where a heatmap's cells go: its plot, and each cell's size. */
interface Grid {
  readonly plot: Rect;
  readonly cellWidth: number;
  readonly cellHeight: number;
}

/** One row's cells, a cell per group with a value. */
function rowCells(
  input: ModelInput,
  {
    data,
    series,
    row,
  }: { readonly data: CategoryData; readonly series: CategorySeries; readonly row: number },
  { grid, span }: { readonly grid: Grid; readonly span: Span },
): Mark[] {
  const { plot, cellWidth, cellHeight } = grid;
  return data.categories.flatMap((category, c): Mark[] => {
    const value = series.values[c] ?? Number.NaN;
    if (!Number.isFinite(value)) {
      return [];
    }
    const rect = {
      height: Math.max(0, cellHeight - gap),
      width: Math.max(0, cellWidth - gap),
      x: plot.x + c * cellWidth + gap / 2,
      y: plot.y + row * cellHeight + gap / 2,
    };
    const hit = { rows: [{ label: series.label, value: series.texts[c] ?? "" }], title: category };
    return [{ color: heatColor(input.colors, value, span), hit, kind: "cell", rect }];
  });
}

/** The model of a heatmap. */
function heatmapModel(input: ModelInput, data: CategoryData): ChartModel {
  const rows = data.series.filter((series) => !hidden(input, series.label));
  const [low, high] = extent(
    rows.flatMap((series) => series.values),
    false,
  ) ?? [0, 1];
  const widest = Math.max(0, ...rows.map((series) => input.measure(series.label)));
  const labelWidth = Math.min(input.width / labelShare, widest + padOf(input) + 2);
  const width = Math.max(1, input.width - labelWidth - padOf(input));
  const categoryRoom = categoryAxis(input, data.categories, width);
  const plot = {
    height: Math.max(1, input.height - padOf(input) - categoryRoom.height),
    width,
    x: labelWidth,
    y: padOf(input),
  };
  const grid = {
    cellHeight: plot.height / Math.max(1, rows.length),
    cellWidth: plot.width / Math.max(1, data.categories.length),
    plot,
  };
  const marks = rows.flatMap((series, row) =>
    rowCells(input, { data, row, series }, { grid, span: { high, low } }),
  );
  return {
    empty: marks.length === 0 ? "No values to show" : null,
    events: [],
    height: input.height,
    indicators: [],
    legend: [],
    marks,
    panes: [],
    plot,
    width: input.width,
    x: null,
    xLabelRoom: categoryRoom.room,
    xTicks: categoryLabels(
      data.categories,
      (i) => plot.x + (i + 1 / 2) * grid.cellWidth,
      categoryRoom,
    ),
    yAxes: [],
    yLabels: rows.map((series, row) => ({
      label: series.label,
      px: plot.y + (row + 1 / 2) * grid.cellHeight,
    })),
  };
}

export { heatmapModel };
