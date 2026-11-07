import { describe, expect, test } from "vite-plus/test";

import { categoryAt, markAt, nearestIndex, readSeries } from "#chart/interaction.ts";
import type { ChartContent } from "#frame/chart-data.ts";
import { chartColors } from "#theme/charts.ts";

import { chartOf, frameOf, modelOf, pointsOf, threeCandles } from "./chart-pointer-inputs.ts";

const colors = chartColors.light;

describe(nearestIndex, () => {
  test("finds the nearest value, the earlier on a tie, and -1 for nothing", () => {
    const xs = Float64Array.from([0, 2, 4, 10]);
    expect(nearestIndex(new Float64Array(0), 3)).toBe(-1);
    expect([-5, 2, 2.9, 3, 3.1, 8, 99].map((x) => nearestIndex(xs, x))).toStrictEqual([
      0, 1, 1, 1, 2, 3, 3,
    ]);
  });
});

describe(readSeries, () => {
  const content: ChartContent = {
    kind: "series",
    series: [
      pointsOf("AAPL", [
        [0, 1],
        [2, 2],
        [4, 3],
      ]),
      pointsOf("MSFT", [
        [0, 10],
        [2, null],
        [3, 30],
        [4, 40],
      ]),
    ],
  };
  const frame = frameOf(content, { xTo: 4 });

  test("snaps to the nearest point of any series and reads every series that has a value there", () => {
    const model = modelOf(chartOf({ kind: "line" }), { frame });
    const at3 = readSeries(frame, model, { hidden: [], x: 3.2 });
    // Only MSFT has a point at 3.
    expect([at3?.title, at3?.rows]).toStrictEqual([
      "day 3",
      [{ color: colors.series[1], label: "MSFT", value: "30.00" }],
    ]);
    expect(at3?.crosshair).toBeCloseTo(model.x?.map(3) ?? Number.NaN);
    // At 2 MSFT has a gap, which says nothing rather than a wrong value.
    expect(
      readSeries(frame, model, { hidden: [], x: 2.1 })?.rows.map((row) => row.label),
    ).toStrictEqual(["AAPL"]);
    expect(
      readSeries(frame, model, { hidden: [], x: 0 })?.rows.map((row) => [row.label, row.value]),
    ).toStrictEqual([
      ["AAPL", "1.00"],
      ["MSFT", "10.00"],
    ]);
  });

  test("ignores hidden series, keeping the shown ones' colours", () => {
    const model = modelOf(chartOf({ hidden: ["MSFT"], kind: "line" }), { frame });
    const reading = readSeries(frame, model, { hidden: ["MSFT"], x: 3.2 });
    // Hidden, MSFT's point at 3 is not snapped to: the nearest shown point is AAPL's at 4.
    expect([reading?.title, reading?.rows]).toStrictEqual([
      "day 4",
      [{ color: colors.series[0], label: "AAPL", value: "3.00" }],
    ]);
    expect(readSeries(frame, model, { hidden: ["AAPL", "MSFT"], x: 3 })).toBeNull();
  });

  test("never snaps to a break between segments, so the title is always a drawn point's", () => {
    const gappy = frameOf(
      {
        kind: "series",
        series: [
          pointsOf("AAPL", [
            [0, 1],
            [1, null],
            [2, null],
            [3, 4],
          ]),
        ],
      },
      { xTo: 3 },
    );
    const model = modelOf(chartOf({ kind: "line" }), { frame: gappy });
    expect(readSeries(gappy, model, { hidden: [], x: 1.1 })?.title).toBe("day 0");
    const late = readSeries(gappy, model, { hidden: [], x: 1.9 });
    expect([late?.title, late?.rows]).toStrictEqual([
      "day 3",
      [{ color: colors.series[0], label: "AAPL", value: "4.00" }],
    ]);
  });

  test("reads another series' nearest point a pixel or two away under its own x", () => {
    // A thousand days over the plot: points a day apart are under a pixel apart.
    const reduced = frameOf(
      {
        kind: "series",
        series: [
          pointsOf("AAPL", [
            [0, 1],
            [500, 2],
            [1000, 3],
          ]),
          pointsOf("MSFT", [
            [0, 10],
            [501, 20],
            [1000, 30],
          ]),
          pointsOf("NVDA", [
            [0, 5],
            [460, 6],
            [1000, 7],
          ]),
        ],
      },
      { xTo: 1000 },
    );
    const reading = readSeries(reduced, modelOf(chartOf({ kind: "line" }), { frame: reduced }), {
      hidden: [],
      x: 500,
    });
    expect(reading?.title).toBe("day 500");
    // NVDA's nearest point is forty days, several pixels, away: it says nothing rather than another day's value.
    expect(reading?.rows.map((row) => [row.label, row.value])).toStrictEqual([
      ["AAPL", "2.00"],
      ["MSFT, day 501", "20.00"],
    ]);
  });

  test("reads nothing from a frame that is not series", () => {
    const candles = frameOf({ candles: threeCandles, kind: "candles" }, { xTo: 3 });
    const model = modelOf(chartOf({ kind: "candlestick" }), { frame: candles });
    expect(readSeries(candles, model, { hidden: [], x: 1 })).toBeNull();
  });
});

