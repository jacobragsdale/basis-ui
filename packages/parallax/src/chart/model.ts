/* The draw model of a chart: what to paint and where, worked out from the data without touching a canvas, so that
 * tests can check it. Line, area, scatter (as dots or a density), histogram, candlestick and OHLC charts draw the
 * engine's reduction; bar charts, heatmaps, pies and waterfalls draw the layout's grouped view. */

import { barModel } from "./model-bars.ts";
import { densityModel, histogramModel } from "./model-bins.ts";
import { candleModel } from "./model-candles.ts";
import { heatmapModel } from "./model-heatmap.ts";
import { withPanes } from "./model-panes.ts";
import { pointsModel } from "./model-points.ts";
import { lineModel } from "./model-series.ts";
import { emptyModel } from "./model-shared.ts";
import type { ChartFrameData } from "#frame/chart-data.ts";
import { groupedKinds } from "#layout/chart.ts";

import type { ChartModel, ModelInput } from "./model-types.ts";
import { pieModel } from "./model-pie.ts";
import { waterfallModel } from "./model-waterfall.ts";

/** The smallest plot worth drawing, each way, in pixels. */
const smallest = 40;

/** The model of a bar chart, heatmap, pie or waterfall, which draws the layout's grouped view. */
function groupedModel(input: ModelInput): ChartModel {
  if (input.categories === null) {
    return emptyModel(input, "Loading…");
  }
  if (input.chart.kind === "heatmap") {
    return heatmapModel(input, input.categories);
  }
  if (input.chart.kind === "waterfall") {
    return waterfallModel(input, input.categories);
  }
  return input.chart.kind === "pie"
    ? pieModel(input, input.categories)
    : barModel(input, input.categories);
}

/** The model of a chart the engine reduced to `frame`. */
function frameModel(input: ModelInput, frame: ChartFrameData): ChartModel {
  const { content } = frame;
  switch (content.kind) {
    case "series": {
      const source = { candles: null, frame, plotted: content.series.length };
      return withPanes(input, source, (built) => lineModel(built, frame, content));
    }
    case "histogram": {
      return histogramModel(input, frame, content);
    }
    case "points": {
      return pointsModel(input, frame, content);
    }
    case "density": {
      return densityModel(input, frame, content);
    }
    case "candles": {
      const source = { candles: content.candles, frame, plotted: 0 };
      return withPanes(input, source, (built) => candleModel(built, frame, content));
    }
    default: {
      return content satisfies never;
    }
  }
}

/** The model of a chart the engine reduced, from its latest frame. */
function reducedModel(input: ModelInput): ChartModel {
  const { frame } = input;
  return frame === null ? emptyModel(input, "Loading…") : frameModel(input, frame);
}

/** Builds the draw model for a chart's latest data. */
function chartModel(input: ModelInput): ChartModel {
  if (input.width < smallest || input.height < smallest) {
    return emptyModel(input, "");
  }
  const { kind } = input.chart;
  return groupedKinds.has(kind) ? groupedModel(input) : reducedModel(input);
}

/** The bottom of the lowest plot or pane, where the x axis runs. */
function plotBottom(model: ChartModel): number {
  const last = model.panes.at(-1);
  return last === undefined ? model.plot.y + model.plot.height : last.plot.y + last.plot.height;
}

export { chartModel, plotBottom };
