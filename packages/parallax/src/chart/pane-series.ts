/* Panes of the layout's own under a line or area chart, such as the change in basis points under curves for several
 * dates: the engine reduces their columns as it does the plot's, and sends them as series of their own, which these
 * split from the plot's, colour as the plotted series of the same key, hide with it, and draw as lines or bars. A
 * series with no values in the range shown is left out of its pane. */

import type { ChartFrameData, SeriesData } from "#frame/chart-data.ts";
import type { LayoutChart } from "#layout/chart.ts";

import { plain } from "./axis-styles.ts";
import type { AxisStyle } from "./axis-styles.ts";
import type { ChartModel, Mark, ModelInput } from "./model-types.ts";
import { columnStyle, columnWidth, hidden, seriesColor } from "./model-shared.ts";
import { segmentsOf } from "./panes.ts";
import type { Axes, PaneSpec } from "./panes.ts";
import { pixel } from "./scale.ts";

/** A pane's line width, as an indicator's. */
const lineWidth = 1.5;

/** A series a layout pane draws, in its colour. */
interface PaneLine {
  readonly series: SeriesData;
  readonly color: string;
}

/** A layout pane: its title, whether it draws bars, its columns, and the series it draws. */
interface ColumnPane {
  readonly title: string;
  readonly bars: boolean;
  /** Its value axis upside down. */
  readonly reverse: boolean;
  readonly columns: readonly string[];
  readonly lines: readonly PaneLine[];
}

/** The columns the layout's panes draw. */
function paneColumns(chart: LayoutChart): ReadonlySet<string> {
  return new Set((chart.panes ?? []).flatMap((pane) => pane.columns));
}

/** The series the plot draws: every series but those of the panes' columns. */
function plottedSeries(chart: LayoutChart, series: readonly SeriesData[]): readonly SeriesData[] {
  const paned = paneColumns(chart);
  return series.filter((line) => !paned.has(line.column));
}

/** A split series' key: the series column's value, as the engine writes it; "" for an unsplit one. */
function keyOf(series: SeriesData): string {
  return series.key;
}

/** Whether a series has a value to draw. */
function hasValues(series: SeriesData): boolean {
  return series.y.some((value) => Number.isFinite(value));
}

/** A pane's series with values, each in the colour of the plotted series of its key, and hidden with it. */
function paneLines(
  input: ModelInput,
  {
    own,
    plotted,
  }: { readonly own: readonly SeriesData[]; readonly plotted: readonly SeriesData[] },
): readonly PaneLine[] {
  const keyed = new Map(
    plotted.flatMap((series, i) => (keyOf(series) === "" ? [] : [[keyOf(series), { i, series }]])),
  );
  return own.flatMap((series, place): PaneLine[] => {
    const twin = keyed.get(keyOf(series));
    if (hidden(input, series.label) || (twin !== undefined && hidden(input, twin.series.label))) {
      return [];
    }
    // An unsplit pane series takes the palette's slots after the plot's.
    return [{ color: seriesColor(input, twin?.i ?? plotted.length + place), series }];
  });
}

/** The layout's panes, each with the series of its columns that have values in the range shown. */
function columnPanes(input: ModelInput, frame: ChartFrameData): readonly ColumnPane[] {
  const all = frame.content.kind === "series" ? frame.content.series : [];
  const plotted = plottedSeries(input.chart, all);
  return (input.chart.panes ?? []).map((pane) => {
    const own = all.filter((series) => pane.columns.includes(series.column) && hasValues(series));
    const title = pane.title ?? "";
    return {
      bars: pane.kind === "bar",
      columns: pane.columns,
      lines: paneLines(input, { own, plotted }),
      reverse: pane.reverse === true,
      title: title === "" ? pane.columns.join(", ") : title,
    };
  });
}

/** The values a layout pane's axis spans: its series', and zero for bars. */
function columnValues(pane: ColumnPane): number[] {
  return [...pane.lines.flatMap((line) => [...line.series.y]), ...(pane.bars ? [0] : [])];
}

/** The slot a bar at point `i` of `xs` has: centred on it, as wide as most of the space to the next point. */
function slotOf(
  xs: Float64Array,
  i: number,
  axes: Axes,
): { readonly at: number; readonly width: number } {
  const at = pixel(axes.x, xs[i] ?? 0);
  const neighbour = pixel(axes.x, xs[i + 1] ?? xs[i - 1] ?? 0);
  return { at, width: columnWidth(Math.abs(neighbour - at)) };
}

