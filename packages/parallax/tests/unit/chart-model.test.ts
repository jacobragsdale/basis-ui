import { describe, expect, test } from "vite-plus/test";

import { describeChart } from "#chart/describe.ts";
import { bucketTitle } from "#chart/model-candles.ts";
import type { CandleData, ChartContent } from "#frame/chart-data.ts";
import { parseLayout } from "#layout/layout.ts";
import { chartColors } from "#theme/charts.ts";

import { frameOf, marksOf, modelOf, seriesFrame, seriesOf } from "./chart-model-inputs.ts";

const colors = chartColors.light;

const candles: CandleData = {
  close: Float64Array.from([12, 10, Number.NaN]),
  closeText: ["12", "10", null],
  endJson: ["1", "2", "3"],
  from: Float64Array.from([0, 1, 2]),
  high: Float64Array.from([13, 13, 12]),
  highText: ["13", "13", "12"],
  interval: "day",
  low: Float64Array.from([9, 10, 10]),
  lowText: ["9", "10", "10"],
  open: Float64Array.from([10, 12, 11]),
  openText: ["10", "12", "11"],
  to: Float64Array.from([1, 2, 3]),
  volume: null,
  volumeText: null,
  xJson: ["0", "1", "2"],
  xText: ["Mon", "Tue", "Wed"],
};

describe("the draw model of charts the engine reduces", () => {
  test("keeps each series' colour when another is hidden, and breaks lines at gaps", () => {
    const frame = seriesFrame([
      seriesOf("close AAPL", [1, 2, 3]),
      seriesOf("close MSFT", [4, Number.NaN, 6]),
    ]);
    const all = modelOf({ kind: "line" }, { frame });
    const lines = marksOf(all.marks, "line");
    expect(lines.map((line) => line.color)).toStrictEqual([colors.series[0], colors.series[1]]);
    expect(lines[1]?.segments).toHaveLength(2);
    expect(all.legend.map((entry) => entry.shape)).toStrictEqual(["line", "line"]);
    const hidden = modelOf({ hidden: ["close AAPL"], kind: "line" }, { frame });
    expect(marksOf(hidden.marks, "line").map((line) => line.color)).toStrictEqual([
      colors.series[1],
    ]);
    expect(hidden.legend[0]?.hidden).toBe(true);
    // The x ticks the engine labelled sit where the x scale puts them.
    expect(all.xTicks[0]?.px).toBeCloseTo(all.plot.x + all.plot.width / 2);
  });

  test("needs no legend for one series, gives right-axis series their own axis, and fills areas to zero", () => {
    const one = modelOf({ kind: "area" }, { frame: seriesFrame([seriesOf("close", [5, 10])]) });
    expect(one.legend).toStrictEqual([]);
    expect(marksOf(one.marks, "line")[0]?.baseline).toBeCloseTo(one.plot.y + one.plot.height);
    const priced = seriesFrame([
      seriesOf("price", [100, 101]),
      seriesOf("volume", [5e6, 7e6], true),
    ]);
    const two = modelOf({ kind: "line" }, { frame: priced });
    expect(two.yAxes.map((axis) => axis.side)).toStrictEqual(["left", "right"]);
    expect(two.yAxes[1]?.ticks.some((tick) => tick.label.endsWith("M"))).toBe(true);
  });

  test("drops values at or below zero from a log scale", () => {
    const frame = seriesFrame([seriesOf("p", [10, 0, 100, 1000])]);
    const model = modelOf({ kind: "line", log_y: true }, { frame });
    expect(model.yAxes[0]?.scale.log).toBe(true);
    expect(marksOf(model.marks, "line")[0]?.segments.map((run) => run.length / 2)).toStrictEqual([
      1, 2,
    ]);
  });

  test("draws histogram bins side by side with a surface gap and the engine's edge texts", () => {
    const bins = {
      from: Float64Array.from([0, 5]),
      fromText: ["0.00", "5.00"],
      to: Float64Array.from([5, 10]),
      toText: ["5.00", "10.00"],
    };
    const content: ChartContent = {
      kind: "histogram",
      series: [
        { counts: [3, 0], label: "Long", ...bins },
        { counts: [1, 2], label: "Short", ...bins },
      ],
    };
    const model = modelOf({ kind: "histogram" }, { frame: frameOf(content) });
    const rects = marksOf(model.marks, "rect");
    expect(rects).toHaveLength(3);
    expect(rects[0]?.hit.title).toBe("0.00 to 5.00");
    // Two series share the first bin, each half of it less the gap.
    const shared = (rects[0]?.rect.width ?? 0) + (rects[1]?.rect.width ?? 0);
    expect(shared).toBeCloseTo(model.plot.width / 2 - 2);
    expect(rects.every((rect) => rect.round === "top")).toBe(true);
  });

  test("draws rising candles hollow and falling ones filled, skipping buckets missing a price", () => {
    const frame = frameOf({ candles, kind: "candles" });
    const [up, down, ...rest] = marksOf(
      modelOf({ kind: "candlestick" }, { frame }).marks,
      "candle",
    );
    expect(rest).toStrictEqual([]);
    expect([up?.hollow, up?.color, down?.hollow, down?.color]).toStrictEqual([
      true,
      colors.up,
      false,
      colors.down,
    ]);
    expect(up?.hit.rows.map((row) => row.value)).toStrictEqual(["10", "13", "9", "12"]);
    expect(up?.width).toBeLessThanOrEqual(24);
    const bars = marksOf(modelOf({ kind: "ohlc" }, { frame }).marks, "candle");
    expect(bars.every((candle) => candle.bars)).toBe(true);
  });

  test("shades a density by the logarithm of its counts, the busiest cell darkest", () => {
    const content: ChartContent = {
      columns: 2,
      counts: Uint32Array.from([1, 1000]),
      kind: "density",
      rows: 1,
      yFrom: 0,
      yTo: 1,
    };
    const model = modelOf({ kind: "scatter" }, { frame: frameOf(content) });
    expect(marksOf(model.marks, "cell").map((cell) => cell.color)).toStrictEqual([
      colors.ramp[0],
      colors.ramp.at(-1),
    ]);
  });

  test("handles a density as large as a 4K plot", () => {
    const counts = new Uint32Array(960 * 540);
    counts[7] = 3;
    const content: ChartContent = {
      columns: 960,
      counts,
      kind: "density",
      rows: 540,
      yFrom: 0,
      yTo: 1,
    };
    const model = modelOf({ kind: "scatter" }, { frame: frameOf(content) });
    expect(marksOf(model.marks, "cell")).toHaveLength(1);
  });

  test("says so when a zoomed range holds no points, rather than drawing bare axes", () => {
    const model = modelOf(
      { kind: "line" },
      { frame: seriesFrame([seriesOf("a", []), seriesOf("b", [])]) },
    );
    expect(model.marks).toStrictEqual([]);
    expect(model.empty).toBe("No data in this range");
  });

  test("says when there is nothing to draw yet, or no room to draw it", () => {
    expect(modelOf({ kind: "line" }, {}).empty).toBe("Loading…");
    expect(modelOf({ kind: "line" }, {}, { width: 30 }).empty).toBe("");
  });
});

