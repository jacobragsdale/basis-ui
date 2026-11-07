/* A chart's accessible name: its kind and shape, what it plots, what it splits it by, and the dataset. A canvas is
 * invisible to screen readers, so every chart carries this text. */

import type { LayoutChart } from "#layout/chart.ts";
import type { Layout } from "#layout/layout.ts";

const kindNames: Readonly<Record<LayoutChart["kind"], string>> = {
  line: "Line chart",
  area: "Area chart",
  bar: "Bar chart",
  scatter: "Density of points",
  heatmap: "Heatmap",
  histogram: "Histogram",
  candlestick: "Candlestick chart",
  ohlc: "OHLC chart",
  pie: "Pie chart",
};

function kindName(chart: LayoutChart): string {
  if (chart.kind === "pie" && chart.donut) {
    return "Donut chart";
  }
  if (chart.kind !== "bar") {
    return kindNames[chart.kind];
  }
  const shape = [chart.stacked ? "stacked" : "", chart.horizontal ? "horizontal" : ""]
    .filter((word) => word !== "")
    .join(" ");
  return shape === "" ? "Bar chart" : `${shape.charAt(0).toUpperCase()}${shape.slice(1)} bar chart`;
}

/** A chart's accessible name: its kind and shape, what it plots, what it splits it by, and the dataset. */
function describeChart(layout: Layout): string {
  const { chart } = layout;
  if (chart === null) {
    return "Chart";
  }
  const grouped = chart.kind === "bar" || chart.kind === "heatmap" || chart.kind === "pie";
  const columns = [...chart.y, ...chart.y_right].join(", ");
  const plotted = columns === "" ? chart.x : columns;
  const of = grouped ? layout.group_by.join(", ") : plotted;
  const by = grouped ? layout.split_by.join(", ") : (chart.series ?? "");
  return `${kindName(chart)} of ${of}${by === "" ? "" : ` by ${by}`} from ${layout.dataset}`;
}

export { describeChart };
