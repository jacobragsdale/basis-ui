import { describe, expect, test } from "vite-plus/test";

import { drawingAt, handleAt } from "#chart/drawing-hits.ts";
import { anchorPosition, drawingFrom, moved, shapesOf } from "#chart/drawings.ts";
import type { Shape } from "#chart/drawings.ts";
import type { ChartModel } from "#chart/model-types.ts";
import { seriesAt, snap } from "#chart/snap.ts";
import type { ChartFrameData, SeriesData } from "#frame/chart-data.ts";
import type { LayoutChart } from "#layout/chart.ts";

import { chartOf, days, frameOf, measure, modelOf, tenCandles } from "./chart-pointer-inputs.ts";

/** A candlestick chart of the ten candles, with drawings, on a linear or a log scale. */
function candleChart(
  drawings: NonNullable<LayoutChart["drawings"]> = [],
  logY = false,
): LayoutChart {
  return chartOf({
    drawings,
    kind: "candlestick",
    log_y: logY,
    ohlc: { close: "c", high: "h", low: "l", open: "o" },
    x: "date",
  });
}

/** The ten candles' frame, with anchors the engine placed. */
function candleFrame(anchors: ReadonlyMap<string, number> = new Map()): ChartFrameData {
  return { ...frameOf({ candles: tenCandles, kind: "candles" }), anchors };
}

/** A model of the ten candles at 500 by 300 pixels. */
function candleModel(chart: LayoutChart, frame: ChartFrameData): ChartModel {
  return modelOf(chart, { frame, width: 500 });
}

const priceDrawings: NonNullable<LayoutChart["drawings"]> = [
  { from: { x: "2026-01-01", y: 100 }, kind: "trend", to: { x: "2026-01-10", y: 109 } },
  { kind: "horizontal", y: 105 },
  { from: { x: "2026-01-02", y: 100 }, kind: "fibonacci", to: { x: "2026-01-06", y: 110 } },
  { at: { x: "2026-01-10", y: 104 }, kind: "note", text: "A long note near the edge" },
  { from: { x: "2026-01-21", y: 100 }, kind: "rectangle", to: { x: "2026-01-03", y: 104 } },
];

describe(anchorPosition, () => {
  test("finds a number anchor however its JSON writes it", () => {
    const numbers: ChartFrameData = {
      ...frameOf({ kind: "series", series: [] }),
      anchors: new Map([["2", 40]]),
      content: {
        kind: "series",
        series: [
          {
            column: "y",
            key: "",
            label: "y",
            right: false,
            x: Float64Array.from([7]),
            xJson: ["7.0"],
            xText: ["7"],
            y: Float64Array.from([1]),
            yText: ["1"],
          },
        ],
      },
    };
    // The engine writes 2.0 as "2.0"; the anchor holds the number 2 either way.
    expect([anchorPosition(numbers, 2), anchorPosition(numbers, 7)]).toStrictEqual([40, 7]);
  });

  test("places an anchor where the engine says, or at the frame's point it was snapped to", () => {
    // The engine placed an anchor on day 20, past this frame's points.
    const frame = candleFrame(
      new Map([
        ['"2026-01-21"', 20],
        ['"holiday"', Number.NaN],
      ]),
    );
    expect(
      ["2026-01-21", "2026-01-04", "holiday", "2027-01-01"].map((x) => anchorPosition(frame, x)),
    ).toStrictEqual([20, 3, null, null]);
  });
});

describe(shapesOf, () => {
  const chart = candleChart(priceDrawings);
  const frame = candleFrame();
  const model = candleModel(chart, frame);
  const shapes = shapesOf(chart.drawings, { frame, measure, model });

  test("draws each kind where its anchors are, leaving out one the axis cannot place", () => {
    // The rectangle's corner on day 20 is in no frame and not placed by the engine yet: it is left out.
    expect(shapes.map((shape) => shape.kind)).toStrictEqual([
      "trend",
      "horizontal",
      "fibonacci",
      "note",
    ]);
  });

  test("puts Fibonacci's levels from the move's end back to its start", () => {
    const scale = model.yAxes[0]?.scale;
    const fibonacci = shapes.at(2);
    const levels =
      fibonacci?.kind === "fibonacci"
        ? fibonacci.levels.map((level) => scale?.invert(level.y) ?? 0)
        : [];
    const expected = [110, 110 - 2.36, 110 - 3.82, 105, 110 - 6.18, 110 - 7.86, 100];
    expect(levels).toHaveLength(expected.length);
    expect(levels.every((level, i) => Math.abs(level - (expected[i] ?? 0)) < 1e-9)).toBe(true);
  });

  test("writes a note near the right edge to the left of its point", () => {
    const note = shapes.at(3);
    expect(note?.kind === "note" && note.box.x + note.box.width < note.at.x).toBe(true);
  });

  test("cannot place a drawing below zero on a log scale", () => {
    const log = candleChart([{ kind: "horizontal", y: -1 }], true);
    expect(
      shapesOf(log.drawings, { frame, measure, model: candleModel(log, frame) }),
    ).toStrictEqual([]);
  });
});