describe(bucketTitle, () => {
  test("names the period a bucket starts, and a day by its date alone", () => {
    const titles = [
      bucketTitle("day", "2024-06-03"),
      bucketTitle("week", "2024-06-03"),
      bucketTitle("month", "2024-06-01"),
      bucketTitle("5m", "2024-06-03 09:30"),
      bucketTitle("1m", "09:30"),
      bucketTitle("2y", "2020-01-01"),
    ];
    expect(titles).toStrictEqual([
      "2024-06-03",
      "Week of 2024-06-03",
      "Month of 2024-06-01",
      "5 minutes from 2024-06-03 09:30",
      "1 minute from 09:30",
      "2 years from 2020-01-01",
    ]);
  });
});

describe(describeChart, () => {
  const bars = {
    dataset: "positions",
    group_by: ["sector"],
    measures: [{ aggregate: "sum" as const, column: "market_value_usd" }],
    split_by: ["asset_class"],
  };

  test("names a grouped chart's kind and shape, what it groups and splits by, and the dataset", () => {
    const charts = [
      { kind: "bar", stacked: true },
      { horizontal: true, kind: "bar" },
      { horizontal: true, kind: "bar", stacked: true },
      { kind: "heatmap" },
    ] as const;
    expect(charts.map((chart) => describeChart(parseLayout({ ...bars, chart })))).toStrictEqual([
      "Stacked bar chart of sector by asset_class from positions",
      "Horizontal bar chart of sector by asset_class from positions",
      "Stacked horizontal bar chart of sector by asset_class from positions",
      "Heatmap of sector by asset_class from positions",
    ]);
    const plain = parseLayout({ ...bars, chart: { kind: "bar" }, split_by: [] });
    expect(describeChart(plain)).toBe("Bar chart of sector from positions");
  });

  test("names a reduced chart by what it plots and its series, or by its x, and a pie by its hole", () => {
    const lines = {
      kind: "line",
      series: "ticker",
      x: "date",
      y: ["close"],
      y_right: ["volume"],
    } as const;
    const candlesticks = { kind: "candlestick", x: "date" } as const;
    expect(describeChart(parseLayout({ chart: lines, dataset: "prices" }))).toBe(
      "Line chart of close, volume by ticker from prices",
    );
    expect(describeChart(parseLayout({ chart: candlesticks, dataset: "prices" }))).toBe(
      "Candlestick chart of date from prices",
    );
    const pie = parseLayout({
      chart: { kind: "pie" },
      dataset: "positions",
      group_by: ["asset_class"],
    });
    expect(describeChart(pie)).toBe("Donut chart of asset_class from positions");
  });
});
