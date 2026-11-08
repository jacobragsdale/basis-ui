import { describe, expect, test } from "vite-plus/test";

import { shapesOf } from "#chart/drawings.ts";
import type { ChartModel, Scale } from "#chart/model-types.ts";
import { brushFilters, zoomRange } from "#chart/range.ts";
import { snap } from "#chart/snap.ts";
import type { ChartContent, SeriesData } from "#frame/chart-data.ts";
import type { LayoutChart } from "#layout/chart.ts";
import { chartColors } from "#theme/charts.ts";

import {
  chartOf,
  frameOf,
  measure,
  modelOf,
  pointsOf,
  tenCandles,
} from "./chart-pointer-inputs.ts";

const colors = chartColors.light;

/** A chart's left value scale. */
function leftOf(model: ChartModel): Scale {
  const scale = model.yAxes[0]?.scale;
  if (scale === undefined) {
    throw new Error("no left axis");
  }
  return scale;
}

/** A 10-year yield over five days, and a spread on the right. */
const yields: ChartContent = {
  kind: "series",
  series: [
    pointsOf("yield", [
      [0, 4.1],
      [1, 4.3],
      [2, 4.2],
      [3, 4.6],
      [4, 4.4],
    ]),
    {
      ...pointsOf("spread", [
        [0, 1.2],
        [4, 1.5],
      ]),
      column: "spread",
      right: true,
    },
  ],
};
const frame = frameOf(yields, { xTo: 4 });

/** A line chart of the yields, reversed as asked. */
function yieldChart(reversed: Partial<LayoutChart> = {}): ChartModel {
  return modelOf(
    chartOf({ kind: "line", x: "date", y: ["yield"], y_right: ["spread"], ...reversed }),
    {
      frame,
    },
  );
}

/** The ten candles, rising or falling as their data says. */
const candleFrame = frameOf({ candles: tenCandles, kind: "candles" });

/** The ten candles' chart. */
function candles(chart: Partial<LayoutChart> = {}): ChartModel {
  return modelOf(
    chartOf({
      kind: "candlestick",
      ohlc: { close: "c", high: "h", low: "l", open: "o" },
      x: "date",
      ...chart,
    }),
    { frame: candleFrame, width: 500 },
  );
}

describe("a reversed value axis", () => {
  test("puts the highest yield at the bottom and the lowest at the top, its ticks with them", () => {
    const [upright, reversed] = [yieldChart(), yieldChart({ reverse_y: true })];
    const { plot } = reversed;
    expect(leftOf(upright).map(4.6) < leftOf(upright).map(4.1)).toBe(true);
    expect(leftOf(reversed).map(4.6) > leftOf(reversed).map(4.1)).toBe(true);
    const ticks = reversed.yAxes[0]?.ticks ?? [];
    expect(ticks.length > 1).toBe(true);
    // Ticks run from the top down in rising value.
    const values = ticks.toSorted((one, other) => one.px - other.px).map((tick) => tick.value);
    expect(values).toStrictEqual(values.toSorted((one, other) => one - other));
    // The lowest value of the axis is at the plot's top.
    const [lowest] = leftOf(reversed).domain;
    expect(leftOf(reversed).invert(plot.y)).toBeCloseTo(lowest);
  });

  test("turns the right axis on its own", () => {
    const right = yieldChart({ reverse_y_right: true });
    const [left, spread] = [leftOf(right), right.yAxes[1]?.scale];
    expect(left.map(4.6) < left.map(4.1)).toBe(true);
    expect((spread?.map(1.5) ?? 0) > (spread?.map(1.2) ?? 0)).toBe(true);
  });

  test("keeps the x scale, so zooming and brushing select the same days", () => {
    const [upright, reversed] = [yieldChart(), yieldChart({ reverse_y: true })];
    expect(reversed.x?.domain).toStrictEqual(upright.x?.domain);
    expect(reversed.x?.range).toStrictEqual(upright.x?.range);
    expect(zoomRange([0, 4], { anchor: 1, factor: 0.5, full: [0, 4] })).toStrictEqual([0.5, 2.5]);
    const brushed = brushFilters(frame, { column: "date", hidden: [], range: [0.5, 3.5] });
    expect(brushed?.range).toStrictEqual([1, 3]);
  });

  test("draws and snaps drawings at their prices, the higher one lower", () => {
    const chart = {
      drawings: [
        { kind: "horizontal" as const, y: 104 },
        { kind: "horizontal" as const, y: 108 },
      ],
      reverse_y: true,
    };
    const model = candles(chart);
    const scale = leftOf(model);
    const shapes = shapesOf(
      chartOf({
        kind: "candlestick",
        ohlc: { close: "c", high: "h", low: "l", open: "o" },
        x: "date",
        ...chart,
      }).drawings,
      { frame: candleFrame, measure, model },
    );
    const ys = shapes.map((shape) => (shape.kind === "horizontal" ? shape.y : Number.NaN));
    expect(ys[1]).toBeGreaterThan(ys[0] ?? Number.POSITIVE_INFINITY);
    expect(scale.invert(ys[0] ?? 0)).toBeCloseTo(104);
    // A new anchor takes the price under the pointer, as on an upright axis.
    const at = snap(candleFrame, model, {
      point: { x: model.x?.map(4) ?? 0, y: scale.map(106.5) },
    });
    expect(at?.anchor.y).toBeCloseTo(106.5, 1);
  });

  test("draws a rising candle with its close below its open", () => {
    const model = candles({ reverse_y: true });
    const first = model.marks.find((mark) => mark.kind === "candle");
    // The first candle opens at 100 and closes at 100.5.
    expect(first?.kind === "candle" && first.close > first.open).toBe(true);
    expect(first?.kind === "candle" && first.high > first.low).toBe(true);
  });
});