describe(drawingAt, () => {
  const shapes: Shape[] = [
    { end: { x: 100, y: 100 }, index: 0, kind: "trend", start: { x: 0, y: 0 } },
    { end: { x: 300, y: 50 }, index: 1, kind: "rectangle", start: { x: 200, y: 0 } },
  ];

  test("picks the drawing nearest the pointer, and a rectangle from inside", () => {
    expect(
      [
        { x: 50, y: 54 },
        { x: 50, y: 60 },
        { x: 250, y: 25 },
      ].map((point) => drawingAt(shapes, point)),
    ).toStrictEqual([0, null, 1]);
  });

  test("finds a drawing's handle under the pointer", () => {
    const [trend] = shapes;
    expect(
      trend === undefined
        ? []
        : [handleAt(trend, { x: 98, y: 103 }), handleAt(trend, { x: 50, y: 50 })],
    ).toStrictEqual([1, null]);
  });
});

describe(snap, () => {
  test("snaps an anchor to the nearest candle's exact x and the price a pixel tells apart", () => {
    const frame = candleFrame();
    const model = candleModel(candleChart(), frame);
    const [x, y] = [model.x, model.yAxes[0]?.scale];
    const at = snap(frame, model, { point: { x: x?.map(4.4) ?? 0, y: y?.map(104.123456) ?? 0 } });
    expect(at?.anchor.x).toBe("2026-01-05");
    expect(at?.point.x).toBeCloseTo(x?.map(4) ?? Number.NaN);
    // A pixel here is worth a few hundredths, so the price keeps two decimals.
    const perPixel = Math.abs((y?.invert(0) ?? 0) - (y?.invert(1) ?? 0));
    expect(perPixel > 0.01 && perPixel < 0.1).toBe(true);
    expect(at?.anchor.y).toBe(104.12);
  });
});

describe(drawingFrom, () => {
  const from = { anchor: { x: "2026-01-01", y: 100 }, point: { x: 0, y: 0 } };
  const to = { anchor: { x: "2026-01-05", y: 104 }, point: { x: 40, y: 40 } };

  test("makes each kind from two snaps", () => {
    expect(drawingFrom("horizontal", { from, to })).toStrictEqual({ kind: "horizontal", y: 100 });
    expect(drawingFrom("note", { from, text: "Hi", to })).toStrictEqual({
      at: from.anchor,
      kind: "note",
      text: "Hi",
    });
    expect(drawingFrom("fibonacci", { from, to })).toStrictEqual({
      from: from.anchor,
      kind: "fibonacci",
      to: to.anchor,
    });
  });

  test("moves one anchor at a time", () => {
    const fibonacci = drawingFrom("fibonacci", { from, to });
    expect(moved(fibonacci, 1, from)).toStrictEqual({
      from: from.anchor,
      kind: "fibonacci",
      to: from.anchor,
    });
    expect(moved({ kind: "horizontal", y: 1 }, 0, to)).toStrictEqual({
      kind: "horizontal",
      y: 104,
    });
  });
});

/** A line of ten days of a series' close, rising from `base`. */
function closes(label: string, base: number): SeriesData {
  return {
    column: "close",
    key: "",
    label,
    right: false,
    x: Float64Array.from(days),
    xJson: days.map(String),
    xText: days.map(String),
    y: Float64Array.from(days, (day) => base + day),
    yText: days.map(String),
  };
}

describe(seriesAt, () => {
  test("is the shown series whose line is nearest the press", () => {
    const chart = chartOf({ kind: "line", series: "ticker", x: "date", y: ["close"] });
    const frame: ChartFrameData = {
      ...candleFrame(),
      content: { kind: "series", series: [closes("close AAPL", 100), closes("close MSFT", 200)] },
    };
    const model = candleModel(chart, frame);
    const near = (price: number): { readonly x: number; readonly y: number } => ({
      x: model.x?.map(4) ?? 0,
      y: model.yAxes[0]?.scale.map(price) ?? 0,
    });
    expect(seriesAt(frame, model, { hidden: [], point: near(195) })).toStrictEqual({
      key: "MSFT",
      label: "close MSFT",
    });
    expect(seriesAt(frame, model, { hidden: [], point: near(105) })).toStrictEqual({
      key: "AAPL",
      label: "close AAPL",
    });
    // A hidden series is never measured.
    expect(seriesAt(frame, model, { hidden: ["close MSFT"], point: near(195) })).toStrictEqual({
      key: "AAPL",
      label: "close AAPL",
    });
  });
});
