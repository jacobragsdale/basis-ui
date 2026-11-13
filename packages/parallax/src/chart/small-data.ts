/* The small-data form of `<Chart>`: the layout a small chart draws its table with, the order of its groups, and what
 * its axis cannot take. `small-table.ts` makes the rows into the table. */

import { groupedKinds } from "#layout/chart.ts";
import type { LayoutChart } from "#layout/chart.ts";
import type { LayoutInput, LayoutScalar } from "#layout/layout.ts";

import type { CategoryData } from "./model-types.ts";
import { aChart } from "./source.ts";
import type { ChartValue, SmallTable } from "./small-table.ts";

/** A chart's settings beyond its kind and columns, such as `stacked`, `horizontal`, `donut` or `log_y`. */
type ChartSettings = Omit<NonNullable<LayoutInput["chart"]>, "kind" | "x" | "y" | "series">;

/** What a small chart draws: its kind, its x column, its y column or columns, and a column that splits it. */
interface SmallChart {
  /** What to draw, such as `line`, `bar` or `scatter`, as a layout's `chart.kind` names it. */
  readonly kind: LayoutChart["kind"];
  /** The column along the x axis, or of a bar chart's or a pie's categories. */
  readonly x: string;
  /** The column of values, or the columns, each a series; a grouped chart sums each by `x`. */
  readonly y: string | readonly string[];
  /** The column whose values split the rows into series, each in its own colour. */
  readonly series?: string;
}

/** The kinds that draw the layout's grouped view, whose x groups the rows, and whose groups are put in the rows'
 * order after the engine's: not a waterfall, whose running totals the engine sums in the rows' order itself. */
const reorderedKinds: ReadonlySet<LayoutChart["kind"]> = new Set(["bar", "heatmap", "pie"]);

/** The kinds drawn along an x axis that takes dates, times and numbers, or text only as tenors. */
const axisKinds: ReadonlySet<LayoutChart["kind"]> = new Set([
  "line",
  "area",
  "scatter",
  "histogram",
  "candlestick",
  "ohlc",
]);

/** The columns a small chart reads: its x, y and series, and a scatter's size, id, tooltip and fit columns. */
function columnsOf(chart: SmallChart, settings: ChartSettings = {}): readonly string[] {
  const ys = typeof chart.y === "string" ? [chart.y] : chart.y;
  const dots = [settings.size, settings.id, ...(settings.tooltip ?? []), settings.fit].filter(
    (column) => column !== undefined,
  );
  return [
    ...new Set([chart.x, ...ys, ...(chart.series === undefined ? [] : [chart.series]), ...dots]),
  ];
}

/** Why a small chart cannot draw its table's x column on its axis, with what to change, or null when it can. */
function axisProblem(chart: SmallChart, table: SmallTable, settings: ChartSettings): string | null {
  const textAxis = settings.axis === "tenor";
  if (!axisKinds.has(chart.kind) || table.kinds[chart.x] !== "text" || textAxis) {
    return null;
  }
  return `Column ${chart.x} holds text, and ${aChart(chart.kind).toLowerCase()}'s x axis takes dates, times or numbers: give tenors such as 2Y with settings={{ axis: "tenor" }}, or draw categories as a bar chart`;
}

/** A waterfall's steps in the order its x text first appears in the rows, as an order the engine sums them in. A date,
 * a number or a boolean sorts as itself, and takes no order. */
function rowsOrders(table: SmallTable, x: string): LayoutInput["orders"] {
  const values = [...new Set(table.xValues)];
  const texts = values.filter((value): value is string => typeof value === "string");
  return table.kinds[x] === "text" && texts.length === values.length
    ? { [x]: { values: texts } }
    : undefined;
}

/**
 * The layout a small chart draws: grouped kinds sum each y by x, split by `series`, a waterfall's steps in the order
 * the rows give its x text; the others plot x against y.
 */
function smallLayout(
  chart: SmallChart,
  options: ChartSettings = {},
  table: SmallTable | null = null,
): LayoutInput {
  const ys = typeof chart.y === "string" ? [chart.y] : [...chart.y];
  const split = chart.series === undefined ? [] : [chart.series];
  if (groupedKinds.has(chart.kind)) {
    const orders =
      chart.kind === "waterfall" && table !== null ? rowsOrders(table, chart.x) : undefined;
    return {
      chart: { ...options, kind: chart.kind },
      group_by: [chart.x],
      measures: ys.map((column) => ({ aggregate: "sum", column })),
      split_by: split,
      ...(orders === undefined ? {} : { orders }),
    };
  }
  return {
    chart: {
      ...options,
      kind: chart.kind,
      x: chart.x,
      y: ys,
      ...(chart.series === undefined ? {} : { series: chart.series }),
    },
  };
}

/** `values` in the order `order` gives by index. */
function inOrder<TValue>(values: readonly TValue[], order: readonly number[]): TValue[] {
  return order.flatMap((index) => {
    const value = values[index];
    return value === undefined ? [] : [value];
  });
}

/** Puts a grouped chart's groups in the order their x first appears in the rows, rather than the engine's order by
 * key; "Other", which stands for several, stays last. A frame reports a date's key as its `YYYY-MM-DD` text, as the
 * rows give it. */
function rowOrder(xValues: readonly ChartValue[]): (data: CategoryData) => CategoryData {
  const firstSeen = new Map<LayoutScalar, number>();
  for (const [index, key] of xValues.entries()) {
    if (!firstSeen.has(key)) {
      firstSeen.set(key, index);
    }
  }
  return (data) => {
    const rank = (group: number): number =>
      data.others[group] === true
        ? Number.POSITIVE_INFINITY
        : (firstSeen.get(data.keys[group] ?? null) ?? xValues.length);
    const order = data.categories
      .map((_category, group) => group)
      .toSorted((first, second) => rank(first) - rank(second));
    return {
      ...data,
      categories: inOrder(data.categories, order),
      keys: inOrder(data.keys, order),
      others: inOrder(data.others, order),
      series: data.series.map((series) => ({
        ...series,
        texts: inOrder(series.texts, order),
        values: inOrder(series.values, order),
      })),
    };
  };
}

export { axisProblem, columnsOf, reorderedKinds, rowOrder, smallLayout };
export type { ChartSettings, SmallChart };
