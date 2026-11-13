import { describe, expect, test } from "vite-plus/test";

import { indicatorRows } from "#chart/interaction.ts";
import { chartModel } from "#chart/model.ts";
import type { ChartModel, LegendEntry, Point } from "#chart/model-types.ts";
import { hiddenLabels, seriesKey, toggledHidden } from "#chart/series-keys.ts";
import { seriesAt } from "#chart/snap.ts";
import type { ChartFrameData, SeriesData } from "#frame/chart-data.ts";
import type { LayoutChart } from "#layout/chart.ts";
import { parseLayout } from "#layout/layout.ts";
import type { LayoutInput } from "#layout/layout.ts";
import { chartColors } from "#theme/charts.ts";

import { reduced } from "./engine-frames.tsx";
import { plot } from "./ticker-data.ts";

/** A line of each ticker's close, with its events. */
const closes = {
  events: "event",
  kind: "line",
  series: "ticker",
  x: "date",
  y: ["close"],
} satisfies NonNullable<LayoutInput["chart"]>;
/** Each ticker's close and open, titled. */
const titled = {
  chart: { ...closes, y: ["close", "open"] },
  titles: { close: "Close", open: "Open" },
} satisfies LayoutInput;
const characterWidth = 6;
/** The point a press measures from and to. */
const [early, late] = [5, 20];

/** A layout's chart, its defaults filled in, hiding `hidden`. */
function chartOf(layout: LayoutInput, hidden: readonly string[] = []): LayoutChart {
  const { chart } = parseLayout(layout);
  if (chart === null) {
    throw new Error("The layout has no chart.");
  }
  return { ...chart, hidden: [...hidden] };
}

/** The draw model of `chart` over the engine's `frame`, at the size it was reduced to. */
function modelOf(chart: LayoutChart, frame: ChartFrameData): ChartModel {
  return chartModel({
    categories: null,
    chart,
    colors: chartColors.light,
    frame,
    height: plot.height,
    measure: (text) => text.length * characterWidth,
    muted: "#999999",
    width: plot.width,
  });
}

/** The frame's line series labelled `label`. */
function seriesOf(frame: ChartFrameData, label: string): SeriesData {
  const found =
    frame.content.kind === "series"
      ? frame.content.series.find((line) => line.label === label)
      : undefined;
  if (found === undefined) {
    throw new Error(`The frame has no series ${label}.`);
  }
  return found;
}

/** Every line series of the frame. */
function allSeries(frame: ChartFrameData): readonly SeriesData[] {
  return frame.content.kind === "series" ? frame.content.series : [];
}

/** The point of `series`' line at its `index`th point, in the model's pixels, `below` pixels under it. */
function pointOn(
  model: ChartModel,
  series: SeriesData,
  { index, below = 0 }: { readonly index: number; readonly below?: number },
): Point {
  const [x, y] = [series.x[index] ?? 0, series.y[index] ?? 0];
  return { x: model.x?.map(x) ?? 0, y: (model.yAxes[0]?.scale.map(y) ?? 0) + below };
}

/** The legend entry labelled `label`. */
function entryOf(model: ChartModel, label: string): LegendEntry {
  const entry = model.legend.find((shown) => shown.label === label);
  if (entry === undefined) {
    throw new Error(`The legend has no ${label}.`);
  }
  return entry;
}

/** How many lines a model draws. */
function linesOf(model: ChartModel): number {
  return model.marks.filter((mark) => mark.kind === "line").length;
}

