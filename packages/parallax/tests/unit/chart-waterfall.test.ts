import { describe, expect, test } from "vite-plus/test";

import type { CategoryData, ChartModel, LineMark, RectMark } from "#chart/model-types.ts";
import { smallLayout } from "#chart/small-data.ts";
import { smallTable, tableContent } from "#chart/small-table.ts";
import { drawsGroups, withWaterfallRun } from "#chart/source.ts";
import { parseLayout } from "#layout/layout.ts";
import { chartColors } from "#theme/charts.ts";

import { marksOf, modelOf, muted } from "./chart-model-inputs.ts";

const colors = chartColors.light;

/** A P&L explain: each factor's P&L, the engine's running total of it, and the grand total. */
function explain(
  steps: readonly (readonly [string, number])[],
  { total, runs }: { readonly total?: number; readonly runs?: readonly number[] } = {},
): CategoryData {
  let level = 0;
  const running =
    runs ??
    steps.map(([, value]) => {
      level += value;
      return level;
    });
  const sum = total ?? running.at(-1) ?? 0;
  return {
    categories: steps.map(([factor]) => factor),
    keys: steps.map(([factor]) => factor),
    others: steps.map(([factor]) => factor === "Other"),
    series: [
      {
        label: "sum(pnl)",
        texts: steps.map(([, value]) => String(value)),
        total: String(sum),
        totalValue: sum,
        values: steps.map(([, value]) => value),
      },
      {
        label: "sum(pnl) running total",
        texts: running.map(String),
        total: String(sum),
        totalValue: sum,
        values: running,
      },
    ],
  };
}

const factors = explain([
  ["Carry", 40],
  ["Curve", -70],
  ["Spread", 20],
  ["Other", 5],
]);

/** A waterfall's model over `data`, and its bars and lines. */
interface Drawn {
  readonly model: ChartModel;
  readonly rects: readonly RectMark[];
  readonly lines: readonly LineMark[];
}

/** The marks of a waterfall over `data`, and its model. */
function waterfall(data: CategoryData, changes: Parameters<typeof modelOf>[2] = {}): Drawn {
  const model = modelOf({ kind: "waterfall" }, { categories: data }, changes);
  return { lines: marksOf(model.marks, "line"), model, rects: marksOf(model.marks, "rect") };
}

/** The titles of the bars a waterfall of `factors` draws with the legend's `hidden` kinds left out. */
function shownWith(hidden: readonly string[]): readonly string[] {
  const { marks } = modelOf({ hidden: [...hidden], kind: "waterfall" }, { categories: factors });
  return marksOf(marks, "rect").map((rect) => rect.hit.title);
}

