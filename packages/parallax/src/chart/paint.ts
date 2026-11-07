/* Paints a chart's draw model on a Canvas 2D context. Every decision about what goes where is in the model; this only
 * draws it, with the theme's tokens for the surface, gridlines and text: the axes, then the marks clipped to their
 * plots, then the labels over them, then any drawings over the price. */

import type { Theme } from "#theme/read.ts";

import { paintAxes } from "./paint-axes.ts";
import { paintDrawings } from "./paint-drawings.ts";
import type { DrawingLayer } from "./paint-drawings.ts";
import { paintLabels } from "./paint-labels.ts";
import { paintClipped } from "./paint-marks.ts";
import { style } from "./paint-canvas.ts";
import type { Painting } from "./paint-canvas.ts";
import type { ChartModel } from "./model-types.ts";
import { wrapText } from "./text.ts";

/** What a chart is painted with: the theme's tokens, and the drawings over its price, none by default. */
interface PaintOptions {
  readonly theme: Theme;
  readonly drawings?: DrawingLayer;
}

/** The narrowest an empty chart's message wraps to, how far it keeps from the edges, and its lines' height. */
const narrowestMessage = 40;
const messageMargin = 16;
const messageLine = 16;

/** The message said instead of a plot, wrapped rather than cut in a narrow tile, in the middle of the chart. */
function paintMessage({ ctx, theme }: Painting, model: ChartModel, message: string): void {
  style(ctx, {
    font: theme.font,
    fillStyle: theme.muted,
    textAlign: "center",
    textBaseline: "middle",
  });
  // A narrow tile wraps the message rather than cut it.
  const lines = wrapText(
    message,
    Math.max(narrowestMessage, model.width - messageMargin),
    (text) => ctx.measureText(text).width,
  );
  for (const [i, line] of lines.entries()) {
    ctx.fillText(
      line,
      model.width / 2,
      model.height / 2 + (i - (lines.length - 1) / 2) * messageLine,
    );
  }
}

/** The marks, each clipped to its plot: the price's, then each pane's. */
function paintPlots(painting: Painting, model: ChartModel): void {
  paintClipped(painting, model.plot, model.marks);
  for (const pane of model.panes) {
    paintClipped(painting, pane.plot, pane.marks);
  }
}

function paintModel(painting: Painting, model: ChartModel): void {
  const { ctx, theme } = painting;
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, model.width, model.height);
  if (model.empty !== null) {
    paintMessage(painting, model, model.empty);
    return;
  }
  // A pie has no axes, nor a baseline under it.
  if (!model.marks.some((mark) => mark.kind === "slice")) {
    paintAxes(painting, model);
  }
  paintPlots(painting, model);
  paintLabels(painting, model);
}

/** Paints `model` over the whole canvas, and any drawings over its price. The context's transform must already map CSS pixels. */
function paintChart(
  ctx: CanvasRenderingContext2D,
  model: ChartModel,
  { theme, drawings }: PaintOptions,
): void {
  const painting: Painting = { ctx, small: `${theme.fontSizeSmall} ${theme.fontFamily}`, theme };
  paintModel(painting, model);
  if (drawings !== undefined && drawings.shapes.length > 0 && model.empty === null) {
    paintDrawings(painting, model, drawings);
  }
}

export { paintChart };
export type { PaintOptions };
