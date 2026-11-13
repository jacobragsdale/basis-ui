import { describe, expect, test } from "vite-plus/test";

import { chartSummary } from "#chart/summary.ts";
import type { ChartContent, PointSeries } from "#frame/chart-data.ts";

import { chartOf, frameOf, marksOf, modelOf } from "./chart-model-inputs.ts";

/** Bin counts with long tails of single rows, which a log axis is used to show. */
const counts = [1, 1, 40, 900, 40, 1, 1, 0, 0, 1];

const histogram: ChartContent = {
  kind: "histogram",
  series: [
    {
      counts,
      from: Float64Array.from(counts, (_count, bin) => bin),
      fromText: counts.map((_count, bin) => String(bin)),
      label: "trades",
      to: Float64Array.from(counts, (_count, bin) => bin + 1),
      toText: counts.map((_count, bin) => String(bin + 1)),
    },
  ],
};

/** A scatter's dots at `ys`, one per x. */
function dotsAt(ys: readonly number[]): PointSeries {
  const texts = ys.map(String);
  return {
    fitText: texts,
    idJson: ys.map(() => null),
    idText: ys.map(() => null),
    label: "spread",
    size: Float64Array.from(ys, () => Number.NaN),
    sizeText: texts,
    tooltip: [],
    x: Float64Array.from(ys, (_y, i) => i + 1),
    xText: texts,
    y: Float64Array.from(ys),
    yText: texts,
  };
}

describe("log axes", () => {
  test("give a histogram's bin of one row a height, as its tails need", () => {
    const model = modelOf(
      { kind: "histogram", log_y: true, x: "size" },
      { frame: frameOf(histogram, { xTo: counts.length }) },
    );
    const heights = marksOf(model.marks, "rect").map((rect) => rect.rect.height);
    // Every bin with a row is drawn, the single rows lowest.
    expect(heights).toHaveLength(counts.filter((count) => count > 0).length);
    expect(heights.every((height) => height > 1)).toBe(true);
    expect(model.yAxes[0]?.scale.domain[0]).toBeLessThan(1);
  });

  test("fit a scatter's log axis to its positive dots, though a dot sits at or below zero", () => {
    const ys = [-0.0005, 0.0004, 0.002, 0.008, 0.05];
    const content: ChartContent = {
      kind: "points",
      series: [dotsAt(ys)],
      yFrom: -0.0005,
      yTo: 0.05,
    };
    const model = modelOf(
      { kind: "scatter", log_y: true, x: "duration", y: ["spread"] },
      { frame: frameOf(content, { xFrom: 1, xTo: ys.length }) },
    );
    const { plot } = model;
    const ysDrawn: number[] = [];
    for (const dots of marksOf(model.marks, "dots")) {
      ysDrawn.push(...dots.y);
    }
    const inPlot = ysDrawn.filter((y) => y >= plot.y && y <= plot.y + plot.height);
    // The four positive dots are in the plot; the one below zero has no place on a log axis.
    expect(inPlot.length).toBeGreaterThanOrEqual(4);
    expect(model.yAxes[0]?.scale.domain).toStrictEqual([0.0001, 0.1]);
  });

  test("say a density's axis is linear, though the scatter asked for a log one", () => {
    const content: ChartContent = {
      columns: 1,
      counts: Uint32Array.from([9000]),
      kind: "density",
      rows: 1,
      yFrom: 1,
      yTo: 100,
    };
    const summary = chartSummary({
      categories: null,
      chart: chartOf({ kind: "scatter", log_y: true, x: "duration", y: ["spread"] }),
      frame: frameOf(content),
      unplaced: 0,
      zoomed: false,
    });
    expect(summary).toMatch(/, on a linear axis$/u);
  });
});
