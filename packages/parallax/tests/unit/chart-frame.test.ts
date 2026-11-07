import { describe, expect, test } from "vite-plus/test";

import { decodeChartFrame } from "#frame/chart-frame.ts";

import { batch, chartFrame } from "./chart-arrow.ts";

const twoSeries = [
  { column: "y", label: "a" },
  { column: "y", label: "b" },
];
const points = {
  x: new Float64Array([1, 2]),
  x_json: ["1", "2"],
  x_text: ["a", "b"],
  y: new Float64Array([1, 2]),
  y_text: ["a", "b"],
};
const prices = {
  close: new Float64Array([Number.NaN]),
  close_text: [null],
  end_json: ['"2026-11-09"'],
  from: new Float64Array([0]),
  high: new Float64Array([2]),
  high_text: ["2.00"],
  low: new Float64Array([0.5]),
  low_text: ["0.50"],
  open: new Float64Array([1]),
  open_text: ["1.00"],
  to: new Float64Array([7]),
  x_json: ['"2026-11-02"'],
  x_text: ["Nov 2"],
};

describe(decodeChartFrame, () => {
  test("splits points into their series, with the engine's text and breaks", () => {
    const frame = chartFrame(
      {
        series: new Uint32Array([0, 0, 0, 1, 1]),
        x: new Float64Array([1, 2, 3, 1, 4]),
        x_json: ['"2026-01-02"', '"2026-01-03"', '"2026-01-04"', '"2026-01-02"', '"2026-01-05"'],
        x_text: ["Jan 2", "Jan 3", "Jan 4", "Jan 2", "Jan 5"],
        y: new Float64Array([10, Number.NaN, 12, 5, 6]),
        y_text: ["10.00", null, "12.00", "5.00", "6.00"],
      },
      {
        series: [
          { column: "close", label: "close AAPL" },
          { column: "close", label: "close MSFT", right: true },
        ],
      },
    );
    const decoded = decodeChartFrame(frame);
    expect(decoded.ticks).toStrictEqual([{ label: "Jan 2", x: 0 }]);
    const [aapl, msft] = decoded.content.kind === "series" ? decoded.content.series : [];
    expect([aapl?.label, [...(aapl?.x ?? [])], aapl?.yText]).toStrictEqual([
      "close AAPL",
      [1, 2, 3],
      ["10.00", null, "12.00"],
    ]);
    expect(Number.isNaN(aapl?.y[1])).toBe(true);
    expect([msft?.right, [...(msft?.y ?? [])]]).toStrictEqual([true, [5, 6]]);
  });

  test("refuses series out of order, unlisted series, and a density of the wrong size", () => {
    const series = twoSeries;
    expect(() =>
      decodeChartFrame(chartFrame({ series: new Uint32Array([1, 0]), ...points }, { series })),
    ).toThrow("in order");
    expect(() =>
      decodeChartFrame(chartFrame({ series: new Uint32Array([0, 5]), ...points }, { series })),
    ).toThrow("does not list");
    expect(() =>
      decodeChartFrame(chartFrame({ count: new Uint32Array([1, 2, 3]) }, { columns: 2, rows: 2 })),
    ).toThrow("size");
  });

  test("refuses an extent that is not a range, and positions that are not doubles", () => {
    const series = twoSeries;
    const both = { series: new Uint32Array([0, 0]), ...points };
    expect(() =>
      decodeChartFrame(chartFrame(both, { extentFrom: 5, extentTo: 1, series })),
    ).toThrow("extent");
    expect(() => decodeChartFrame(chartFrame(both, { extentTo: Number.NaN, series }))).toThrow(
      "extent",
    );
    const words = {
      ...points,
      series: new Uint32Array([0]),
      x: new Float64Array([1]),
      y: ["not a number"],
    };
    expect(() => decodeChartFrame(chartFrame(words, { series }))).toThrow("doubles");
  });

  test("reads histograms and densities", () => {
    const histogram = decodeChartFrame(
      chartFrame(
        {
          count: new BigUint64Array([3n, 4n]),
          from: new Float64Array([0, 5]),
          from_text: ["0.00", "5.00"],
          series: new Uint32Array([0, 0]),
          to: new Float64Array([5, 10]),
          to_text: ["5.00", "10.00"],
        },
        { series: [{ column: "beta", label: "beta" }] },
      ),
    );
    expect(
      histogram.content.kind === "histogram" && histogram.content.series[0]?.counts,
    ).toStrictEqual([3, 4]);
    const density = decodeChartFrame(
      chartFrame(
        { count: new Uint32Array([1, 0, 2, 5]) },
        { columns: 2, rows: 2, yFrom: -1, yTo: 1 },
      ),
    );
    expect(density.content.kind === "density" && [...density.content.counts]).toStrictEqual([
      1, 0, 2, 5,
    ]);
  });

  test("reads candles, with volume only beside a volume indicator", () => {
    const candles = decodeChartFrame(chartFrame(prices, { interval: "week" }));
    const content = candles.content.kind === "candles" ? candles.content.candles : null;
    expect([content?.interval, content?.closeText, content?.volume]).toStrictEqual([
      "week",
      [null],
      null,
    ]);
    const withVolume = decodeChartFrame(
      chartFrame(
        { ...prices, volume: new Float64Array([Number.NaN]), volume_text: ["overflow"] },
        { interval: "week" },
      ),
    );
    expect(
      withVolume.content.kind === "candles" && withVolume.content.candles.volumeText,
    ).toStrictEqual(["overflow"]);
    expect(withVolume.indicators).toStrictEqual([]);
  });
});

