import { describe, expect, test } from "vite-plus/test";

import { brushFilters, panRange, zoomRange } from "#chart/range.ts";
import type { Range } from "#chart/range.ts";
import type { ChartContent } from "#frame/chart-data.ts";

import { frameOf, pointsOf, threeCandles } from "./chart-pointer-inputs.ts";

const full: Range = [0, 100];

/** The filters for `column` from `low` to `high`, the upper bound by `op`. */
function between(low: string, high: string, op: "le" | "lt"): readonly object[] {
  return [
    { column: "date", columns: [], op: "ge", value: low, values: [] },
    { column: "date", columns: [], op, value: high, values: [] },
  ];
}

describe(zoomRange, () => {
  test("zooms around the anchor, keeping its place in the range", () => {
    expect(zoomRange([0, 100], { anchor: 25, factor: 0.5, full })).toStrictEqual([12.5, 62.5]);
  });

  test("returns null once zooming out reaches everything, and moves rather than shrinks at an edge", () => {
    expect(zoomRange([10, 90], { anchor: 50, factor: 1.25, full })).toBeNull();
    expect(zoomRange([0, 40], { anchor: 0, factor: 1.25, full })).toStrictEqual([0, 50]);
    expect(zoomRange([60, 100], { anchor: 100, factor: 1.25, full })).toStrictEqual([50, 100]);
  });

  test("stops zooming in at a millionth of the range", () => {
    let range: Range | null = [0, 100];
    for (let i = 0; i < 200 && range !== null; i += 1) {
      range = zoomRange(range, { anchor: 50, factor: 0.5, full });
    }
    expect(range?.[1] ?? 0).toBeGreaterThan(range?.[0] ?? 0);
    expect((range?.[1] ?? 0) - (range?.[0] ?? 0)).toBeCloseTo(100e-6);
  });
});

describe(panRange, () => {
  test("pans by a delta and keeps the width at the edges", () => {
    expect(panRange([10, 30], 5, full)).toStrictEqual([15, 35]);
    expect(panRange([10, 30], -50, full)).toStrictEqual([0, 20]);
    expect(panRange([80, 100], 10, full)).toStrictEqual([80, 100]);
    // Without a known full range, panning is free.
    expect(panRange([10, 30], -50, null)).toStrictEqual([-40, -20]);
  });
});

describe(brushFilters, () => {
  const content: ChartContent = {
    kind: "series",
    series: [
      pointsOf("AAPL", [
        [0, 1],
        [2, 2],
        [4, 3],
      ]),
      pointsOf("MSFT", [
        [1, 10],
        [3, 30],
        [5, 50],
      ]),
    ],
  };
  const frame = frameOf(content, { xTo: 5 });
  const brush = (range: Range, hidden: readonly string[] = []): ReturnType<typeof brushFilters> =>
    brushFilters(frame, { column: "date", hidden, range });

  test("selects from the first point inside the range to the last, inclusive, with the exact values sent", () => {
    expect(brush([0.5, 4.2])).toStrictEqual({
      filters: between("2024-01-02", "2024-01-05", "le"),
      range: [1, 4],
    });
    // Brushed right to left, the same.
    expect(brush([4.2, 0.5])).toStrictEqual(brush([0.5, 4.2]));
  });

  test("ignores hidden series and selects nothing from an empty range", () => {
    expect(brush([0.5, 4.2], ["AAPL"])?.filters.map((filter) => filter.value)).toStrictEqual([
      "2024-01-02",
      "2024-01-04",
    ]);
    expect(brush([5.5, 9])).toBeNull();
  });

  test("never bounds a selection by a break between segments", () => {
    const gappy = frameOf({
      kind: "series",
      series: [
        pointsOf("AAPL", [
          [0, 1],
          [1, null],
          [2, 2],
          [3, null],
          [4, 3],
        ]),
      ],
    });
    const brushed = brushFilters(gappy, { column: "date", hidden: [], range: [0.5, 3.5] });
    expect([brushed?.filters.map((filter) => filter.value), brushed?.range]).toStrictEqual([
      ["2024-01-03", "2024-01-03"],
      [2, 2],
    ]);
    expect(brushFilters(gappy, { column: "date", hidden: [], range: [0.5, 1.5] })).toBeNull();
  });

  test("selects every candle bucket the range touches, whole, up to the next bucket's start", () => {
    const candles = frameOf({ candles: threeCandles, kind: "candles" }, { xTo: 3 });
    // From the middle of Monday's bucket to the middle of Tuesday's: both, whole.
    expect(brushFilters(candles, { column: "date", hidden: [], range: [0.5, 1.5] })).toStrictEqual({
      filters: between("2024-01-01", "2024-01-03", "lt"),
      range: [0, 2],
    });
    expect(brushFilters(candles, { column: "date", hidden: [], range: [3.5, 9] })).toBeNull();
  });

  test("selects nothing when a bound's value is unknown", () => {
    const unknown = frameOf({
      kind: "series",
      series: [{ ...pointsOf("AAPL", [[0, 1]]), xJson: [null] }],
    });
    expect(brushFilters(unknown, { column: "date", hidden: [], range: [-1, 1] })).toBeNull();
  });
});
