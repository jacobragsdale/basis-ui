/* What every part of the painter shares: the context it paints on with the theme's tokens, and two steps it takes
 * often, setting several of the canvas's state properties in the order written, and stroking a straight line. */

import type { Theme } from "#theme/read.ts";

/** A context to paint on, the theme's tokens, and the small font of axis and data labels. */
interface Painting {
  readonly ctx: CanvasRenderingContext2D;
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

/** Half a pixel, to put a one-pixel line on a pixel rather than between two. */
const half = 0.5;

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

export { half, strokeLine, style };
export type { CanvasStyle, Painting };