describe("a chart frame's indicator lines", () => {
  const lines = {
    line: new Uint32Array([0, 0, 1]),
    x: new Float64Array([1, 2, 2]),
    x_text: [null, "b", "b"],
    y: new Float64Array([Number.NaN, 10.5, 55]),
    y_text: [null, "10.50", "55.00"],
  };
  const indicatorLines = [
    { indicator: 0, line: "sma", series: "AAPL" },
    { indicator: 1, line: "rsi", series: "AAPL" },
  ];
  const series = [{ column: "close", label: "close AAPL" }];
  const plotted = { series: new Uint32Array([0, 0]), ...points };

  test("come from their own batch, line by line", () => {
    const frame = decodeChartFrame(
      chartFrame(plotted, { indicatorBatch: batch(lines), indicatorLines, series }),
    );
    expect(
      frame.indicators.map((line) => [
        line.indicator,
        line.line,
        line.series,
        [...line.x],
        line.yText,
      ]),
    ).toStrictEqual([
      [0, "sma", "AAPL", [1, 2], [null, "10.50"]],
      [1, "rsi", "AAPL", [2], ["55.00"]],
    ]);
  });

  test("are refused when the batch names a line the frame does not list, or lines out of order", () => {
    const unlisted = {
      indicatorBatch: batch(lines),
      indicatorLines: indicatorLines.slice(0, 1),
      series,
    };
    expect(() => decodeChartFrame(chartFrame(plotted, unlisted))).toThrow("does not list");
    const backwards = { ...lines, line: new Uint32Array([1, 0, 0]) };
    expect(() =>
      decodeChartFrame(
        chartFrame(plotted, { indicatorBatch: batch(backwards), indicatorLines, series }),
      ),
    ).toThrow("in order");
  });
});

describe("a scatter's dots and fit lines", () => {
  const dots = {
    fit_text: ["4.5", null, "5.5"],
    id_json: ['"ABC123AB4"', '"ABC123AC2"', "17"],
    id_text: ["ABC123AB4", "ABC123AC2", "17"],
    series: new Uint32Array([0, 0, 1]),
    size: new Float64Array([1, Number.NaN, 0.25]),
    size_text: ["4,000", null, "1,000"],
    tooltip_0: ["Atlas Corp", "Atlas Corp", "Beacon Corp"],
    tooltip_1: ["AA", "AA", "BBB"],
    x: new Float64Array([1, 2, 3]),
    x_text: ["1.00", "2.00", "3.00"],
    y: new Float64Array([50, 60, 70]),
    y_text: ["50.0", "60.0", "70.0"],
  };
  const fits = {
    series: new Uint32Array([0, 0, 1]),
    x: new Float64Array([1, 2, 3]),
    x_text: ["1.00", "2.00", "3.00"],
    y: new Float64Array([45, Number.NaN, 55]),
    y_text: ["45.0", null, "55.0"],
  };
  const series = [
    { column: "spread_bp", label: "spread_bp Energy" },
    { column: "spread_bp", label: "spread_bp Utilities" },
  ];
  const lines = [
    { column: "fitted_spread_bp", label: "fitted_spread_bp Energy" },
    { column: "fitted_spread_bp", label: "fitted_spread_bp Utilities" },
  ];

  test("split dots into their series with every value's text, and the tooltip columns in order", () => {
    const frame = decodeChartFrame(
      chartFrame(dots, { fitBatch: batch(fits), fits: lines, series, yFrom: 50, yTo: 70 }),
    );
    const content = frame.content.kind === "points" ? frame.content : null;
    expect([content?.yFrom, content?.yTo]).toStrictEqual([50, 70]);
    const [energy, utilities] = content?.series ?? [];
    expect([energy?.label, [...(energy?.x ?? [])], energy?.idText, energy?.sizeText]).toStrictEqual(
      ["spread_bp Energy", [1, 2], ["ABC123AB4", "ABC123AC2"], ["4,000", null]],
    );
    expect(Number.isNaN(energy?.size[1])).toBe(true);
    expect([utilities?.idJson, utilities?.tooltip, utilities?.fitText]).toStrictEqual([
      ["17"],
      [["Beacon Corp"], ["BBB"]],
      ["5.5"],
    ]);
    expect(frame.fits.map((fit) => [fit.label, [...fit.x], fit.yText])).toStrictEqual([
      ["fitted_spread_bp Energy", [1, 2], ["45.0", null]],
      ["fitted_spread_bp Utilities", [3], ["55.0"]],
    ]);
  });

  test("are refused when the fit batch names a line the frame does not list", () => {
    expect(() =>
      decodeChartFrame(
        chartFrame(dots, { fitBatch: batch(fits), fits: lines.slice(0, 1), series }),
      ),
    ).toThrow("does not list");
  });
});
