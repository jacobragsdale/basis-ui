/* Which series a chart's `hidden` names. A line or area chart's series is known by the engine's key, the series
 * column's value, which neither a column's title nor another column changes; a layout saved while `hidden` held
 * legend labels still names its series by them. The marks of other charts, which have no key, are known by their
 * labels. Within one frame a series is then told by the label the engine gave it, never one made here. */

import type { ChartFrameData, SeriesData } from "#frame/chart-data.ts";
import type { LayoutChart } from "#layout/chart.ts";

/** What tells a line series apart: its column and the engine's key. */
type Keyed = Pick<SeriesData, "column" | "key">;

/**
 * The name `hidden` holds for a line series: the series column's value on a chart of one plotted column; the
 * column's name for a series not split; and the column's name and the value, a space between, on a chart of several
 * columns split by series.
 */
function seriesKey(chart: Pick<LayoutChart, "y" | "y_right">, { column, key }: Keyed): string {
  if (key === "") {
    return column;
  }
  return chart.y.length + chart.y_right.length > 1 ? `${column} ${key}` : key;
}

/**
 * The labels of what `chart.hidden` hides in `frame`: each line series it names by key or by legend label, and each
 * other name as it is, for the marks known by their labels.
 */
function hiddenLabels(
  chart: Pick<LayoutChart, "y" | "y_right" | "hidden">,
  frame: ChartFrameData | null,
): readonly string[] {
  if (frame?.content.kind !== "series" || chart.hidden.length === 0) {
    return chart.hidden;
  }
  const names = new Set(chart.hidden);
  const labels = new Set(chart.hidden);
  for (const series of frame.content.series) {
    if (names.has(seriesKey(chart, series))) {
      labels.add(series.label);
    }
  }
  return [...labels];
}

/** The legend label the engine gave the line series of `column` and key `key` in `frame`, or "" when it has none. */
function seriesLabel(frame: ChartFrameData, { column, key }: Keyed): string {
  const { content } = frame;
  return content.kind === "series"
    ? (content.series.find((series) => series.column === column && series.key === key)?.label ?? "")
    : "";
}

/** `hidden` with a legend entry's series hidden by its key, or shown again, whether it was hidden by its key or, as
 * layouts saved before keys were, by its label. */
function toggledHidden(
  hidden: readonly string[],
  entry: { readonly label: string; readonly key?: string },
): string[] {
  const key = entry.key ?? entry.label;
  const names = new Set([key, entry.label]);
  return hidden.some((name) => names.has(name))
    ? hidden.filter((name) => !names.has(name))
    : [...hidden, key];
}

export { hiddenLabels, seriesKey, seriesLabel, toggledHidden };
