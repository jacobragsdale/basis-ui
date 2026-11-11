/* A pan's or a zoom's picture before the engine answers: the plot as last painted, moved and stretched to the range
 * asked for, so that a drag or a wheel moves the chart at once, even while the one worker is busy with a pivot. The
 * engine's answer then paints the chart again, axes and all; until it does, the axes keep their labels. */

import { plotBottom } from "./model.ts";
import type { ChartModel, Scale } from "./model-types.ts";
import type { Range } from "./range.ts";

/** A rectangle in CSS pixels. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Where the plot as painted goes: from its box on the canvas, to its box for the range asked for. */
interface Placement {
  readonly from: Box;
  readonly to: Box;
}

/** Where the plot between `top` and `bottom`, painted over `scale`'s domain, goes once `range` is shown; null for a
 * log scale, which a picture cannot stretch to, or an empty range. */
function previewPlacement(
  scale: Scale,
  { top, bottom }: { readonly top: number; readonly bottom: number },
  range: Range,
): Placement | null {
  const [from, to] = range;
  const [left, right] = scale.range;
  if (scale.log || to === from || right === left) {
    return null;
  }
  const at = (value: number): number => left + ((value - from) / (to - from)) * (right - left);
  const [start, end] = [at(scale.domain[0]), at(scale.domain[1])];
  const height = bottom - top;
  return {
    from: { height, width: right - left, x: left, y: top },
    to: { height, width: end - start, x: start, y: top },
  };
}

/** Draws the copy's plot at its new place, within the plot's box. */
function drawMoved(
  context: CanvasRenderingContext2D,
  {
    background,
    placement: { from, to },
    still,
    unit,
  }: { background: string; placement: Placement; still: HTMLCanvasElement; unit: number },
): void {
  context.save();
  context.beginPath();
  context.rect(from.x, from.y, from.width, from.height);
  context.clip();
  context.fillStyle = background;
  context.fillRect(from.x, from.y, from.width, from.height);
  const source = [from.x * unit, from.y * unit, from.width * unit, from.height * unit] as const;
  context.drawImage(still, ...source, to.x, to.y, to.width, to.height);
  context.restore();
}

/** Keeps a copy of the chart as painted, and shows it moved to a range asked for. */
class ZoomPreview {
  #model: ChartModel | null = null;
  /** The canvas as painted, copied at the first preview after a paint. */
  #still: HTMLCanvasElement | null = null;
  #fresh = false;

  /** The canvas now shows `model`, painted afresh. */
  public painted(model: ChartModel): void {
    [this.#model, this.#fresh] = [model, true];
  }

  /** Shows on `canvas` the plot as painted, moved to `range`, over `background`; nothing for everything, which the
   * engine's answer shows. */
  public show(canvas: HTMLCanvasElement, range: Range | null, background: string): void {
    const model = this.#model;
    const scale = model?.x ?? null;
    const context = canvas.getContext("2d", { alpha: false });
    if (model === null || scale === null || range === null || context === null) {
      return;
    }
    const placement = previewPlacement(
      scale,
      { bottom: plotBottom(model), top: model.plot.y },
      range,
    );
    if (placement !== null) {
      drawMoved(context, {
        background,
        placement,
        still: this.#copy(canvas),
        unit: canvas.width / model.width,
      });
    }
  }

  /** The canvas as painted, copied once a paint. */
  #copy(canvas: HTMLCanvasElement): HTMLCanvasElement {
    this.#still ??= canvas.ownerDocument.createElement("canvas");
    const still = this.#still;
    if (this.#fresh) {
      [still.width, still.height, this.#fresh] = [canvas.width, canvas.height, false];
      still.getContext("2d")?.drawImage(canvas, 0, 0);
    }
    return still;
  }
}

export { ZoomPreview, previewPlacement };
export type { Placement };
