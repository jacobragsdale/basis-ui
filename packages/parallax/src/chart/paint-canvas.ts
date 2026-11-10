/* What every part of the painter shares: the context it paints on with the theme's tokens, and two steps it takes
 * often, setting several of the canvas's state properties in the order written, and stroking a straight line. */

import type { Theme } from "#theme/read.ts";

/** A context to paint on and the device pixels of one of its CSS pixels, the theme's tokens, and the small font of
 * axis and data labels. */
interface Painting {
  readonly ctx: CanvasRenderingContext2D;
  /** The device pixels of one CSS pixel, which the context's transform scales by and lines snap to. */
  readonly ratio: number;
  readonly theme: Theme;
  /** Axis labels and data labels: the theme's small size. */
  readonly small: string;
}

/** The canvas state a painter sets. */
type CanvasStyle = Partial<
  Pick<
    CanvasRenderingContext2D,
    | "fillStyle"
    | "font"
    | "globalAlpha"
    | "lineCap"
    | "lineJoin"
    | "lineWidth"
    | "strokeStyle"
    | "textAlign"
    | "textBaseline"
  >
>;

/** Half a pixel, to put a one-pixel line on a pixel rather than between two at a ratio of 1. */
const half = 0.5;
/** How faint the bars, slices and dots of groups other than the selected one are. */
const dim = 0.3;

/** Sets each property of `values` on the canvas, in the order written, as one assignment after another would. */
function style(ctx: CanvasRenderingContext2D, values: CanvasStyle): void {
  Object.assign(ctx, values);
}

/** Strokes a straight line from `(fromX, fromY)` to `(toX, toY)` as a path of its own. */
function strokeLine(
  ctx: CanvasRenderingContext2D,
  [fromX, fromY]: readonly [number, number],
  [toX, toY]: readonly [number, number],
): void {
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
}

export { dim, half, strokeLine, style };
export type { CanvasStyle, Painting };
