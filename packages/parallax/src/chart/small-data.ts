/* The small-data form of `<Chart>`: rows the page already holds, such as ten sectors' exposure, made into an Arrow
 * table here, so a small chart needs no load of its own. Each column takes its type from its values: numbers become
 * doubles, `YYYY-MM-DD` strings dates, other strings text, booleans booleans; null is a missing value. */

import { Bool, DateDay, Float64, Table, Utf8, tableToIPC, vectorFromArray } from "apache-arrow";
import type { Vector } from "apache-arrow";

import type { LayoutChart } from "#layout/chart.ts";
import type { LayoutInput, LayoutScalar } from "#layout/layout.ts";

import type { CategoryData } from "./model-types.ts";

/** A value of a small-data row. */
type ChartValue = string | number | boolean | null;

/** A small-data row: a value per column. */
type ChartRow = Readonly<Record<string, ChartValue>>;

/** A chart's settings beyond its kind and columns, such as `stacked`, `horizontal`, `donut` or `log_y`. */
type ChartSettings = Omit<NonNullable<LayoutInput["chart"]>, "kind" | "x" | "y" | "series">;

/** What a small chart draws: its kind, its x column, its y column or columns, and a column that splits it. */
interface SmallChart {
  readonly kind: LayoutChart["kind"];
  readonly x: string;
  readonly y: string | readonly string[];
  readonly series?: string;
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/u;

/** The kinds that draw the layout's grouped view, whose x groups the rows. */
const groupedKinds: ReadonlySet<LayoutChart["kind"]> = new Set(["bar", "heatmap", "pie"]);

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

/** A column's values as an Arrow vector of the type they share. */
function vectorOf(name: string, values: readonly ChartValue[]): Vector {
  const present = values.filter((value) => value !== null);
  if (present.every((value) => typeof value === "number")) {
    return vectorFromArray(values, new Float64());
  }
  if (present.every((value) => typeof value === "boolean")) {
    return vectorFromArray(values, new Bool());
  }
  if (present.every((value) => typeof value === "string")) {
    return present.every((value) => isoDate.test(value))
      ? vectorFromArray(
          values.map((value) => (value === null ? null : new Date(`${String(value)}T00:00:00Z`))),
          new DateDay(),
        )
      : vectorFromArray(values, new Utf8());
  }
  throw new TypeError(
    `Column ${name} mixes numbers, text and booleans; give each of a chart's columns one kind of value.`,
  );
}

/** The rows' chart columns as an Arrow IPC stream. */
function rowsToArrow(
  rows: readonly ChartRow[],
  chart: SmallChart,
  settings: ChartSettings = {},
): ArrayBuffer {
  const vectors = Object.fromEntries(
    columnsOf(chart, settings).map((name) => [
      name,
      vectorOf(
        name,
        rows.map((row) => row[name] ?? null),
      ),
    ]),
  );
  return new Uint8Array(tableToIPC(new Table(vectors), "stream")).buffer;
}

/** How many small tables' bytes are kept, so that rows built afresh with the same content load once. */
const keptTables = 64;
const tables = new Map<string, ArrayBuffer>();

/** The rows' chart columns as an Arrow IPC stream: the same bytes for rows of the same content, so that a page that
 * builds its rows afresh each render loads them once. */
function smallBytes(
  rows: readonly ChartRow[],
  chart: SmallChart,
  settings: ChartSettings = {},
): ArrayBuffer {
  const content = JSON.stringify([rows, columnsOf(chart, settings)]);
  const kept = tables.get(content);
  if (kept !== undefined) {
    return kept;
  }
  const bytes = rowsToArrow(rows, chart, settings);
  const [oldest] = tables.keys();
  if (tables.size >= keptTables && oldest !== undefined) {
    tables.delete(oldest);
  }
  tables.set(content, bytes);
  return bytes;
}

/** The layout a small chart draws: grouped kinds sum each y by x, split by `series`; the others plot x against y. */
function smallLayout(chart: SmallChart, options: ChartSettings = {}): LayoutInput {
  const ys = typeof chart.y === "string" ? [chart.y] : [...chart.y];
  const split = chart.series === undefined ? [] : [chart.series];
  if (groupedKinds.has(chart.kind)) {
    return {
      chart: { ...options, kind: chart.kind },
      group_by: [chart.x],
      measures: ys.map((column) => ({ aggregate: "sum", column })),
      split_by: split,
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
function rowOrder(rows: readonly ChartRow[], x: string): (data: CategoryData) => CategoryData {
  const firstSeen = new Map<LayoutScalar, number>();
  for (const [index, row] of rows.entries()) {
    const key = row[x] ?? null;
    if (!firstSeen.has(key)) {
      firstSeen.set(key, index);
    }
  }
  return (data) => {
    const rank = (group: number): number =>
      data.others[group] === true
        ? Number.POSITIVE_INFINITY
        : (firstSeen.get(data.keys[group] ?? null) ?? rows.length);
    const order = data.categories
      .map((_category, group) => group)
      .toSorted((first, second) => rank(first) - rank(second));
    return {
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

export { groupedKinds, rowOrder, rowsToArrow, smallBytes, smallLayout };
export type { ChartRow, ChartSettings, ChartValue, SmallChart };
