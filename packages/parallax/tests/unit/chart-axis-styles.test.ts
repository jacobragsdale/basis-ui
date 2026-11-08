import { describe, expect, test } from "vite-plus/test";

import { axisFormats, styleOf, styledTicks } from "#chart/axis-styles.ts";
import { linearScale } from "#chart/scale.ts";
import { parseLayout } from "#layout/layout.ts";

import { modelOf, seriesFrame, seriesOf } from "./chart-model-inputs.ts";

const nbsp = "\u00A0";

/** The axis style a format of the price column gives. */
function style(format: object): unknown {
  return styleOf(parseLayout({ formats: { price: format } }).formats["price"]);
}

/** The labels of about `count` ticks across `domain`, in a column's format. */
function labels(domain: readonly [number, number], count: number, format: object): string[] {
  const priced = styleOf(parseLayout({ formats: { price: format } }).formats["price"]);
  return styledTicks(linearScale(domain, [0, 100]), count, priced).map((tick) => tick.label);
}

describe("value axes in a column's style", () => {
  test("take their style from the column's format", () => {
    expect(style({ thirty_seconds: "thirty_seconds" })).toStrictEqual({
      kind: "thirty-seconds",
      precision: "thirty-seconds",
    });
    expect(style({ bps: true })).toStrictEqual({ kind: "bps" });
    expect(style({ bps: false })).toStrictEqual({ kind: "plain" });
    expect(style({ abbreviate: "millions", suffixes: "par" })).toStrictEqual({ kind: "par" });
    expect(style({ decimals: 2, percent: true })).toStrictEqual({ kind: "percent" });
    expect(style({ decimals: 2 })).toStrictEqual({ kind: "plain" });
    expect(styleOf(null)).toStrictEqual({ kind: "plain" });
  });

  test("label a price in 32nds on steps of a 32nd's halvings, no finer than the column shows", () => {
    expect(labels([99, 100.5], 4, { thirty_seconds: "halves" })).toStrictEqual([
      "99-00",
      "99-16",
      "100-00",
      "100-16",
    ]);
    // Over a narrow range, eighths step by eighths of a 32nd; halves stop at half a 32nd.
    expect(labels([99.5, 99.51], 4, { thirty_seconds: "eighths" })).toStrictEqual([
      "99-16",
      "99-161",
      "99-162",
    ]);
    expect(labels([99.5, 99.51], 4, { thirty_seconds: "halves" })).toStrictEqual(["99-16"]);
  });

  test("label rates in basis points with as many decimals as the step needs", () => {
    expect(labels([0, 0.01], 4, { bps: true })).toStrictEqual(
      ["0", "50", "100"].map((bp) => `${bp}${nbsp}bp`),
    );
    expect(labels([0, 0.0001], 4, { bps: true })).toStrictEqual(
      ["0.0", "0.5", "1.0"].map((bp) => `${bp}${nbsp}bp`),
    );
  });

  test("label a yield written as a percentage in percent", () => {
    // As many decimals as the step needs, whatever the cells show.
    expect(labels([0.04, 0.07], 4, { decimals: 3, percent: true })).toStrictEqual([
      "4%",
      "5%",
      "6%",
      "7%",
    ]);
    expect(labels([0.05, 0.051], 4, { percent: true })).toStrictEqual(["5.00%", "5.05%", "5.10%"]);
  });

  test("label par amounts with M, MM and BN", () => {
    expect(labels([0, 2e7], 4, { abbreviate: "millions", suffixes: "par" })).toStrictEqual([
      "0",
      "5MM",
      "10MM",
      "15MM",
      "20MM",
    ]);
    expect(labels([0, 4e4], 4, { abbreviate: "thousands", suffixes: "par" })).toStrictEqual([
      "0",
      "10M",
      "20M",
      "30M",
      "40M",
    ]);
    // Steps of 200 million read in millions to the end, as a desk writes them, not 0.2BN.
    expect(labels([0, 1e9], 5, { abbreviate: "billions", suffixes: "par" })).toStrictEqual([
      "0",
      "200MM",
      "400MM",
      "600MM",
      "800MM",
      "1,000MM",
    ]);
    // A step of half a million reads in thousands.
    expect(labels([0, 2e6], 4, { abbreviate: "millions", suffixes: "par" })).toStrictEqual([
      "0",
      "500M",
      "1,000M",
      "1,500M",
      "2,000M",
    ]);
  });

  test("reach a chart's value axes from the layout's formats, and a measure's own format first", () => {
    const layout = parseLayout({
      formats: { par: { abbreviate: "millions", suffixes: "par" }, spread: { bps: true } },
      measures: [{ aggregate: "sum", column: "par", format: { thirty_seconds: "eighths" } }],
    });
    const { formats, measureFormat } = axisFormats(layout);
    expect(formats?.["spread"]?.bps).toBe(true);
    expect(measureFormat?.thirty_seconds).toBe("eighths");
    expect(axisFormats(null)).toStrictEqual({ formats: {}, measureFormat: null });
    const model = modelOf(
      { kind: "line", x: "date", y: ["spread"] },
      { frame: seriesFrame([seriesOf("spread", [0.001, 0.003])]) },
      { formats: formats ?? {} },
    );
    expect(model.yAxes[0]?.ticks.every((tick) => tick.label.endsWith(`${nbsp}bp`))).toBe(true);
    // A comparison's percentage changes keep the plain axis.
    const compared = modelOf(
      { compare: true, kind: "line", x: "date", y: ["spread"] },
      { frame: seriesFrame([seriesOf("spread", [0.001, 0.003])]) },
      { formats: formats ?? {} },
    );
    expect(compared.yAxes[0]?.ticks.every((tick) => tick.label.endsWith("%"))).toBe(true);
  });
});