describe(markAt, () => {
  test("reads the candle nearest the pointer, within its hit area", () => {
    const candles = frameOf({ candles: threeCandles, kind: "candles" }, { xTo: 3 });
    const model = modelOf(chartOf({ kind: "candlestick" }), { frame: candles });
    const [monday, tuesday] = model.marks.filter((mark) => mark.kind === "candle");
    const reading = markAt(model, (monday?.x ?? 0) + 1, 10);
    // Day candles are titled by their date alone; longer buckets name their period, which the model tests check.
    expect([reading?.title, reading?.crosshair]).toStrictEqual(["Mon", monday?.x]);
    expect(reading?.rows.map((row) => [row.label, row.value])).toStrictEqual([
      ["Open", "10"],
      ["High", "13"],
      ["Low", "9"],
      ["Close", "12"],
    ]);
    expect(markAt(model, (tuesday?.x ?? 0) - 1, 10)?.title).toBe("Tue");
  });

  test("reads a bar a few pixels outside it, and nothing further away", () => {
    const bins = {
      from: Float64Array.from([0, 5]),
      fromText: ["0", "5"],
      to: Float64Array.from([5, 10]),
      toText: ["5", "10"],
    };
    const histogram = frameOf({
      kind: "histogram",
      series: [{ counts: [3, 1], label: "Beta", ...bins }],
    });
    const model = modelOf(chartOf({ kind: "histogram" }), { frame: histogram });
    const bar = model.marks.find((mark) => mark.kind === "rect");
    const middle = (bar?.rect.x ?? 0) + (bar?.rect.width ?? 0) / 2;
    expect(markAt(model, middle, (bar?.rect.y ?? 0) - 3)?.title).toBe("0 to 5");
    expect(markAt(model, middle, (bar?.rect.y ?? 0) - 10)).toBeNull();
  });
});

describe(categoryAt, () => {
  const slices = modelOf(chartOf({ kind: "pie" }), {
    categories: {
      categories: ["Equity", "Bond", "Other"],
      keys: ["Equity", "Bond", null],
      others: [false, false, true],
      series: [{ label: "mv", texts: ["50", "25", "25"], total: "100", values: [50, 25, 25] }],
    },
    height: 300,
    width: 300,
  });

  test("finds the slice under the pointer by its angle, within its ring", () => {
    // Equity runs from twelve o'clock to six, clockwise: the right half. Bond is the bottom left quarter.
    expect([categoryAt(slices, 250, 150), categoryAt(slices, 70, 200)]).toStrictEqual([0, 1]);
    expect(markAt(slices, 70, 200)?.title).toBe("Bond");
  });

  test("finds none in the hole, outside the ring, or for Other, which stands for several groups", () => {
    expect(categoryAt(slices, 150, 150)).toBeNull();
    expect(markAt(slices, 70, 100)?.title).toBe("Other");
    expect([categoryAt(slices, 70, 100), categoryAt(slices, 2, 2)]).toStrictEqual([null, null]);
  });
});
