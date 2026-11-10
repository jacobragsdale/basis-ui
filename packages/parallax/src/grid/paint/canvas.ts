/* Small steps of drawing on a canvas that the grid repeats: a rectangle filled in a colour, and a clip, both on whole
 * device pixels. */

import { snap, snapRect } from "#canvas/device-pixels.ts";

/** A rectangle as `[x, y, width, height]`, in CSS pixels. */
type Rect = readonly [x: number, y: number, width: number, height: number];

/** A context and the device pixels of one of its CSS pixels, which its transform scales by. */
interface Brush {
  readonly context: CanvasRenderingContext2D;
  readonly ratio: number;
}

/** Fills `rect` in `color` on whole device pixels, leaving the context's fill in that colour. A rule, a side of two
 * CSS pixels or less, hugs the rectangle's end, as a cell's right and bottom borders do. */
function fillRect({ context, ratio }: Brush, color: string, rect: Rect): void {
  const pen = context;
  pen.fillStyle = color;
  pen.fillRect(...snapRect(rect, { ratio }));
}

/** Fills `rect` as `fillRect` does, but a rule hugs the rectangle's start, as the line over the totals does. */
function fillFromStart({ context, ratio }: Brush, color: string, rect: Rect): void {
  const pen = context;
  pen.fillStyle = color;
  pen.fillRect(...snapRect(rect, { anchor: "start", ratio }));
}

/** Clips the context to `rect`, its edges on device pixels, so that what is clipped has crisp edges. */
function clipRect({ context, ratio }: Brush, [x, y, width, height]: Rect): void {
  const [left, top] = [snap(x, ratio), snap(y, ratio)];
  context.beginPath();
  context.rect(left, top, snap(x + width, ratio) - left, snap(y + height, ratio) - top);
  context.clip();
}

export { clipRect, fillFromStart, fillRect };
export type { Brush, Rect };
