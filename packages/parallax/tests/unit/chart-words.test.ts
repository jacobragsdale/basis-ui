import { describe, expect, test } from "vite-plus/test";

import { groupOf } from "#chart/scene-inputs.ts";
import { chartWords } from "#chart/summary.ts";
import type { ChartContent } from "#frame/chart-data.ts";
import { parseLayout } from "#layout/layout.ts";
import type { LayoutInput } from "#layout/layout.ts";

import { chartOf, frameOf, seriesFrame, seriesOf } from "./chart-model-inputs.ts";

/** The text alternative of `chart` over a frame of `content`. */
function wordsOf(chart: NonNullable<LayoutInput["chart"]>, content: ChartContent): string {
  return chartWords({
    categories: null,
    chart: chartOf(chart),
    frame: frameOf(content),
    unplaced: 0,
    zoomed: false,
  });
}

const histogram: ChartContent = {
  kind: "histogram",
  series: [
    {
      counts: [2, 9, 4],
      from: Float64Array.from([0, 10, 20]),
      fromText: ["0", "10", "20"],
      label: "trades",
      to: Float64Array.from([10, 20, 30]),
      toText: ["10", "20", "30"],
    },
  ],
};

describe("a chart's text alternative", () => {
  test("reads a histogram's rows and its fullest bin, as the engine wrote its bounds", () => {
    expect(wordsOf({ kind: "histogram", x: "size" }, histogram)).toBe(
      "3 bins. trades: 15 rows, the most, 9, from 10 to 20",
    );
  });

  test("reads a density's dots and the x axis it spans", () => {
    const density: ChartContent = {
      columns: 2,
      counts: Uint32Array.from([6000, 4000]),
      kind: "density",
      rows: 1,
      yFrom: 0,
      yTo: 1,
    };
    expect(wordsOf({ kind: "scatter", x: "duration", y: ["spread"] }, density)).toMatch(
      /\. 10,000 dots drawn as a density, from Mid to Mid$/u,
    );
  });

  test("reads the series shown, not those hidden from the legend", () => {
    const frame = seriesFrame([seriesOf("ATLS", [1, 2]), seriesOf("BCN", [3, 4])]);
    const words = chartWords({
      categories: null,
      chart: chartOf({ hidden: ["BCN"], kind: "line" }),
      frame,
      unplaced: 0,
      zoomed: false,
    });
    expect([words.includes("ATLS:"), words.includes("BCN:")]).toStrictEqual([true, false]);
  });
});

/** A layout's chart section. */
type Chart = NonNullable<LayoutInput["chart"]>;

/** The crosshair group of a chart of the prices, by default. */
function group(chart: Chart): string | null {
  return groupOf(parseLayout({ chart, dataset: "prices" }));
}

describe("a chart's crosshair group", () => {
  test("is shared by charts whose axes place times alike, and not by those on another calendar or session", () => {
    const trading = { axis: "trading", kind: "line", x: "date", y: ["close"] } satisfies Chart;
    expect(group(trading)).toBe(group({ ...trading, calendar: "nyse" }));
    expect(group(trading)).not.toBe(group({ ...trading, calendar: "sifma" }));
    expect(group(trading)).not.toBe(
      group({ ...trading, session: { closes: "13:00", opens: "09:30" } }),
    );
    const tenor = { axis: "tenor", kind: "line", x: "tenor", y: ["yield"] } satisfies Chart;
    expect(group(tenor)).not.toBe(group({ ...tenor, tenor_spacing: "length" }));
  });
});
