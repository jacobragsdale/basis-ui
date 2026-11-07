import { describe, expect, test } from "vite-plus/test";

import { indicatorLabel, indicatorStyles, paneSpecs } from "#chart/indicators.ts";
import { indicatorRows } from "#chart/interaction.ts";
import { plotBottom } from "#chart/model.ts";
import { paneDomain, paneHeight, paneScale } from "#chart/panes.ts";
import { chartColors } from "#theme/charts.ts";

import { candleChart, candleFrame, days, line, model } from "./chart-indicator-inputs.ts";
import { marksOf } from "./chart-model-inputs.ts";

const colors = chartColors.light;
const styleColors = { colors, muted: "#999", plotted: 0 };

describe("indicator labels, panes and styles", () => {
  test("names each indicator with its parameters, and gives panes to all but the overlays", () => {
    const chart = candleChart([
      { kind: "sma" },
      { deviations: 1.5, kind: "bollinger", period: 10 },
      { kind: "macd" },
      { kind: "stochastic" },
      { kind: "vwap" },
      { kind: "volume" },
    ]);
    expect(chart.indicators.map((indicator) => indicatorLabel(indicator))).toStrictEqual([
      "SMA 20",
      "BB 10 1.5",
      "MACD 12 26 9",
      "Stoch 14 3 3",
      "VWAP",
      "Volume",
    ]);
    // Averages, bands and VWAP go over the price; the rest get panes, in order.
    expect(paneSpecs(chart).map((pane) => [pane.title, pane.domain, pane.guides])).toStrictEqual([
      ["MACD 12 26 9", null, [0]],
      ["Stoch 14 3 3", [0, 100], [20, 80]],
      ["Volume", null, []],
    ]);
  });

  test("gives overlays the slots after the series, and a pane's second line the next slot", () => {
    const chart = candleChart([{ kind: "sma" }, { kind: "bollinger" }, { kind: "macd" }]);
    const point: readonly (readonly [number, number])[] = [[0, 1]];
    const lines = candleFrame([
      line({ indicator: 0, name: "sma" }, point),
      line({ indicator: 1, name: "upper" }, point),
      line({ indicator: 1, name: "middle" }, point),
      line({ indicator: 1, name: "lower" }, point),
      line({ indicator: 2, name: "macd" }, point),
      line({ indicator: 2, name: "signal" }, point),
      line({ indicator: 2, name: "histogram" }, point),
    ]);
    const styles = indicatorStyles(chart, lines, styleColors);
    const [first, second] = colors.series;
    expect(
      styles.map((style) => [style.label, style.group, style.color, style.pane]),
    ).toStrictEqual([
      ["SMA 20", "SMA 20", first, null],
      ["BB 20 2 upper", "BB 20 2", second, null],
      ["BB 20 2 middle", "BB 20 2", second, null],
      ["BB 20 2 lower", "BB 20 2", second, null],
      ["MACD", "MACD 12 26 9", first, 0],
      ["Signal", "MACD 12 26 9", second, 0],
      ["Histogram", "MACD 12 26 9", first, 0],
    ]);
    expect(styles.map((style) => [style.columns, style.dashed])).toStrictEqual([
      [false, false],
      [false, false],
      [false, true],
      [false, false],
      [false, false],
      [false, false],
      [true, false],
    ]);
    // Over a line chart of one series, overlays start after it.
    expect(indicatorStyles(chart, lines, { ...styleColors, plotted: 1 })[0]?.color).toBe(second);
  });

  test("keeps each series' colour in a pane shared by several, dashing the second line, and ties lines to their series", () => {
    const chart = { ...candleChart([{ kind: "macd" }], "line"), y: ["close"] };
    const point: readonly (readonly [number, number])[] = [[0, 1]];
    const both = candleFrame([
      line({ indicator: 0, name: "macd", series: "AAPL" }, point),
      line({ indicator: 0, name: "signal", series: "AAPL" }, point),
      line({ indicator: 0, name: "macd", series: "MSFT" }, point),
      line({ indicator: 0, name: "signal", series: "MSFT" }, point),
    ]);
    const styles = indicatorStyles(chart, both, { ...styleColors, plotted: 2 });
    expect(
      styles.map((style) => [style.label, style.color, style.dashed, style.follows]),
    ).toStrictEqual([
      ["MACD AAPL", colors.series[0], false, "close AAPL"],
      ["Signal AAPL", colors.series[0], true, "close AAPL"],
      ["MACD MSFT", colors.series[1], false, "close MSFT"],
      ["Signal MSFT", colors.series[1], true, "close MSFT"],
    ]);
  });

  test("keeps panes between a fifth and two fifths of the height", () => {
    expect([paneHeight(0, 400), paneHeight(1, 400), paneHeight(1, 1000)]).toStrictEqual([
      0, 80, 140,
    ]);
    // Five panes in 400 pixels share three fifths of it; four in 160 would be too short to read, so there are none.
    expect(paneHeight(5, 400)).toBeCloseTo(240 / 5 - 10);
    expect(paneHeight(4, 160)).toBe(0);
  });

  test("fits each pane's range, and labels no tick at a pane's very top", () => {
    const [rsi, macd, volume] = paneSpecs(
      candleChart([{ kind: "rsi" }, { kind: "macd" }, { kind: "volume" }]),
    );
    expect(rsi === undefined ? null : paneDomain(rsi, [55, 60], 80)).toStrictEqual([0, 100]);
    const [low, high] = macd === undefined ? [1, 0] : paneDomain(macd, [2, 7], 80);
    expect(low).toBeLessThanOrEqual(0);
    expect(high).toBeGreaterThanOrEqual(7);
    expect(volume === undefined ? null : paneDomain(volume, [3000, 1000], 80)[0]).toBe(0);
    const box = { height: 80, width: 300, x: 0, y: 100 };
    expect(paneScale([0, 100], box).ticks.every((tick) => tick.px >= box.y + 8)).toBe(true);
  });
});

