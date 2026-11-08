import { describe, expect, test } from "vite-plus/test";

import { paintChart } from "#chart/paint.ts";
import { defaultTheme } from "#theme/read.ts";

import { chartOf, frameOf, modelOf, threeCandles } from "./chart-pointer-inputs.ts";

/** One call or property set on a context, by name, with its arguments or value. */
type Step = readonly [string, ...unknown[]];

/** Whether `value` takes a painter's calls as a context does: the recorder below answers every one. */
function paintsLikeContext(value: unknown): value is CanvasRenderingContext2D {
  return value instanceof Object && "measureText" in value;
}

/** A context that records what is painted on it, measuring text at 6 px a character. */
function recorder(): { readonly ctx: CanvasRenderingContext2D; readonly steps: Step[] } {
  const steps: Step[] = [];
  const target = {
    measureText: (text: string): { readonly width: number } => ({ width: text.length * 6 }),
  };
  const ctx: unknown = new Proxy(target, {
    get: (object, name) =>
      name === "measureText"
        ? object.measureText
        : (...args: unknown[]): void => {
            steps.push([String(name), ...args]);
          },
    set: (_object, name, value) => {
      steps.push([`${String(name)}=`, value]);
      return true;
    },
  });
  if (!paintsLikeContext(ctx)) {
    throw new TypeError("The recorder is no context.");
  }
  return { ctx, steps };
}

const theme = defaultTheme("light");

describe(paintChart, () => {
  test("says what is missing instead of a plot, on the surface's colour", () => {
    const { ctx, steps } = recorder();
    paintChart(ctx, modelOf(chartOf({ kind: "line" }), {}), { theme });
    expect(steps.slice(0, 2)).toStrictEqual([
      ["fillStyle=", theme.background],
      ["fillRect", 0, 0, 400, 300],
    ]);
    expect(steps.filter(([name]) => name === "fillText").map(([, text]) => text)).toStrictEqual([
      "Loading…",
    ]);
  });

  test("draws a pie without axes, and candles with them", () => {
    const pie = recorder();
    const categories = {
      categories: ["Equity", "Bond"],
      keys: ["Equity", "Bond"],
      others: [false, false],
      series: [{ label: "mv", texts: ["60", "40"], total: "100", values: [60, 40] }],
    };
    paintChart(pie.ctx, modelOf(chartOf({ kind: "pie" }), { categories }), { theme });
    const candles = recorder();
    const frame = frameOf({ candles: threeCandles, kind: "candles" }, { xTo: 3 });
    paintChart(candles.ctx, modelOf(chartOf({ kind: "candlestick" }), { frame }), { theme });
    const gridlines = (steps: readonly Step[]): number =>
      steps.filter(([name, value]) => name === "strokeStyle=" && value === theme.gridline).length;
    expect([gridlines(pie.steps), gridlines(candles.steps)]).toStrictEqual([0, 1]);
  });

  test("moves an x label at the plot's end in from the canvas's edge rather than leaving it out", () => {
    const { ctx, steps } = recorder();
    const model = modelOf(chartOf({ kind: "line" }), {
      frame: frameOf({ kind: "series", series: [] }),
    });
    const ticks = [
      { label: "1M", px: 2 },
      { label: "10Y", px: 200 },
      { label: "30Y", px: model.width - 1 },
    ];
    paintChart(ctx, { ...model, empty: null, xTicks: ticks }, { theme });
    const written = steps.filter(
      ([name, text]) => name === "fillText" && ticks.some((tick) => tick.label === text),
    );
    // At 6 px a character, the first and last are kept whole on the 400 px canvas, against its edges.
    expect(written.map(([, text, x]) => [text, x])).toStrictEqual([
      ["1M", 6],
      ["10Y", 200],
      ["30Y", model.width - 9],
    ]);
  });
});
