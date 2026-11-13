import { describe, expect, test } from "vite-plus/test";

import { eventRows } from "#chart/interaction.ts";
import type { ChartFrameData } from "#frame/chart-data.ts";

import { candleChart, candleFrame, closes, days, model } from "./chart-indicator-inputs.ts";
import { chartOf } from "./chart-model-inputs.ts";

describe("indicators, events and comparisons over line charts", () => {
  test("reads the events in the candle under the crosshair", () => {
    const data: ChartFrameData = {
      ...candleFrame([]),
      events: [
        { series: "", text: "Q1 earnings", x: 1, xText: "day 1" },
        { series: "", text: "Dividend", x: 7, xText: "day 7" },
      ],
      eventsTotal: 2,
      fits: [],
    };
    const drawn = model(candleChart([]), data);
    expect(drawn.events.map((event) => event.text)).toStrictEqual(["Q1 earnings", "Dividend"]);
    // Weekly candles: day 1 is in the first, day 7 in the second.
    expect(eventRows(data, drawn, 4).map((row) => [row.value, row.label])).toStrictEqual([
      ["Q1 earnings", "day 1"],
    ]);
    expect(eventRows(data, drawn, 9).map((row) => row.value)).toStrictEqual(["Dividend"]);
  });

  test("labels a comparison's axis in percentages, on a linear scale even when asked for a log one", () => {
    const chart = chartOf({ compare: true, kind: "line", log_y: true, x: "date", y: ["close"] });
    const series = [
      closes(
        "close",
        days.map((day) => day * 3),
      ),
    ];
    const drawn = model(chart, { ...candleFrame([]), content: { kind: "series", series } });
    const labels = drawn.yAxes[0]?.ticks.map((tick) => tick.label) ?? [];
    expect(labels.length).toBeGreaterThan(1);
    expect(labels.every((label) => label.endsWith("%"))).toBe(true);
    expect(drawn.yAxes[0]?.scale.log).toBe(false);
    // The gutter holds the widest label as shown, its "%" included.
    expect(drawn.plot.x).toBeGreaterThanOrEqual(
      Math.max(...labels.map((label) => label.length * 6)) + 8,
    );
  });
});
