import { describe, expect, test } from "vite-plus/test";

import { describeChart } from "#chart/describe.ts";
import { dotPicked, markAt } from "#chart/marks-at.ts";
import { radiusOf } from "#chart/model-points.ts";
import { chartWords } from "#chart/summary.ts";
import type { ChartContent, FitLineData, PointSeries } from "#frame/chart-data.ts";
import { parseLayout } from "#layout/layout.ts";
import type { LayoutInput } from "#layout/layout.ts";
import { chartColors } from "#theme/charts.ts";

import { chartOf, frameOf, marksOf, modelOf } from "./chart-model-inputs.ts";

const colors = chartColors.light;

/** A relative-value scatter, without its id, and with one. */
const unnamed = {
  fit: "fitted_spread_bp",
  kind: "scatter",
  series: "sector",
  size: "dv01_usd",
  tooltip: ["issuer", "rating"],
  x: "duration",
  y: ["spread_bp"],
} satisfies NonNullable<LayoutInput["chart"]>;
const bonds = { ...unnamed, id: "cusip" } satisfies NonNullable<LayoutInput["chart"]>;

/** A series of dots at x 1, 2, 3 and so on, with sizes as shares, and every value's text as the engine would write it;
 * `named`, each with an id. */
function pointsOf(
  label: string,
  {
    values,
    sizes,
    named = true,
  }: {
    readonly values: readonly number[];
    readonly sizes: readonly number[];
    readonly named?: boolean;
  },
): PointSeries {
  const texts = (prefix: string): readonly string[] =>
    values.map((_value, i) => `${prefix}${String(i)}`);
  const ids = values.map((_value, i) => (named ? `${label}-${String(i)}` : null));
  return {
    fitText: texts("fit "),
    idJson: ids.map((id) => (id === null ? null : JSON.stringify(id))),
    idText: ids,
    label,
    size: Float64Array.from(sizes),
    sizeText: texts("dv01 "),
    tooltip: [texts("issuer "), texts("rating ")],
    x: Float64Array.from(values, (_value, i) => i + 1),
    xText: texts("dur "),
    y: Float64Array.from(values),
    yText: values.map(String),
  };
}

function fitOf(label: string, values: readonly number[]): FitLineData {
  return {
    label,
    x: Float64Array.from(values, (_value, i) => i + 1),
    xText: values.map(String),
    y: Float64Array.from(values),
    yText: values.map(String),
  };
}

const content: ChartContent = {
  kind: "points",
  series: [
    pointsOf("Energy", { sizes: [1, 0], values: [100, 120] }),
    pointsOf("Utilities", { sizes: [Number.NaN], values: [80] }),
  ],
  yFrom: 80,
  yTo: 120,
};
const frame = {
  ...frameOf(content, { xFrom: 1, xTo: 2 }),
  fits: [fitOf("fit Energy", [105, 115]), fitOf("fit Utilities", [85, 90])],
};

