import { describe, expect, test } from "vite-plus/test";

import type { ChartModel } from "#chart/model-types.ts";
import { readingOf } from "#chart/reading.ts";
import type { SeriesData } from "#frame/chart-data.ts";
import { parseLayout } from "#layout/layout.ts";
import type { LayoutInput } from "#layout/layout.ts";
import { chartColors } from "#theme/charts.ts";

import { marksOf, modelOf, seriesFrame, seriesOf } from "./chart-model-inputs.ts";

const colors = chartColors.light;

/** A series of `column`, split by curve date, at tenors 0, 1, 2 and so on. */
function curve(column: string, date: string, values: readonly number[]): SeriesData {
  return { ...seriesOf(`${column} ${date}`, values), column };
}

/** The engine's order: each date's yield, then its change. */
const frame = seriesFrame([
  curve("yield", "Nov 30", [4.1, 4.3, 4.6]),
  curve("change", "Nov 30", [0.02, -0.01, 0.03]),
  curve("yield", "Nov 23", [4, 4.2, 4.5]),
  curve("change", "Nov 23", [-0.01, 0.01, -0.02]),
  curve("yield", "Jan 2", [3.9, 4.1, 4.4]),
  curve("change", "Jan 2", [Number.NaN, Number.NaN, Number.NaN]),
]);

/** A curve chart with `panes` under it. */
function curves(
  panes: NonNullable<NonNullable<LayoutInput["chart"]>["panes"]>,
  changes: { readonly hidden?: string[] } = {},
): ChartModel {
  return modelOf(
    { kind: "line", panes, series: "curve_date", x: "tenor", y: ["yield"], ...changes },
    { frame },
  );
}

describe("panes of the layout's own", () => {
  test("label their axis in their first column's format, as the plot's axis is", () => {
    const model = modelOf(
      {
        kind: "line",
        panes: [{ columns: ["change"], kind: "bar" }],
        series: "curve_date",
        x: "tenor",
        y: ["yield"],
      },
      { frame },
      { formats: parseLayout({ formats: { change: { bps: true } } }).formats },
    );
    const labels = model.panes[0]?.axis.ticks.map((tick) => tick.label) ?? [];
    expect(labels.length > 0 && labels.every((label) => label.endsWith("bp"))).toBe(true);
  });

  test("take their columns' series from the plot, which keeps the rest and their legend", () => {
    const model = curves([{ columns: ["change"], kind: "bar", title: "Change" }]);
    expect(model.legend.map((entry) => entry.label)).toStrictEqual([
      "yield Nov 30",
      "yield Nov 23",
      "yield Jan 2",
    ]);
    expect(marksOf(model.marks, "line")).toHaveLength(3);
    const [pane] = model.panes;
    expect(pane?.title).toBe("Change");
    expect(pane?.columns).toStrictEqual(["change"]);
    // The first date has no change before it, so its series is left out.
    expect(pane?.series?.map((series) => series.label)).toStrictEqual([
      "change Nov 30",
      "change Nov 23",
    ]);
  });

  test("colour each series as the plot's series of its date, and share the plot's x", () => {
    const model = curves([{ columns: ["change"] }]);
    const [pane] = model.panes;
    expect(pane?.series?.map((series) => series.color)).toStrictEqual([
      colors.series[0],
      colors.series[1],
    ]);
    expect(pane?.title).toBe("change");
    expect([pane?.plot.x, pane?.plot.width]).toStrictEqual([model.plot.x, model.plot.width]);
    expect((pane?.plot.y ?? 0) > model.plot.y + model.plot.height).toBe(true);
    expect(marksOf(pane?.marks ?? [], "line").map((line) => line.color)).toStrictEqual([
      colors.series[0],
      colors.series[1],
    ]);
  });

  test("draw several series' bars side by side in their colours, with a line at zero", () => {
    const [pane] = curves([{ columns: ["change"], kind: "bar" }]).panes;
    const columns = marksOf(pane?.marks ?? [], "columns");
    expect(columns.map((mark) => mark.color)).toStrictEqual([colors.series[0], colors.series[1]]);
    // Three bars each, as x, y, width and height quads; the second series sits right of the first.
    expect(columns.map((mark) => mark.rects.length)).toStrictEqual([12, 12]);
    expect((columns[1]?.rects[0] ?? 0) > (columns[0]?.rects[0] ?? 0)).toBe(true);
    expect(pane?.guides).toHaveLength(1);
    expect(pane?.axis.scale.invert(pane.guides[0] ?? 0)).toBeCloseTo(0);
  });

  test("draw one series' bars in the up and down colours, and hide a date's change with its curve", () => {
    const [pane] = curves([{ columns: ["change"], kind: "bar" }], {
      hidden: ["yield Nov 23"],
    }).panes;
    expect(pane?.series?.map((series) => series.label)).toStrictEqual(["change Nov 30"]);
    const columns = marksOf(pane?.marks ?? [], "columns");
    expect(columns.map((mark) => [mark.color, mark.rects.length])).toStrictEqual([
      [colors.up, 8],
      [colors.down, 4],
    ]);
  });

  test("are read at the crosshair in their colours, and a hidden one is not", () => {
    const model = curves([{ columns: ["change"], kind: "bar" }], { hidden: ["yield Nov 23"] });
    const reading = readingOf({ frame, hidden: ["yield Nov 23"], hover: null, model, synced: 1 });
    expect(reading?.rows.map((row) => [row.label, row.color])).toStrictEqual([
      ["yield Nov 30", colors.series[0]],
      ["change Nov 30", colors.series[0]],
      ["yield Jan 2", colors.series[2]],
    ]);
  });
});
