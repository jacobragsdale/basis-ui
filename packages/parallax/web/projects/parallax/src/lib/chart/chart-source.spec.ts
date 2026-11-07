import { describe, expect, it } from "vitest";

import { parseLayout } from "../layout";
import { computedPart, shapeOf, withPieLimit } from "./chart-source";

describe("computedPart and shapeOf", () => {
  const candles = parseLayout({ dataset: "prices", chart: { kind: "candlestick", x: "date", ohlc: { open: "o", high: "h", low: "l", close: "c" }, indicators: [{ kind: "sma" }, { kind: "rsi" }] } });
  const chart = candles.chart;
  if (chart === null) {
    throw new Error("no chart");
  }

  it("changes shape when the indicators change, so an old frame's lines never meet a new list", () => {
    // A frame names its indicator lines by their place in the list: after this change its line 0 would read as the RSI.
    const fewer = { ...candles, chart: { ...chart, indicators: [chart.indicators[1] ?? { kind: "volume" as const }] } };
    expect(shapeOf(fewer)).not.toBe(shapeOf(candles));
    expect(shapeOf({ ...candles, chart: { ...chart, volume: "volume" } })).not.toBe(shapeOf(candles));
    // Zooming and hiding change neither what is computed nor its shape.
    const zoomed = { ...candles, chart: { ...chart, range: { from: 1, to: 2 }, hidden: ["SMA 20"] } };
    expect(computedPart(zoomed)).toBe(computedPart(candles));
    expect(shapeOf(zoomed)).toBe(shapeOf(candles));
  });
});

describe("withPieLimit", () => {
  it("has the engine put a pie's groups past the seventh in one Other slice, unless the layout sets its own top-N", () => {
    const pie = parseLayout({ dataset: "book", group_by: ["sector"], measures: [{ column: "mv", aggregate: "sum" }], chart: { kind: "pie" } });
    expect(withPieLimit(pie)?.top_n).toEqual({ n: 7, measure: 0, largest: true, other: true });
    const own = { ...pie, top_n: { n: 3, measure: 0, largest: true, other: false } };
    expect(withPieLimit(own)).toBe(own);
    const bars = parseLayout({ dataset: "book", group_by: ["sector"], measures: [{ column: "mv", aggregate: "sum" }], chart: { kind: "bar" } });
    expect(withPieLimit(bars)).toBe(bars);
  });
});
