import { Float64, Int32, Utf8, makeData } from "apache-arrow";
import { describe, expect, test } from "vite-plus/test";

import { engineLayout } from "#chart/engine-layout.ts";
import {
  categoriesOf,
  computedPart,
  drawsGroups,
  groupsProblem,
  rowsPart,
  shapeOf,
  withGroupsFromXY,
  withPieLimit,
} from "#chart/source.ts";
import { decodeFrame } from "#frame/frame.ts";
import { parseLayout } from "#layout/layout.ts";

import { column, floats, frameMessage, text } from "./arrow.ts";
import type { Column } from "./arrow.ts";

const candles = parseLayout({
  chart: {
    indicators: [{ kind: "sma" }, { kind: "rsi" }],
    kind: "candlestick",
    ohlc: { close: "c", high: "h", low: "l", open: "o" },
    x: "date",
  },
  dataset: "prices",
});
const candleChart = candles.chart ?? parseLayout({ chart: { kind: "line" } }).chart;

describe(shapeOf, () => {
  test("changes when the indicators or volume change, so an old frame's lines never meet a new list", () => {
    // A frame names its indicator lines by their place in the list: after this change its line 0 would read as the RSI.
    const fewer = {
      ...candles,
      chart: candleChart && { ...candleChart, indicators: candleChart.indicators.slice(1) },
    };
    const volume = { ...candles, chart: candleChart && { ...candleChart, volume: "volume" } };
    expect([shapeOf(fewer), shapeOf(volume)].includes(shapeOf(candles))).toBe(false);
  });

  test("and what the engine computes stay the same when the chart is only zoomed or a series hidden", () => {
    const zoomed = {
      ...candles,
      chart: candleChart && { ...candleChart, hidden: ["SMA 20"], range: { from: 1, to: 2 } },
    };
    expect([computedPart(zoomed), shapeOf(zoomed)]).toStrictEqual([
      computedPart(candles),
      shapeOf(candles),
    ]);
  });
});

describe(rowsPart, () => {
  test("changes with the filters and the series, not with the indicators", () => {
    const filtered = {
      ...candles,
      filters: [{ column: "ticker", columns: [], op: "eq" as const, value: "NV", values: [] }],
    };
    const indicated = { ...candles, chart: candleChart && { ...candleChart, indicators: [] } };
    expect([
      rowsPart(filtered) === rowsPart(candles),
      rowsPart(indicated) === rowsPart(candles),
    ]).toStrictEqual([false, true]);
  });
});

describe(withPieLimit, () => {
  const pie = parseLayout({
    chart: { kind: "pie" },
    dataset: "book",
    group_by: ["sector"],
    measures: [{ aggregate: "sum", column: "mv" }],
  });

  test("has the engine put a pie's groups past the seventh in one Other slice", () => {
    // The top-N's field is `n`, a name too short for this repo's lint, so the expected value is written as JSON.
    const expected: unknown = JSON.parse(
      '{ "largest": true, "measure": 0, "n": 7, "other": true }',
    );
    expect(withPieLimit(pie)?.top_n).toStrictEqual(expected);
  });

  test("leaves a pie with a top-N of its own, and other kinds, as they are", () => {
    const own = parseLayout({ ...pie, top_n: JSON.parse('{ "n": 3, "measure": 0 }') as unknown });
    const bars = { ...pie, chart: pie.chart && { ...pie.chart, kind: "bar" as const } };
    expect([
      withPieLimit(own) === own,
      withPieLimit(bars) === bars,
      withPieLimit(null),
    ]).toStrictEqual([true, true, null]);
  });
});

