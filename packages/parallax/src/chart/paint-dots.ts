/* Painting a scatter's dots: filled in their series' colour, a little see-through so that dots beneath show, and edged
 * in the surface's colour so that touching dots stay apart. While a dot is selected, every other dot is faint and the
 * selected one is drawn on top, whole, with a ring. */

import { dim, style } from "./paint-canvas.ts";
import type { Painting } from "./paint-canvas.ts";
import type { DotsMark } from "./model-dots.ts";

/** A dot's fill, and the ring around the selected one: its width and its gap from the dot. */
const dotFill = 0.75;
const ringWidth = 2;
const ringGap = 2;

/** A circle at a centre, as a subpath of the current path. */
interface Circle {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

function circle(ctx: CanvasRenderingContext2D, { x, y, size }: Circle): void {
  ctx.moveTo(x + size, y);
  ctx.arc(x, y, size, 0, 2 * Math.PI);
}

/** Dot `dot` of a mark, grown by `grow` pixels. */
function dotCircle(mark: DotsMark, dot: number, grow = 0): Circle {
  return { size: (mark.radius[dot] ?? 0) + grow, x: mark.x[dot] ?? 0, y: mark.y[dot] ?? 0 };
}

/** Every dot but the selected one, as one path. */
function paintRest({ ctx, theme }: Painting, mark: DotsMark): void {
  const faint = mark.dim || mark.selected !== -1;
  style(ctx, {
    fillStyle: mark.color,
    globalAlpha: faint ? dim : dotFill,
    lineWidth: 1,
    strokeStyle: theme.background,
  });
  ctx.beginPath();
  for (let dot = 0; dot < mark.x.length; dot += 1) {
    if (dot !== mark.selected) {
      circle(ctx, dotCircle(mark, dot));
    }
  }
  ctx.fill();
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** The selected dot, whole, ringed in the foreground's colour. */
function paintSelected({ ctx, theme }: Painting, mark: DotsMark): void {
  ctx.fillStyle = mark.color;
  ctx.beginPath();
  circle(ctx, dotCircle(mark, mark.selected));
  ctx.fill();
  style(ctx, { lineWidth: ringWidth, strokeStyle: theme.foreground });
  ctx.beginPath();
  circle(ctx, dotCircle(mark, mark.selected, ringGap));
  ctx.stroke();
}

/** A series' dots. */
function paintDots(painting: Painting, mark: DotsMark): void {
  paintRest(painting, mark);
  if (mark.selected !== -1) {
    paintSelected(painting, mark);
  }
}

export { paintDots };
