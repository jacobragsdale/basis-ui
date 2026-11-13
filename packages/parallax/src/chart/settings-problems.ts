/* What a chart says in place of its plot about a setting its kind does not draw, so that no setting is silently
 * ignored. */

import type { Layout } from "#layout/layout.ts";

/** "A bar chart" or "An area chart": a chart of `kind`, to begin a sentence. */
function aChart(kind: string): string {
  return `${/^[aeiou]/u.test(kind) ? "An" : "A"} ${kind} chart`;
}

/** A setting the chart's kind does not draw, said with the fix, or null: a chart never leaves a setting unheeded. Only
 * bars stack, and only lines and areas have a right axis. */
function settingsProblem(layout: Layout): string | null {
  const { chart } = layout;
  if (chart === null) {
    return null;
  }
  if (chart.stacked && chart.kind !== "bar") {
    return `${aChart(chart.kind)} does not stack its series: only a bar chart does, so set stacked to false, or draw them as stacked bars.`;
  }
  return chart.kind !== "line" && chart.kind !== "area" && chart.y_right.length > 0
    ? `${aChart(chart.kind)} has one value axis: give its columns as y, or draw them as a line chart with y_right.`
    : null;
}

export { aChart, settingsProblem };