describe(drawsGroups, () => {
  test("is true for bars, heatmaps, pies and waterfalls, which draw the grouped view, and false for what the engine reduces", () => {
    const kinds = ["bar", "heatmap", "pie", "waterfall", "line", "candlestick", "scatter"] as const;
    expect(kinds.map((kind) => drawsGroups(parseLayout({ chart: { kind } })))).toStrictEqual([
      true,
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});

/** A grouped view's tree columns: the grand total, then a group per label, the last of them "Other". */
function tree(labels: readonly string[]): readonly Column[] {
  const kinds = ["total", ...labels.map((label) => (label === "Other" ? "other" : "group"))];
  const depths = new Int32Array([0, ...labels.map(() => 1)]);
  return [
    column(
      { name: "__depth", role: "depth", type: new Int32() },
      makeData({ data: depths, length: depths.length, type: new Int32() }),
    ),
    column({ name: "__kind", role: "kind", type: new Utf8() }, text(kinds)),
    column({ name: "__expanded", role: "expanded", type: new Utf8() }, text(kinds.map(() => ""))),
    column({ name: "__label", role: "label", type: new Utf8() }, text(["Total", ...labels])),
    column({ name: "sector", role: "group", type: new Utf8() }, text(["", ...labels]), {
      "parallax.level": "0",
    }),
  ];
}

/** A data column of a grouped view: its values and text, titled, and under a column pivot's value if `split` is set. */
function measure(
  index: number,
  {
    title,
    values,
    split,
  }: { readonly title: string; readonly values: readonly number[]; readonly split?: string },
): readonly Column[] {
  const place = { "parallax.index": String(index) };
  const pivot = split === undefined ? {} : { "parallax.split": JSON.stringify([split]) };
  return [
    column({ name: title, role: "value", type: new Float64() }, floats(values), {
      ...place,
      ...pivot,
      "parallax.title": title,
    }),
    column(
      { name: `${title}#text`, role: "text", type: new Utf8() },
      text(values.map(String)),
      place,
    ),
  ];
}

describe(categoriesOf, () => {
  test("reads the top-level groups, their keys, which is Other, and a series per measure with its total's text and value", () => {
    const frame = decodeFrame(
      frameMessage(
        [
          ...tree(["Rates", "Credit", "Other"]),
          ...measure(0, { title: "sum(mv)", values: [60, 30, 20, 10] }),
        ],
        4,
      ),
    );
    expect(categoriesOf(frame)).toStrictEqual({
      categories: ["Rates", "Credit", "Other"],
      keys: ["Rates", "Credit", "Other"],
      others: [false, false, true],
      series: [
        {
          label: "sum(mv)",
          texts: ["30", "20", "10"],
          total: "60",
          totalValue: 60,
          values: [30, 20, 10],
        },
      ],
    });
  });

  test("names a column pivot's series by their pivot values when they share one measure", () => {
    const frame = decodeFrame(
      frameMessage(
        [
          ...tree(["Rates"]),
          ...measure(0, { split: "Bond", title: "Bond | sum(mv)", values: [5, 5] }),
          ...measure(1, { split: "Equity", title: "Equity | sum(mv)", values: [7, 7] }),
        ],
        2,
      ),
    );
    expect(categoriesOf(frame).series.map((series) => series.label)).toStrictEqual([
      "Bond",
      "Equity",
    ]);
  });
});

/** The shape of a frame's layout, as the scene reads it back from what the view sent. */
function sentShape(layout: Parameters<typeof engineLayout>[0]): string {
  const sent = structuredClone(engineLayout(layout));
  return shapeOf(parseLayout(sent));
}

describe("what the engine is sent for a chart", () => {
  const charts = [
    { chart: { kind: "waterfall" as const }, group_by: ["factor"] },
    { chart: { kind: "pie" as const }, group_by: ["sector"] },
    { chart: { kind: "bar" as const, stacked: true }, group_by: ["sector"] },
    { chart: { kind: "line" as const, x: "date", y: ["close"] } },
  ];

  test("has the shape of the chart's own layout, so the chart takes the frames it answers with", () => {
    for (const given of charts) {
      const layout = parseLayout({
        ...given,
        dataset: "book",
        measures: [{ aggregate: "sum", column: "pnl" }],
      });
      expect(sentShape(layout), layout.chart?.kind).toBe(shapeOf(layout));
    }
    const xy = withGroupsFromXY(
      parseLayout({ chart: { kind: "bar", x: "sector", y: ["dv01"] }, dataset: "bonds" }),
    );
    expect(sentShape(xy)).toBe(shapeOf(xy));
  });
});

describe(withGroupsFromXY, () => {
  test("groups a bar chart given as x and y by x, sums each y, and splits it by its series", () => {
    const layout = withGroupsFromXY(
      parseLayout({ chart: { kind: "bar", series: "side", x: "category", y: ["value", "cost"] } }),
    );
    expect([layout.group_by, layout.split_by]).toStrictEqual([["category"], ["side"]]);
    expect(layout.measures.map((entry) => [entry.aggregate, entry.column])).toStrictEqual([
      ["sum", "value"],
      ["sum", "cost"],
    ]);
    expect(groupsProblem(layout)).toBeNull();
  });

  test("leaves a layout that groups, a reduced kind, and a chart without x or y as they are", () => {
    const grouped = parseLayout({
      chart: { kind: "bar", x: "category", y: ["value"] },
      group_by: ["sector"],
      measures: [{ aggregate: "count_all" }],
    });
    const line = parseLayout({ chart: { kind: "line", x: "date", y: ["close"] } });
    const bare = parseLayout({ chart: { kind: "bar" } });
    expect(
      [grouped, line, bare].map((layout) => withGroupsFromXY(layout) === layout),
    ).toStrictEqual([true, true, true]);
  });

  test("says what a grouped chart lacks, and how to give it", () => {
    expect(groupsProblem(parseLayout({ chart: { kind: "bar" } }))).toBe(
      "A bar chart draws groups: give its layout group_by and measures, or its chart an x column and y columns.",
    );
    expect(groupsProblem(parseLayout({ chart: { kind: "pie" }, group_by: ["sector"] }))).toBe(
      'A pie chart draws its groups\' measures: give its layout measures, such as { aggregate: "sum", column }.',
    );
    expect(groupsProblem(parseLayout({ chart: { kind: "line", x: "date" } }))).toBeNull();
  });
});