describe("the draw model of a scatter's dots", () => {
  test("draws each series' dots in its colour, sized by their share of the largest, with a legend of dots", () => {
    const model = modelOf(bonds, { frame });
    const [energy, utilities] = marksOf(model.marks, "dots");
    expect([energy?.color, utilities?.color]).toStrictEqual([colors.series[0], colors.series[1]]);
    // The largest share takes the largest dot, a share of none the smallest, and no size the plain one.
    expect([...(energy?.radius ?? [])]).toStrictEqual([12, 2.5]);
    expect([...(utilities?.radius ?? [])]).toStrictEqual([3.5]);
    expect(model.legend.map((entry) => [entry.label, entry.shape])).toStrictEqual([
      ["Energy", "dot"],
      ["Utilities", "dot"],
    ]);
    expect(model.x).not.toBeNull();
  });

  test("keeps a dot at either end of the range whole inside the plot", () => {
    const model = modelOf(bonds, { frame });
    const { plot } = model;
    const edges = marksOf(model.marks, "dots").flatMap((mark) =>
      [...mark.x].map((x, dot) => [x - (mark.radius[dot] ?? 0), x + (mark.radius[dot] ?? 0)]),
    );
    expect(
      edges.every(([left = 0, right = 0]) => left >= plot.x && right <= plot.x + plot.width),
    ).toBe(true);
  });

  test("grows a dot's area, not its radius, in step with its share", () => {
    const [smallest, largest] = [2.5, 12];
    const area = (share: number): number => radiusOf(share, [smallest, largest]) ** 2;
    expect(area(0.5) - area(0)).toBeCloseTo((area(1) - area(0)) / 2);
    expect(radiusOf(2, [smallest, largest])).toBe(largest);
  });

  test("draws each series' fit line dashed under its dots, and hides it with its series", () => {
    const model = modelOf(bonds, { frame });
    expect(model.marks.map((mark) => mark.kind)).toStrictEqual(["line", "line", "dots", "dots"]);
    const [fit] = marksOf(model.marks, "line");
    expect([fit?.dashed, fit?.color, fit?.baseline]).toStrictEqual([true, colors.series[0], null]);
    const hidden = modelOf({ ...bonds, hidden: ["Energy"] }, { frame });
    expect(marksOf(hidden.marks, "line").map((line) => line.color)).toStrictEqual([
      colors.series[1],
    ]);
    expect(marksOf(hidden.marks, "dots").map((dots) => dots.points.label)).toStrictEqual([
      "Utilities",
    ]);
  });

  test("rings the selected dot and fades the rest, its own series' too", () => {
    const model = modelOf(bonds, { frame }, { selected: "Energy-1" });
    const [energy, utilities] = marksOf(model.marks, "dots");
    expect([energy?.selected, energy?.dim]).toStrictEqual([1, false]);
    expect([utilities?.selected, utilities?.dim]).toStrictEqual([-1, true]);
  });

  test("says so when the range holds no dots", () => {
    const empty: ChartContent = {
      kind: "points",
      series: [pointsOf("Energy", { sizes: [], values: [] })],
      yFrom: 0,
      yTo: 1,
    };
    expect(modelOf(bonds, { frame: frameOf(empty) }).empty).toBe("No data in this range");
  });
});

describe("reading and picking a dot", () => {
  const model = modelOf(bonds, { frame });
  const [energy] = marksOf(model.marks, "dots");
  const [x, y] = [energy?.x[0] ?? 0, energy?.y[0] ?? 0];

  test("reads the dot under the pointer: its id, then each value under its column's name", () => {
    const reading = markAt(model, x + 5, y + 5);
    expect(reading?.title).toBe("Energy-0");
    expect(reading?.rows.map((row) => [row.label, row.value])).toStrictEqual([
      ["spread_bp", "100"],
      ["duration", "dur 0"],
      ["dv01_usd", "dv01 0"],
      ["fitted_spread_bp", "fit 0"],
      ["issuer", "issuer 0"],
      ["rating", "rating 0"],
    ]);
    expect(reading?.rows[0]?.color).toBe(colors.series[0]);
    expect(reading?.crosshair).toBeNull();
    // Past the dot and a few pixels more, nothing reads.
    expect(markAt(model, x + 20, y)).toBeNull();
  });

  test("picks a dot by its id's text and exact value, and nothing where there is no dot", () => {
    expect(dotPicked(model, x, y)).toStrictEqual({ label: "Energy-0", value: "Energy-0" });
    expect(dotPicked(model, model.plot.x, model.plot.y)).toBeNull();
    const withoutIds: ChartContent = {
      kind: "points",
      series: [pointsOf("Energy", { named: false, sizes: [1, 0], values: [100, 120] })],
      yFrom: 80,
      yTo: 120,
    };
    const nameless = modelOf(unnamed, { frame: { ...frame, content: withoutIds } });
    expect(dotPicked(nameless, x, y)).toBeNull();
    // Without an id, a dot's tooltip is titled with its series.
    expect(markAt(nameless, x, y)?.title).toBe("Energy");
  });
});

describe("a scatter in words", () => {
  test("names it a scatter plot, whether it draws dots or a density", () => {
    expect(describeChart(parseLayout({ chart: bonds, dataset: "bonds" }))).toBe(
      "Scatter plot of spread_bp by sector from bonds",
    );
  });

  test("counts the dots and says where each series' lowest and highest are, by id", () => {
    const words = chartWords({
      categories: null,
      chart: chartOf(bonds),
      frame,
      unplaced: 0,
      zoomed: false,
    });
    expect(words).toBe(
      "3 dots. Energy: 2 dots, from 100 (Energy-0) to 120 (Energy-1). Utilities: 1 dot, at 80 (Utilities-0)",
    );
  });
});