describe("a chart's series, as the engine names them", () => {
  test("of one column are labelled and keyed by the series' value", async () => {
    const { frame } = await reduced({ chart: closes });
    const chart = chartOf({ chart: closes });
    const series = allSeries(frame);
    expect(series.map((line) => [line.label, line.key])).toStrictEqual([
      ["ATLS", "ATLS"],
      ["BCN", "BCN"],
    ]);
    expect(series.map((line) => seriesKey(chart, line))).toStrictEqual(["ATLS", "BCN"]);
  });

  test("are measured by the engine's key, the series pressed and not the first", async () => {
    const { frame, handle } = await reduced({ chart: closes });
    const model = modelOf(chartOf({ chart: closes }), frame);
    const pressed = seriesOf(frame, "BCN");
    const choice = seriesAt(frame, model, { point: pointOn(model, pressed, { index: late }) });
    expect(choice).toStrictEqual({ column: "close", key: "BCN", label: "BCN" });
    const measured = await handle.measure(pressed.x[early] ?? 0, pressed.x[late] ?? 0, {
      series: choice?.key ?? "",
    });
    // BCN's closes, not ATLS's.
    expect([measured?.fromValue, measured?.toValue]).toStrictEqual(["305.00", "320.00"]);
  });

  test("hide a series' indicators and events with it, by its key", async () => {
    const layout = {
      chart: { ...closes, indicators: [{ kind: "sma", period: 5 }] },
    } satisfies LayoutInput;
    const { frame } = await reduced(layout);
    const chart = chartOf(layout, ["BCN"]);
    const model = modelOf(chart, frame);
    // ATLS's close and its average are drawn; BCN's, near 300, neither draw nor stretch the scale.
    expect(linesOf(model)).toBe(2);
    expect(model.yAxes[0]?.scale.domain[1]).toBeLessThan(200);
    const at = seriesOf(frame, "ATLS").x[late] ?? 0;
    const rows = indicatorRows(frame, model, { hidden: hiddenLabels(chart, frame), x: at });
    expect({
      events: model.events.map((event) => event.text),
      tooltip: rows.map((row) => row.label),
    }).toStrictEqual({ events: ["ATLS: ATLS dividend"], tooltip: ["SMA 5 ATLS"] });
    expect(entryOf(model, "BCN")).toMatchObject({ hidden: true, key: "BCN" });
  });

  test("of several columns are keyed by column and value, whatever their titles", async () => {
    const { frame } = await reduced(titled);
    const chart = chartOf(titled);
    const series = allSeries(frame);
    expect(series.map((line) => [line.label, seriesKey(chart, line)])).toStrictEqual([
      ["Close ATLS", "close ATLS"],
      ["Open ATLS", "open ATLS"],
      ["Close BCN", "close BCN"],
      ["Open BCN", "open BCN"],
    ]);
  });

  test("stay hidden where a layout saved them by their legend labels, and are hidden again by key", async () => {
    const { frame } = await reduced(titled);
    const model = modelOf(chartOf(titled, ["Close BCN"]), frame);
    const entry = entryOf(model, "Close BCN");
    expect(entry).toMatchObject({ hidden: true, key: "close BCN" });
    expect(linesOf(model)).toBe(3);
    // Shown again, the label goes; hidden again, the key is held.
    expect(toggledHidden(["Close BCN"], entry)).toStrictEqual([]);
    expect(toggledHidden([], entry)).toStrictEqual(["close BCN"]);
  });

  test("of several columns are measured on the line pressed, its column and its key", async () => {
    const { frame, handle } = await reduced(titled);
    const model = modelOf(chartOf(titled), frame);
    // Pressed on BCN's open, half a point under its close, a measurement measures BCN's open.
    const open = seriesOf(frame, "Open BCN");
    const point = pointOn(model, open, { below: 1, index: late });
    const choice = seriesAt(frame, model, { point });
    expect(choice).toStrictEqual({ column: "open", key: "BCN", label: "Open BCN" });
    const at = (index: number): number => open.x[index] ?? 0;
    const measured = await handle.measure(at(early), at(late), {
      series: choice?.key ?? "",
      y: choice?.column ?? "",
    });
    expect([measured?.fromValue, measured?.toValue]).toStrictEqual(["304.50", "319.50"]);
  });
});