/** The colour of the first candle, which rose. */
function risingColor(chart: Partial<LayoutChart>): string | undefined {
  return candles(chart).marks.find((mark) => mark.kind === "candle")?.color;
}

describe("the rising colour", () => {
  test("is the up colour unless a rise is a loss, for candles and volume", () => {
    expect([risingColor({}), risingColor({ rising: "loss" })]).toStrictEqual([
      colors.up,
      colors.down,
    ]);
  });

  test("swaps a waterfall's increases and decreases, and a pane's bars", () => {
    const steps = {
      categories: ["Carry", "Curve"],
      keys: ["Carry", "Curve"],
      others: [false, false],
      series: [
        { label: "pnl", texts: ["4", "-7"], total: "-3", totalValue: -3, values: [4, -7] },
        { label: "run", texts: ["4", "-3"], total: "-3", totalValue: -3, values: [4, -3] },
      ],
    };
    const legend = (rising?: "gain" | "loss"): readonly string[] =>
      modelOf(chartOf({ kind: "waterfall", ...(rising === undefined ? {} : { rising }) }), {
        categories: steps,
      }).legend.map((entry) => entry.color);
    expect(legend().slice(0, 2)).toStrictEqual([colors.up, colors.down]);
    expect(legend("loss").slice(0, 2)).toStrictEqual([colors.down, colors.up]);
    const change: SeriesData = {
      ...pointsOf("change", [
        [0, 0.02],
        [1, -0.01],
      ]),
      column: "change",
    };
    const paneFrame = frameOf({ kind: "series", series: [...yields.series, change] }, { xTo: 4 });
    const [pane] = modelOf(
      chartOf({
        kind: "line",
        panes: [{ columns: ["change"], kind: "bar", reverse: true }],
        rising: "loss",
        x: "date",
        y: ["yield"],
        y_right: ["spread"],
      }),
      { frame: paneFrame },
    ).panes;
    const columns = (pane?.marks ?? []).flatMap((mark) =>
      mark.kind === "columns" ? [mark.color] : [],
    );
    expect(columns).toStrictEqual([colors.down, colors.up]);
    // The pane's axis is turned too: its larger value is drawn lower.
    expect((pane?.axis.scale.map(0.02) ?? 0) > (pane?.axis.scale.map(-0.01) ?? 0)).toBe(true);
  });
});