describe("the draw model of waterfalls", () => {
  test("floats each step from the running total before it to its own, and ends on a total bar from zero", () => {
    const { model, rects } = waterfall(factors);
    const scale = model.yAxes[0]?.scale;
    if (scale === undefined) {
      throw new Error("no value axis");
    }
    const spans = rects.map(({ rect }) => [
      Math.round(scale.invert(rect.y + rect.height)),
      Math.round(scale.invert(rect.y)),
    ]);
    expect(spans).toStrictEqual([
      [0, 40],
      [-30, 40],
      [-30, -10],
      [-10, -5],
      [-5, 0],
    ]);
    expect(model.xTicks.map((tick) => tick.label)).toStrictEqual([
      "Carry",
      "Curve",
      "Spread",
      "Other",
      "Total",
    ]);
  });

  test("colours rising steps up and falling ones down, and the total in the first series' colour", () => {
    const { rects } = waterfall(factors);
    expect(rects.map((rect) => rect.color)).toStrictEqual([
      colors.up,
      colors.down,
      colors.up,
      colors.up,
      colors.series[0],
    ]);
    expect(rects.map((rect) => rect.round)).toStrictEqual([
      "top",
      "bottom",
      "top",
      "top",
      "bottom",
    ]);
  });

  test("labels each step and the total with the engine's text, and lists the running total in the tooltip", () => {
    const { rects } = waterfall(factors);
    expect(rects.map((rect) => rect.label?.text)).toStrictEqual(["40", "-70", "20", "5", "-5"]);
    expect(rects[1]?.hit).toStrictEqual({
      rows: [
        { label: "sum(pnl)", value: "-70" },
        { label: "sum(pnl) running total", value: "-30" },
      ],
      title: "Curve",
    });
    expect(waterfall(factors).model.legend.map((entry) => entry.label)).toStrictEqual([
      "Increase",
      "Decrease",
      "Total",
    ]);
  });

  test("joins each bar's end to the next one's start at the running total between them", () => {
    const { model, lines } = waterfall(factors);
    const [joins] = lines;
    const scale = model.yAxes[0]?.scale;
    expect([joins?.color, joins?.segments.length]).toStrictEqual([muted, 4]);
    const levels = joins?.segments.map((segment) =>
      Math.round(scale?.invert(segment[1] ?? 0) ?? Number.NaN),
    );
    expect(levels).toStrictEqual([40, -30, -10, -5]);
    // Each join runs level from one bar's right edge to the next one's left.
    const rects = marksOf(model.marks, "rect");
    const first = joins?.segments[0];
    expect(first?.[0]).toBeCloseTo((rects[0]?.rect.x ?? 0) + (rects[0]?.rect.width ?? 0));
    expect(first?.[2]).toBeCloseTo(rects[1]?.rect.x ?? 0);
  });

  test("selects a factor by its group, but not Other or the total, and dims the rest", () => {
    const { rects } = waterfall(factors, { selected: "Curve" });
    expect(rects.map((rect) => rect.category)).toStrictEqual([0, 1, 2, undefined, undefined]);
    expect(rects.map((rect) => rect.dim)).toStrictEqual([true, false, true, true, true]);
  });

  test("skips a group with no value and carries the level across it", () => {
    const blank = explain(
      [
        ["Carry", 40],
        ["FX", Number.NaN],
        ["Curve", -70],
      ],
      { runs: [40, 40, -30] },
    );
    const { rects, lines } = waterfall(blank);
    expect(rects.map((rect) => rect.hit.title)).toStrictEqual(["Carry", "Curve", "Total"]);
    expect(lines[0]?.segments).toHaveLength(3);
  });

  test("leaves out the kinds of bar the legend hides", () => {
    expect(shownWith(["Decrease", "Total"])).toStrictEqual(["Carry", "Spread", "Other"]);
    expect(shownWith(["Increase"])).toStrictEqual(["Curve", "Total"]);
  });

  test("refuses steps that don't reach the total, as when an aggregate filter hides a group", () => {
    const hiddenGroup = explain(
      [
        ["Carry", 40],
        ["Spread", 20],
      ],
      { total: -10 },
    );
    expect(waterfall(hiddenGroup).model.empty).toBe(
      "A waterfall's steps don't reach its total: show every group, or keep the rest as Other",
    );
  });

  test("refuses to run on past a running total that is no number, such as one across currencies", () => {
    const mixed = explain(
      [
        ["Carry", 40],
        ["FX", 3],
      ],
      { runs: [40, Number.NaN], total: Number.NaN },
    );
    const [first, runs] = mixed.series;
    const series =
      first === undefined || runs === undefined ? [] : [first, { ...runs, texts: ["40", "mixed"] }];
    expect(waterfall({ ...mixed, series }).model.empty).toBe(
      "A waterfall can't run on past FX: its running total is mixed",
    );
  });
});

describe(withWaterfallRun, () => {
  const layout = parseLayout({
    chart: { kind: "waterfall" },
    dataset: "attribution",
    group_by: ["factor"],
    measures: [
      { aggregate: "sum", column: "pnl_usd", show_as: "percent_of_grand_total" },
      { aggregate: "count_all" },
    ],
  });

  test("has the engine compute the first measure's value and its running total, and nothing else", () => {
    const measures = withWaterfallRun(layout).measures.map((measure) => [
      measure.aggregate,
      measure.column,
      measure.show_as,
    ]);
    expect(measures).toStrictEqual([
      ["sum", "pnl_usd", "value"],
      ["sum", "pnl_usd", "running_total"],
    ]);
  });

  test("leaves other kinds, and a waterfall without measures, as they are", () => {
    const bars = { ...layout, chart: layout.chart && { ...layout.chart, kind: "bar" as const } };
    const empty = { ...layout, measures: [] };
    expect([withWaterfallRun(bars) === bars, withWaterfallRun(empty) === empty]).toStrictEqual([
      true,
      true,
    ]);
    expect(drawsGroups(layout)).toBe(true);
  });
});

describe("a small waterfall", () => {
  test("steps in the order its rows give the factors, which the engine sums its running totals in", () => {
    const rows = [
      { factor: "Carry", pnl: 4 },
      { factor: "Curve", pnl: -7 },
      { factor: "Carry", pnl: 1 },
      { factor: "Basis", pnl: 2 },
    ];
    const table = smallTable(tableContent(rows, ["factor", "pnl"]));
    const layout = smallLayout({ kind: "waterfall", x: "factor", y: "pnl" }, {}, table);
    expect([layout.orders, layout.group_by]).toStrictEqual([
      { factor: { values: ["Carry", "Curve", "Basis"] } },
      ["factor"],
    ]);
    // Days, as numbers or as YYYY-MM-DD text, sort as themselves, and take no order the engine would refuse.
    const numbered = smallTable(tableContent([{ day: 1, pnl: 2 }], ["day", "pnl"]));
    const dated = smallTable(tableContent([{ day: "2026-11-12", pnl: 2 }], ["day", "pnl"]));
    for (const days of [numbered, dated]) {
      expect(
        smallLayout({ kind: "waterfall", x: "day", y: "pnl" }, {}, days).orders,
      ).toBeUndefined();
    }
    const bars = smallLayout({ kind: "bar", x: "factor", y: "pnl" }, {}, table);
    expect(bars.orders).toBeUndefined();
  });
});
