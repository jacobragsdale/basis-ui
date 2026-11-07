import { describe, expect, test } from "vite-plus/test";

import type { CategoryData } from "#chart/model-types.ts";
import { chartColors } from "#theme/charts.ts";

import { categoriesOf, marksOf, modelOf, muted } from "./chart-model-inputs.ts";

const colors = chartColors.light;

const groups = categoriesOf(
  ["Atlas", "Cobalt"],
  [
    { label: "Equity", texts: ["10.00", "(4.00)"], values: [10, -4] },
    { label: "Bond", texts: ["5.00", "6.00"], values: [5, 6] },
  ],
);

/** A bar chart of one series over `names`, `width` pixels wide. */
function labelled(names: readonly string[], width = 400): ReturnType<typeof modelOf> {
  const ones = { label: "n", texts: names.map(() => "1"), values: names.map(() => 1) };
  return modelOf({ kind: "bar" }, { categories: categoriesOf(names, [ones]) }, { width });
}

describe("the draw model of bar charts and heatmaps", () => {
  test("caps bars at 56 px, rounds their data ends and keeps the baseline square", () => {
    const model = modelOf({ kind: "bar" }, { categories: groups });
    const rects = marksOf(model.marks, "rect");
    expect(rects).toHaveLength(4);
    expect(rects.every((rect) => rect.rect.width <= 56)).toBe(true);
    expect(rects.find((rect) => rect.hit.rows[0]?.value === "(4.00)")?.round).toBe("bottom");
    expect(model.xTicks.map((tick) => tick.label)).toStrictEqual(["Atlas", "Cobalt"]);
    // Bars grow from zero.
    expect(model.yAxes[0]?.scale.domain[0]).toBeLessThanOrEqual(-4);
  });

  test("labels bars with their values and leaves room for them past the longest, except stacked bars", () => {
    const rects = marksOf(modelOf({ kind: "bar" }, { categories: groups }).marks, "rect");
    expect(rects.every((rect) => rect.label?.text === rect.hit.rows[0]?.value)).toBe(true);
    // The tallest bar stops a line short of the plot's top, where its label goes.
    const plotTop = modelOf({ kind: "bar" }, { categories: groups }).plot.y;
    expect(Math.min(...rects.map((rect) => rect.rect.y)) - plotTop).toBeGreaterThanOrEqual(16);
    const stacked = modelOf({ kind: "bar", stacked: true }, { categories: groups });
    expect(marksOf(stacked.marks, "rect").every((rect) => rect.label === undefined)).toBe(true);
    const plain = modelOf({ kind: "bar", labels: false }, { categories: groups });
    expect(marksOf(plain.marks, "rect").every((rect) => rect.label === undefined)).toBe(true);
  });

  test("lays short category labels level, and breaks two-word ones onto two lines", () => {
    const level = labelled(["A", "B", "C"]).xTicks;
    expect(level.every((tick) => tick.rotated === undefined && tick.lines === undefined)).toBe(
      true,
    );
    // Two words each too wide for their share break onto two lines.
    const wrapped = labelled(
      ["North America", "Asia Pacific", "Latin America", "Middle East"],
      300,
    );
    expect(wrapped.xTicks.map((tick) => tick.lines)).toStrictEqual([
      ["North", "America"],
      ["Asia", "Pacific"],
      ["Latin", "America"],
      ["Middle", "East"],
    ]);
  });

  test("turns long category labels, and thins them only when turned ones would touch", () => {
    const sectors = [
      "Communication Services",
      "Consumer Discretionary",
      "Consumer Staples",
      "Information Technology",
      "Real Estate",
      "Utilities",
    ];
    const turned = labelled(sectors);
    expect(turned.xTicks).toHaveLength(sectors.length);
    expect(turned.xTicks.every((tick) => tick.rotated === true)).toBe(true);
    expect(turned.xLabelRoom).toBeGreaterThan(60);
    // So many that even turned labels would touch: every other one is drawn.
    const many = labelled(Array.from({ length: 40 }, (_name, i) => `Category number ${String(i)}`));
    expect(many.xTicks.length).toBeLessThan(40);
  });

  test("stacks segments with a surface gap, and lays bars across when horizontal", () => {
    const stacked = modelOf({ kind: "bar", stacked: true }, { categories: groups });
    const [equity, bond] = marksOf(stacked.marks, "rect")
      .filter((rect) => rect.hit.title === "Atlas")
      .map((rect) => rect.rect);
    // Bond sits on top of equity, two pixels apart.
    expect((equity?.y ?? 0) - ((bond?.y ?? 0) + (bond?.height ?? 0))).toBeCloseTo(2);
    const across = modelOf({ horizontal: true, kind: "bar" }, { categories: groups });
    const rects = marksOf(across.marks, "rect");
    expect(rects.every((rect) => rect.rect.height <= 56)).toBe(true);
    expect(rects.find((rect) => rect.hit.rows[0]?.value === "10.00")?.round).toBe("right");
    expect(across.yLabels.map((label) => label.label)).toStrictEqual(["Atlas", "Cobalt"]);
  });

  test("thins horizontal bar labels by line height", () => {
    const names = Array.from({ length: 80 }, (_name, i) => `T${String(i)}`);
    const many = categoriesOf(names, [{ label: "v", texts: [], values: names.map(() => 1) }]);
    const { yLabels } = modelOf({ horizontal: true, kind: "bar" }, { categories: many });
    const gaps = yLabels.slice(1).map((label, i) => label.px - (yLabels[i]?.px ?? 0));
    expect(yLabels.length).toBeGreaterThan(5);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(16);
  });

  test("says when a grouped view has no groups to show", () => {
    const model = modelOf({ kind: "bar" }, { categories: categoriesOf([], []) });
    expect(model.empty).toBe("No groups to show");
  });

  test("colours a heatmap on two arms around a neutral middle when values take both signs", () => {
    const both = categoriesOf(
      ["a", "b", "c"],
      [{ label: "x", texts: ["-8", "0", "8"], values: [-8, 0, 8] }],
    );
    const cells = marksOf(modelOf({ kind: "heatmap" }, { categories: both }).marks, "cell");
    expect(cells.map((cell) => cell.color)).toStrictEqual([
      colors.negativeRamp.at(-1),
      colors.middle,
      colors.ramp.at(-1),
    ]);
  });

  test("draws a heatmap of only losses on the negative arm, the deepest darkest", () => {
    const losses = categoriesOf(
      ["a", "b"],
      [{ label: "x", texts: ["-8", "-1"], values: [-8, -1] }],
    );
    const [deepest, shallow] = marksOf(
      modelOf({ kind: "heatmap" }, { categories: losses }).marks,
      "cell",
    );
    expect(deepest?.color).toBe(colors.negativeRamp.at(-1));
    expect(colors.negativeRamp.indexOf(shallow?.color ?? "")).toBeLessThan(
      colors.negativeRamp.length - 1,
    );
  });
});

