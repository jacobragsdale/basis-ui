/* Small steps of drawing on a canvas that the grid repeats: a rectangle filled in a colour. */

/** A rectangle as `[x, y, width, height]`, in CSS pixels. */
type Rect = readonly [x: number, y: number, width: number, height: number];

/** Fills `rect` in `color`, leaving the context's fill in that colour. */
function fillRect(context: CanvasRenderingContext2D, color: string, rect: Rect): void {
  const pen = context;
  pen.fillStyle = color;
  pen.fillRect(...rect);
}

export { fillRect };
export type { Rect };
