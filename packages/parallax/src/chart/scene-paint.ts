/* How a scene puts its model on the screen: the canvas in whole device pixels, the brushed band, the measurement,
 * and the words a status line and a screen reader read. */

import type { DevicePixels } from "#canvas/device-pixels.ts";
import type { ChartFrameData } from "#frame/chart-data.ts";
import type { Theme } from "#theme/read.ts";

import type { DrawingEditor } from "./drawing-editor.ts";
import { measureView } from "./drawing-editor.ts";
import { plotBottom } from "./model.ts";
import type { ChartModel, Point, Rect } from "./model-types.ts";
import { paintChart } from "./paint.ts";
import { pixel } from "./scale.ts";
import type { Range } from "./range.ts";

/** Paints `model` on `canvas`, which `device` sizes to the model in whole device pixels, with the editor's drawings
 * over it. */
function paintCanvas(
  canvas: HTMLCanvasElement,
  model: ChartModel,
  {
    theme,
    editor,
    device,
  }: { readonly theme: Theme; readonly editor: DrawingEditor; readonly device: DevicePixels },
): void {
  const context = canvas.getContext("2d", { alpha: false });
  if (context === null) {
    return;
  }
  const { ratio } = device.fit(model.width, model.height);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  paintChart(context, model, {
    drawings: { selected: editor.state.selected, shapes: editor.shapes() },
    ratio,
    theme,
  });
}

/** The brushed range on screen, kept within the plot, or null without a brush or an x axis. */
function bandOf(brush: Range | null, model: ChartModel | null): Rect | null {
  const x = model?.x ?? null;
  if (brush === null || model === null || x === null) {
    return null;
  }
  const [from, to] = [pixel(x, brush[0]), pixel(x, brush[1])];
  const { plot } = model;
  const left = Math.max(plot.x, Math.min(from, to));
  const right = Math.min(plot.x + plot.width, Math.max(from, to));
  return {
    height: plotBottom(model) - plot.y,
    width: Math.max(0, right - left),
    x: left,
    y: plot.y,
  };
}

/** The measurement shown, where its ends are on the chart now; none once the data has been loaded again. */
function measuredOf(
  editor: DrawingEditor,
  model: ChartModel | null,
  frame: ChartFrameData | null,
): { readonly band: Rect; readonly card: Point } | null {
  const { measuring } = editor;
  if (measuring === null || model === null || frame?.loadVersion !== measuring.load) {
    return null;
  }
  return measureView(measuring, model);
}

/** Writes `text` into `element` if it differs from what is there. */
function writeText(element: HTMLElement | null, text: string): void {
  if (element !== null && element.textContent !== text) {
    element.textContent = text;
  }
}

/** Sets or removes a data attribute that styles the plot, such as its cursor. */
function flag(element: HTMLElement, name: string, on: boolean): void {
  element.toggleAttribute(`data-${name}`, on);
}

export { bandOf, flag, measuredOf, paintCanvas, writeText };