describe("panes and overlays in the draw model", () => {
  const chart = candleChart([
    { kind: "bollinger" },
    { kind: "rsi" },
    { kind: "macd" },
    { kind: "volume" },
  ]);
  const lines = candleFrame([
    line(
      { indicator: 0, name: "upper" },
      days.map((day) => [day, 20]),
    ),
    line(
      { indicator: 0, name: "middle" },
      days.map((day) => [day, 11]),
    ),
    line(
      { indicator: 0, name: "lower" },
      days.map((day) => [day, 2]),
    ),
    line(
      { indicator: 1, name: "rsi" },
      days.map((day) => [day, 40 + day]),
    ),
    line(
      { indicator: 2, name: "macd" },
      days.map((day) => [day, day - 5]),
    ),
    line(
      { indicator: 2, name: "signal" },
      days.map((day) => [day, 0]),
    ),
    line(
      { indicator: 2, name: "histogram" },
      days.map((day) => [day, day - 5]),
    ),
  ]);
  const drawn = model(chart, lines);

  test("stacks the panes under the price on the same x axis, with the x axis under the last", () => {
    expect(drawn.panes.map((pane) => pane.title)).toStrictEqual([
      "RSI 14",
      "MACD 12 26 9",
      "Volume",
    ]);
    const plots = [drawn.plot, ...drawn.panes.map((pane) => pane.plot)];
    const bottoms = plots.map((plot) => plot.y + plot.height);
    expect(drawn.panes.every((pane, i) => pane.plot.y > (bottoms[i] ?? 0))).toBe(true);
    expect(plots.every((plot) => plot.x === drawn.plot.x && plot.width === drawn.plot.width)).toBe(
      true,
    );
    expect(plotBottom(drawn)).toBe(bottoms.at(-1));
    expect(plotBottom(drawn)).toBeLessThanOrEqual(drawn.height - 20);
    expect(drawn.panes[0]?.guides).toHaveLength(2);
  });

  test("widens the price's scale to hold the bands, and washes between them", () => {
    const [low, high] = drawn.yAxes[0]?.scale.domain ?? [0, 0];
    expect(low).toBeLessThanOrEqual(2);
    expect(high).toBeGreaterThanOrEqual(20);
    expect(marksOf(drawn.marks, "band")).toHaveLength(1);
    expect(marksOf(drawn.marks, "line").filter((mark) => mark.dashed)).toHaveLength(1);
    expect(drawn.legend.map((entry) => entry.label)).toStrictEqual(["BB 20 2"]);
  });

  test("draws MACD's histogram up and down from zero, and volume in each candle's direction", () => {
    const [, macd, volume] = drawn.panes;
    // Days 5 to 9 are at or above zero, 0 to 4 below it.
    const columns = marksOf(macd?.marks ?? [], "columns");
    expect(columns.map((mark) => [mark.color, mark.rects.length / 4])).toStrictEqual([
      [colors.up, 5],
      [colors.down, 5],
    ]);
    const bars = marksOf(volume?.marks ?? [], "columns");
    expect(bars.map((mark) => [mark.color, mark.rects.length / 4])).toStrictEqual([
      [colors.up, 1],
      [colors.down, 1],
    ]);
    // The rising week traded three times the falling one.
    expect((bars[0]?.rects[3] ?? 0) / (bars[1]?.rects[3] ?? 1)).toBeCloseTo(3);
  });

  test("leaves a hidden overlay out of the plot and its scale", () => {
    const hidden = model({ ...chart, hidden: ["BB 20 2"] }, lines);
    expect(marksOf(hidden.marks, "band")).toHaveLength(0);
    expect(hidden.yAxes[0]?.scale.domain[1]).toBeLessThan(20);
    expect(hidden.legend.map((entry) => [entry.label, entry.hidden])).toStrictEqual([
      ["BB 20 2", true],
    ]);
  });

  test("reads each indicator at the last day of the candle under the crosshair", () => {
    // Anywhere in the second week reads day 9, the day its close comes from.
    const rows = indicatorRows(lines, drawn, { hidden: [], x: 6.2 });
    expect(rows.map((row) => [row.label, row.value])).toStrictEqual([
      ["BB 20 2 upper, day 9", "20.00"],
      ["BB 20 2 middle, day 9", "11.00"],
      ["BB 20 2 lower, day 9", "2.00"],
      ["RSI 14, day 9", "49.00"],
      ["MACD, day 9", "4.00"],
      ["Signal, day 9", "0.00"],
      ["Histogram, day 9", "4.00"],
    ]);
    expect(indicatorRows(lines, drawn, { hidden: ["BB 20 2"], x: 1 })[0]?.label).toBe(
      "RSI 14, day 4",
    );
    // Late in the first week is still the first week: its candle, its last day.
    expect(indicatorRows(lines, drawn, { hidden: ["BB 20 2"], x: 4.8 })[0]?.label).toBe(
      "RSI 14, day 4",
    );
  });

  test("washes between the bands only where neither has a gap", () => {
    const gappy = days.map((day): readonly [number, number] => [day, day === 5 ? Number.NaN : 20]);
    const low = days.map((day): readonly [number, number] => [day, day === 5 ? Number.NaN : 2]);
    const bands = candleFrame([
      line({ indicator: 0, name: "upper" }, gappy),
      line({ indicator: 0, name: "middle" }, gappy),
      line({ indicator: 0, name: "lower" }, low),
    ]);
    // Two washes, one each side of the gap, none across it.
    const washes = marksOf(model(candleChart([{ kind: "bollinger" }]), bands).marks, "band");
    expect(washes).toHaveLength(2);
    expect(washes.every((wash) => wash.upper.length === wash.lower.length)).toBe(true);
  });
});
