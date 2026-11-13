/* The data side of a chart, as pure functions of its layout and frames: which kinds draw the layout's grouped view and
 * which the engine reduces, the layout as the engine computes it, the parts of it whose change means other rows or
 * data of another shape, and a grouped frame's groups as a bar chart, heatmap, pie or waterfall draws them.
 *
 * Bar charts, heatmaps, pies and waterfalls draw the layout's grouped view, so they ask for its first rows like a pivot; the
 * engine reduces the other kinds to the plot's pixels. Changing only how a chart is drawn, such as hidden series or
 * the scale, changes nothing the engine computes. */

import { pathValue } from "#format.ts";
import type { CellValue } from "#frame/cell.ts";
import type { FrameColumn } from "#frame/columns.ts";
import type { FrameData } from "#frame/frame.ts";
import { groupedKinds } from "#layout/chart.ts";
import { parseLayout } from "#layout/layout.ts";
import type { Layout } from "#layout/layout.ts";

import { unreadOf } from "./group-limits.ts";
import type { CategoryData, CategorySeries } from "./model-types.ts";

/** The most slices a pie draws; past them, the engine's top-N puts the rest in one "Other" slice. */
const pieSlices = 7;

/** A decimal's unscaled digits are in tens. */
const decimalBase = 10;

/** How a column pivot's value and measure are joined in a column's title. */
const titleJoin = " | ";

/** Whether a layout's chart draws its grouped view rather than a reduction. */
function drawsGroups(layout: Layout): boolean {
  const kind = layout.chart?.kind;
  return kind !== undefined && groupedKinds.has(kind);
}

/**
 * A chart of the grouped view given as `x` and `y`, as the small-data form takes it, as the grouped view it draws:
 * grouped by `x`, each `y` summed, split by `series`. A layout that groups or has measures of its own is left as it is.
 * The result is read as a layout is, so that it is written as the engine's answer to it is read back.
 */
function withGroupsFromXY(layout: Layout): Layout {
  const { chart } = layout;
  if (
    chart === null ||
    !groupedKinds.has(chart.kind) ||
    layout.group_by.length > 0 ||
    layout.measures.length > 0 ||
    chart.x === "" ||
    chart.y.length === 0
  ) {
    return layout;
  }
  return parseLayout({
    ...layout,
    group_by: [chart.x],
    measures: chart.y.map((column) => ({ aggregate: "sum", column })),
    split_by: chart.series === null ? layout.split_by : [chart.series],
  });
}

/** What a chart that draws its grouped view lacks, said with the fix, or null when it lacks nothing. */
function groupsProblem(layout: Layout): string | null {
  const kind = layout.chart?.kind;
  if (kind === undefined || !groupedKinds.has(kind)) {
    return null;
  }
  if (layout.group_by.length === 0) {
    return `A ${kind} chart draws groups: give its layout group_by and measures, or its chart an x column and y columns.`;
  }
  return layout.measures.length === 0
    ? `A ${kind} chart draws its groups' measures: give its layout measures, such as { aggregate: "sum", column }.`
    : null;
}

/**
 * A layout as the engine computes a waterfall from it: its first measure's value, and the engine's running total of
 * it among the groups in their order, from which each step floats. Its other measures are not drawn.
 */
function withWaterfallRun(layout: Layout): Layout {
  const [first] = layout.measures;
  if (layout.chart?.kind !== "waterfall" || first === undefined) {
    return layout;
  }
  return {
    ...layout,
    measures: [
      { ...first, show_as: "value" },
      { ...first, show_as: "running_total" },
    ],
  };
}

/**
 * A layout as the engine computes its chart: a pie past seven groups puts the rest in one "Other" slice, which the
 * engine totals, unless the layout sets a top-N of its own.
 */
function withPieLimit(layout: Layout | null): Layout | null {
  if (layout?.chart?.kind !== "pie" || layout.top_n !== null || layout.measures.length === 0) {
    return layout;
  }
  return {
    ...layout,
    top_n: {
      largest: true,
      measure: 0,
      // oxlint-disable-next-line eslint/id-length -- `n` is the layout's JSON field, as parallax-protocol's Rust names it.
      n: pieSlices,
      other: true,
    },
  };
}

/** The part of a layout the engine computes from: not the zoom, hidden series or scales, which only change drawing. */
function computedPart(layout: Layout): string {
  const chart =
    layout.chart === null
      ? null
      : {
          ...layout.chart,
          hidden: [],
          horizontal: false,
          log_y: false,
          range: null,
          stacked: false,
        };
  return JSON.stringify({ ...layout, chart, column_widths: {} });
}

/** Which rows a chart draws: a brush selects among them, so a change here leaves a brush selecting nothing it shows. */
function rowsPart(layout: Layout): string {
  const { chart } = layout;
  return JSON.stringify([
    layout.dataset,
    layout.parameters,
    layout.filters,
    chart?.kind,
    chart?.x,
    chart?.axis,
    chart?.series,
  ]);
}