const classes: CategoryData = {
  categories: ["Equity", "Bond", "Other"],
  keys: ["Equity", "Bond", null],
  others: [false, false, true],
  series: [
    { label: "sum(mv)", texts: ["60.00", "30.00", "10.00"], total: "100.00", values: [60, 30, 10] },
    {
      label: "sum(mv) as % of total",
      texts: ["60.00%", "30.00%", "10.00%"],
      total: "100.00%",
      values: [0.6, 0.3, 0.1],
    },
  ],
};

describe("the draw model of pies", () => {
  test("sizes each slice by the first measure, clockwise from twelve o'clock, with the engine's text", () => {
    const model = modelOf({ kind: "pie" }, { categories: classes });
    const slices = marksOf(model.marks, "slice");
    expect(slices.map((slice) => (slice.end - slice.start) / (2 * Math.PI))).toStrictEqual([
      expect.closeTo(0.6, 9),
      expect.closeTo(0.3, 9),
      expect.closeTo(0.1, 9),
    ]);
    expect(slices[0]?.start).toBeCloseTo(-Math.PI / 2);
    expect(slices.at(-1)?.end).toBeCloseTo((3 * Math.PI) / 2);
  });

  test("makes a donut by default, with the total in its hole, a muted Other and each share in the legend", () => {
    const model = modelOf({ kind: "pie" }, { categories: classes });
    const slices = marksOf(model.marks, "slice");
    expect(slices[0]?.inner).toBeGreaterThan(0);
    expect(model.centre).toStrictEqual({ label: "Total", value: "100.00" });
    // The tooltip reads every measure.
    expect(slices[1]?.hit.rows.map((row) => row.value)).toStrictEqual(["30.00", "30.00%"]);
    // "Other" is muted and can't be selected; the legend notes each share.
    expect([slices[2]?.color, slices[2]?.category]).toStrictEqual([muted, null]);
    expect(model.legend.map((entry) => entry.note)).toStrictEqual(["60.00%", "30.00%", "10.00%"]);
  });

  test("draws a whole pie without a hole, and drops a hidden slice and the total that no longer adds up", () => {
    const pie = modelOf({ donut: false, kind: "pie" }, { categories: classes });
    expect(marksOf(pie.marks, "slice").every((slice) => slice.inner === 0)).toBe(true);
    expect(pie.centre).toBeNull();
    const hidden = modelOf({ hidden: ["Equity"], kind: "pie" }, { categories: classes });
    const slices = marksOf(hidden.marks, "slice");
    expect(slices.map((slice) => slice.hit.title)).toStrictEqual(["Bond", "Other"]);
    expect((slices[0]?.end ?? 0) - (slices[0]?.start ?? 0)).toBeCloseTo(0.75 * 2 * Math.PI);
    expect(hidden.centre).toBeNull();
  });

  test("labels each slice with its share, unless labels are off", () => {
    const shares = marksOf(modelOf({ kind: "pie" }, { categories: classes }).marks, "slice");
    expect(shares.map((slice) => slice.label)).toStrictEqual(["60.00%", "30.00%", "10.00%"]);
    const plain = marksOf(
      modelOf({ kind: "pie", labels: false }, { categories: classes }).marks,
      "slice",
    );
    expect(plain.every((slice) => slice.label === undefined)).toBe(true);
  });

  test("moves the slice under the pointer out along its middle, and names it in the donut's hole", () => {
    const resting = marksOf(modelOf({ kind: "pie" }, { categories: classes }).marks, "slice");
    const model = modelOf({ kind: "pie" }, { categories: classes }, { hovered: 1 });
    const slices = marksOf(model.marks, "slice");
    // Bond runs from 60 % to 90 % of the way round from twelve o'clock, so its middle points to nine o'clock.
    expect(slices[1]?.cx).toBeCloseTo((resting[1]?.cx ?? 0) - 5);
    expect(slices[1]?.cy).toBeCloseTo(resting[1]?.cy ?? 0);
    expect(slices[0]?.cx).toBe(resting[0]?.cx);
    expect(model.centre).toStrictEqual({ label: "Bond", value: "30.00" });
  });

  test("refuses negative values with a message, rather than drawing a share of a whole", () => {
    const losses = categoriesOf(
      ["Fund A", "Fund B"],
      [{ label: "pnl", texts: ["5.00", "(2.00)"], values: [5, -2] }],
    );
    const model = modelOf({ kind: "pie" }, { categories: losses });
    expect(model.marks).toStrictEqual([]);
    expect(model.empty).toBe("A pie can't show negative values: Fund B is (2.00)");
  });

  test("dims every group but the selected one, on pies and bars alike", () => {
    const pie = modelOf({ kind: "pie" }, { categories: classes }, { selected: "Bond" });
    expect(marksOf(pie.marks, "slice").map((slice) => slice.dim)).toStrictEqual([
      true,
      false,
      true,
    ]);
    const bars = marksOf(
      modelOf({ kind: "bar" }, { categories: classes }, { selected: "Bond" }).marks,
      "rect",
    );
    expect(bars.filter((rect) => rect.dim !== true).map((rect) => rect.hit.title)).toStrictEqual([
      "Bond",
      "Bond",
    ]);
    // "Other" stands for several groups, so its bars select none.
    const other = bars.filter((rect) => rect.hit.title === "Other");
    expect(other.every((rect) => rect.category === undefined)).toBe(true);
  });

  test("pads a compact tile's plot less", () => {
    const roomy = modelOf({ kind: "bar" }, { categories: classes });
    const compact = modelOf({ kind: "bar" }, { categories: classes }, { compact: true });
    expect(compact.plot.y).toBeLessThan(roomy.plot.y);
    expect(compact.plot.height).toBeGreaterThan(roomy.plot.height);
  });
});