/** A bar from zero to `value`, `left` to `left + width` across, as an `x, y, w, h` quad. */
function barQuad(
  axes: Axes,
  { left, width, value }: { readonly left: number; readonly width: number; readonly value: number },
): readonly number[] {
  const [zero, top] = [pixel(axes.y, 0), pixel(axes.y, value)];
  return [left, Math.min(zero, top), width, Math.abs(zero - top)];
}

/** One series' bars from zero, rising in the up colour and falling in the down colour. */
function signedBars(input: ModelInput, line: PaneLine, axes: Axes): Mark[] {
  const [up, down]: [number[], number[]] = [[], []];
  const { x: xs, y: ys } = line.series;
  for (let i = 0; i < xs.length; i += 1) {
    const value = ys[i] ?? Number.NaN;
    if (Number.isFinite(value)) {
      const { at, width } = slotOf(xs, i, axes);
      (value >= 0 ? up : down).push(...barQuad(axes, { left: at - width / 2, value, width }));
    }
  }
  return [
    { color: input.colors.up, kind: "columns", rects: Float64Array.from(up) },
    { color: input.colors.down, kind: "columns", rects: Float64Array.from(down) },
  ];
}

/** Several series' bars side by side in each point's slot, each in its series' colour. */
function groupedBars(lines: readonly PaneLine[], axes: Axes): Mark[] {
  return lines.map((line, slot): Mark => {
    const quads: number[] = [];
    const { x: xs, y: ys } = line.series;
    for (let i = 0; i < xs.length; i += 1) {
      const value = ys[i] ?? Number.NaN;
      if (Number.isFinite(value)) {
        const { at, width } = slotOf(xs, i, axes);
        const part = width / lines.length;
        const left = at - width / 2 + slot * part;
        quads.push(...barQuad(axes, { left, value, width: Math.max(1, part - 1) }));
      }
    }
    return { color: line.color, kind: "columns", rects: Float64Array.from(quads) };
  });
}

/**
 * A layout pane's marks: a line through each series, or bars from zero, in the up and down colours for one series and
 * side by side in the series' colours for several.
 */
function columnMarks(input: ModelInput, pane: ColumnPane, axes: Axes): Mark[] {
  const [only] = pane.lines;
  if (pane.bars) {
    return pane.lines.length === 1 && only !== undefined
      ? signedBars(input, only, axes)
      : groupedBars(pane.lines, axes);
  }
  return pane.lines.flatMap((line): Mark[] => {
    const segments = segmentsOf(line.series.x, line.series.y, axes);
    return segments.length === 0
      ? []
      : [
          {
            baseline: null,
            color: line.color,
            dashed: false,
            kind: "line",
            segments,
            width: lineWidth,
          },
        ];
  });
}

/** The style a pane's axis is labelled in: a layout pane's first column's format, and plain for an indicator's. */
function specStyle(input: ModelInput, spec: PaneSpec): AxisStyle {
  return spec.columns === undefined ? plain : columnStyle(input, spec.columns.columns[0]);
}

/** A layout pane's spec: its values fit its axis, with a line at zero under bars. */
function columnSpec(pane: ColumnPane): PaneSpec {
  return {
    columns: pane,
    domain: null,
    guides: pane.bars ? [0] : [],
    title: pane.title,
    volume: false,
  };
}

/**
 * The colour of each series a chart draws, by label: the legend's, and the panes' series', which the legend leaves
 * out; and the columns the panes draw, whose series no pane lists, such as one hidden with the plot's series of its
 * key, are not drawn.
 */
function seriesColors(model: ChartModel): {
  readonly colors: ReadonlyMap<string, string>;
  readonly paned: ReadonlySet<string>;
} {
  const colors = new Map(model.legend.map((entry) => [entry.label, entry.color]));
  for (const entry of model.panes.flatMap((pane) => pane.series ?? [])) {
    colors.set(entry.label, entry.color);
  }
  return { colors, paned: new Set(model.panes.flatMap((pane) => pane.columns ?? [])) };
}

export {
  columnMarks,
  columnPanes,
  columnSpec,
  columnValues,
  plottedSeries,
  seriesColors,
  specStyle,
};
export type { ColumnPane };