/**
 * What a frame's data looks like: the chart's kind, the columns it plots and its indicators, whose lines a frame names
 * by their place in the list. It is the same for a layout as for the layout the engine is sent for it, which carries a
 * waterfall's running total, so that the chart takes the frames the engine answers with.
 */
function shapeOf(given: Layout): string {
  const layout = withWaterfallRun(given);
  const { chart } = layout;
  return JSON.stringify(
    chart === null
      ? null
      : [
          chart.kind,
          chart.x,
          chart.y,
          chart.y_right,
          chart.series,
          chart.ohlc,
          chart.indicators,
          chart.volume,
          // A pane's columns and how it draws them; its title and direction change only the drawing.
          (chart.panes ?? []).map((pane) => [pane.columns, pane.kind]),
          layout.group_by,
          layout.split_by,
          layout.measures,
        ],
  );
}

/** A cell's value as a number for drawing; NaN for anything that is not a number. */
function toNumber(value: CellValue): number {
  switch (value.kind) {
    case "number": {
      return value.value;
    }
    case "integer": {
      return Number(value.value);
    }
    case "decimal": {
      // For drawing only: the text shows every digit.
      return Number(value.unscaled) / decimalBase ** value.scale;
    }
    case "null":
    case "text":
    case "boolean":
    case "date":
    case "timestamp": {
      return Number.NaN;
    }
    default: {
      return value satisfies never;
    }
  }
}

/** A grouped frame's top-level groups, other than the grand total, and the grand total's row, if it has one. */
function groupRows(frame: FrameData): {
  readonly rows: readonly number[];
  readonly total: number | null;
} {
  const { tree } = frame;
  const rows: number[] = [];
  let total: number | null = null;
  for (let row = 0; row < frame.rowCount; row += 1) {
    if (tree !== null && tree.depth(row) === 1 && tree.kind(row) !== "total") {
      rows.push(row);
    }
    if (tree?.kind(row) === "total") {
      total = row;
    }
  }
  return { rows, total };
}

/** The part of a column's title before its last ` | `, or from it with `suffix`. */
function titlePart(title: string, suffix: boolean): string {
  const at = title.lastIndexOf(titleJoin);
  return suffix ? title.slice(at) : title.slice(0, at);
}

/** The data columns a chart draws as series: under column pivots, one per pivot value and measure; else every one. */
function seriesColumns(frame: FrameData): {
  readonly columns: readonly FrameColumn[];
  readonly strip: boolean;
} {
  const pivoted = frame.columns.some((column) => column.split !== null);
  const columns = frame.columns.filter((column) => !pivoted || column.split !== null);
  // Under column pivots with one measure, every title ends with the same measure; the pivot values tell the series apart.
  const suffixes = new Set(columns.map((column) => titlePart(column.title, true)));
  const strip =
    pivoted && suffixes.size === 1 && columns.every((column) => column.title.includes(titleJoin));
  return { columns, strip };
}

/** Which measure of `layout` is its first's share of the grand total, as a pie notes beside its slices: the second,
 * of the first's column and aggregate shown as a percentage of the grand total, on a view split by nothing. */
function shareOf(layout: Layout | null): Pick<CategoryData, "share"> {
  const [first, second] = layout?.measures ?? [];
  const share =
    layout !== null &&
    layout.split_by.length === 0 &&
    first !== undefined &&
    second !== undefined &&
    first.show_as === "value" &&
    second.show_as === "percent_of_grand_total" &&
    second.column === first.column &&
    second.aggregate === first.aggregate;
  return share ? { share: 1 } : {};
}

/** A grouped frame's top-level groups and data columns, as a bar chart, heatmap or pie draws them; `layout` says
 * which column is a share. */
function categoriesOf(frame: FrameData, layout: Layout | null = null): CategoryData {
  const { tree } = frame;
  const { rows, total } = groupRows(frame);
  const [key] = frame.groups;
  const { columns, strip } = seriesColumns(frame);
  return {
    categories: rows.map((row) => tree?.label(row) ?? ""),
    keys: rows.map((row) => (key === undefined ? null : pathValue(key.value(row)))),
    others: rows.map((row) => tree?.kind(row) === "other"),
    series: columns.map((column): CategorySeries => ({
      label: strip ? titlePart(column.title, false) : column.title,
      texts: rows.map((row) => column.text(row)),
      total: total === null ? null : column.text(total),
      totalValue: total === null ? Number.NaN : toNumber(column.value(total)),
      values: rows.map((row) => toNumber(column.value(row))),
    })),
    ...unreadOf(frame, rows.length),
    ...shareOf(layout),
  };
}

export {
  categoriesOf,
  computedPart,
  drawsGroups,
  groupsProblem,
  pieSlices,
  rowsPart,
  shapeOf,
  withGroupsFromXY,
  withPieLimit,
  withWaterfallRun,
};
