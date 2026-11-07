import { describe, expect, test } from "vite-plus/test";

import { eventRows, indicatorRows } from "#chart/interaction.ts";
import type { ChartFrameData } from "#frame/chart-data.ts";

import { candleChart, candleFrame, closes, days, line, model } from "./chart-indicator-inputs.ts";
import { chartOf, marksOf } from "./chart-model-inputs.ts";

describe("indicators, events and comparisons over line charts", () => {
  test("hides a series' indicators with it", () => {
    const chart = chartOf({
      indicators: [{ kind: "sma" }],
      kind: "line",
      series: "ticker",
      x: "date",
      y: ["close"],
    });
    const averages = [
      line(
        { indicator: 0, name: "sma", series: "AAPL" },
        days.map((day) => [day, 100]),
      ),
      line(
        { indicator: 0, name: "sma", series: "MSFT" },
        days.map((day) => [day, 1]),
      ),
    ];
    const prices = [
      closes(
        "close AAPL",
        days.map(() => 100),
      ),
      closes(
        "close MSFT",
        days.map(() => 1),
      ),
    ];
    const data: ChartFrameData = {
      ...candleFrame(averages),
      content: { kind: "series", series: prices },
    };
    expect(model(chart, data).legend.map((entry) => entry.label)).toStrictEqual([
      "close AAPL",
      "close MSFT",
      "SMA 20 AAPL",
      "SMA 20 MSFT",
    ]);
    const without = model({ ...chart, hidden: ["close AAPL"] }, data);
    // AAPL's average goes with it: not drawn, not in the scale, not in the tooltip.
    expect(marksOf(without.marks, "line")).toHaveLength(2);
    expect(without.yAxes[0]?.scale.domain[1]).toBeLessThan(100);
    const rows = indicatorRows(data, without, { hidden: ["close AAPL"], x: 3 });
    expect(rows.map((row) => row.label)).toStrictEqual(["SMA 20 MSFT"]);
  });

  test("reads the events in the candle under the crosshair", () => {
    const data: ChartFrameData = {
      ...candleFrame([]),
      events: [
        { series: "", text: "Q1 earnings", x: 1, xText: "day 1" },
        { series: "", text: "Dividend", x: 7, xText: "day 7" },
      ],
      eventsTotal: 2,
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

  test("leaves out the events of a hidden series", () => {
    const chart = chartOf({
      hidden: ["close AAPL"],
      kind: "line",
      series: "ticker",
      x: "date",
      y: ["close"],
    });
    const data: ChartFrameData = {
      ...candleFrame([]),
      content: { kind: "series", series: [closes("close AAPL", days), closes("close MSFT", days)] },
      events: [
        { series: "AAPL", text: "AAPL: Dividend", x: 2, xText: "day 2" },
        { series: "MSFT", text: "MSFT: Q1 earnings", x: 3, xText: "day 3" },
      ],
      eventsTotal: 2,
    };
    expect(model(chart, data).events.map((event) => event.text)).toStrictEqual([
      "MSFT: Q1 earnings",
    ]);
  });
});
