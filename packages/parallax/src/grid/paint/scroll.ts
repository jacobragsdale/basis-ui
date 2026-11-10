/* A scroll that moves pixels. Most of what a scroll shows was on the canvas already, a whole number of rows or a
 * distance across from where it is now, so the painter copies it there with `drawImage`, from the canvas onto itself,
 * and paints only the band of rows or the strip of columns it exposed. It needs whole device pixels (device-pixels.ts):
 * a row whose height is a whole number of them, and a distance across that is, copy to exactly what painting them
 * would draw. Anything else, and a distance as large as the area it moves, is painted whole. */

import type { Exposed } from "./damage.ts";

/** How near a whole number of device pixels a distance must be to be copied, for floating point's error. */
const slack = 1e-3;

/** Where a pass's view sits: its first row and its horizontal scroll, in CSS pixels. */
interface Place {
  readonly first: number;
  readonly scrollLeft: number;
}

/** The canvas a scroll moves on, in device pixels: its size; the body band between the header and the totals row,
 * which rows scroll in; and where the scrolling columns start, after the pinned ones. With its ratio and a row's
 * height in CSS pixels, and whether pinned columns show a line at their edge once anything is scrolled. */
interface Board {
  readonly width: number;
  readonly height: number;
  readonly bodyTop: number;
  readonly bodyBottom: number;
  readonly frozen: number;
  readonly ratio: number;
  readonly rowPx: number;
  readonly pinnedEdge: boolean;
}

/** A copy of the canvas onto itself, `width` by `height` device pixels from `from` to `to`, and what it exposes. */
interface Copy {
  readonly from: readonly [x: number, y: number];
  readonly to: readonly [x: number, y: number];
  readonly width: number;
  readonly height: number;
  readonly exposed: Exposed;
}

/** `value` as a whole number, or null if it is not one within the slack. */
function whole(value: number): number | null {
  const rounded = Math.round(value);
  return Math.abs(value - rounded) <= slack ? rounded : null;
}

/** The copy that moves the body's rows `rows` rows up, down for a negative count, or null if it cannot. */
function rowsCopy(rows: number, board: Board): Copy | null {
  const step = whole(board.rowPx * board.ratio);
  const band = board.bodyBottom - board.bodyTop;
  const distance = step === null ? band : Math.abs(rows) * step;
  if (distance >= band) {
    return null;
  }
  const kept = band - distance;
  const [top, bottom] = [board.bodyTop, board.bodyBottom];
  return rows > 0
    ? {
        exposed: { axis: "rows", end: bottom, start: bottom - distance },
        from: [0, top + distance],
        height: kept,
        to: [0, top],
        width: board.width,
      }
    : {
        exposed: { axis: "rows", end: top + distance, start: top },
        from: [0, top],
        height: kept,
        to: [0, top + distance],
        width: board.width,
      };
}

/** The copy that moves the scrolling columns `across` CSS pixels left, right for a negative distance, or null if it
 * cannot: the distance is not whole device pixels, or the pinned columns' edge appears or goes. */
function columnsCopy(across: number, board: Board, scrolled: boolean): Copy | null {
  const moved = whole(across * board.ratio);
  const strip = board.width - board.frozen;
  if (moved === null || Math.abs(moved) >= strip || (board.pinnedEdge && scrolled)) {
    return null;
  }
  const distance = Math.abs(moved);
  const kept = strip - distance;
  const [left, right] = [board.frozen, board.width];
  return moved > 0
    ? {
        exposed: { axis: "columns", end: right, start: right - distance },
        from: [left + distance, 0],
        height: board.height,
        to: [left, 0],
        width: kept,
      }
    : {
        exposed: { axis: "columns", end: left + distance, start: left },
        from: [left, 0],
        height: board.height,
        to: [left + distance, 0],
        width: kept,
      };
}

/**
 * How a view at `now`, drawn last at `was`, is drawn: `"still"` if it has not moved, a copy if it moved by rows alone or
 * across alone and the copy keeps part of the canvas, or `"paint"` to paint it whole.
 */
function scrollCopy(was: Place, now: Place, board: Board): Copy | "still" | "paint" {
  const rows = now.first - was.first;
  const across = now.scrollLeft - was.scrollLeft;
  if (rows === 0 && across === 0) {
    return "still";
  }
  if (rows !== 0 && across !== 0) {
    return "paint";
  }
  // The pinned columns' edge shows once anything is scrolled, so a scroll to or from the left edge paints it.
  const edge = was.scrollLeft > 0 !== now.scrollLeft > 0;
  const copy = rows === 0 ? columnsCopy(across, board, edge) : rowsCopy(rows, board);
  return copy ?? "paint";
}

/** Sets `context` to draw in device pixels, opaque and unsmoothed, so that an image drawn at whole pixels is copied. */
function untransformed(context: CanvasRenderingContext2D): void {
  context.setTransform(1, 0, 0, 1, 0, 0);
  Object.assign(context, { globalAlpha: 1, imageSmoothingEnabled: false });
}

/** A 2D context of `canvas`, at least `width` by `height` device pixels, ready to copy whole pixels. */
function copyingContext(
  canvas: HTMLCanvasElement,
  { width, height }: { readonly width: number; readonly height: number },
): CanvasRenderingContext2D | null {
  if (canvas.width < width || canvas.height < height) {
    Object.assign(canvas, {
      height: Math.max(canvas.height, height),
      width: Math.max(canvas.width, width),
    });
  }
  const context = canvas.getContext("2d", { alpha: false });
  if (context !== null) {
    untransformed(context);
  }
  return context;
}

/**
 * Copies the canvas onto itself as `copy` says, in device pixels, whatever the context's transform, through `scratch`,
 * a canvas of the painter's own. Drawing a canvas onto itself makes Chromium take a snapshot of the whole canvas and
 * copy it again before the next drawing changes it; through a scratch canvas only the pixels that stay are copied, out
 * and back, which costs half as much. Returns false, having copied nothing, where the scratch canvas has no context.
 */
function blit(
  context: CanvasRenderingContext2D,
  { copy, scratch }: { copy: Copy; scratch: HTMLCanvasElement },
): boolean {
  const { from, to, width, height } = copy;
  const kept = copyingContext(scratch, copy);
  if (kept === null) {
    return false;
  }
  kept.drawImage(context.canvas, from[0], from[1], width, height, 0, 0, width, height);
  context.save();
  untransformed(context);
  context.drawImage(scratch, 0, 0, width, height, to[0], to[1], width, height);
  context.restore();
  return true;
}

export { blit, scrollCopy };
export type { Board, Copy, Place };
