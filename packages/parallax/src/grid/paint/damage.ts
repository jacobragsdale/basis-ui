/* What a draw repaints, in device pixels: the measure of its cost on a remote desktop, such as Citrix's, which sends
 * what changed. A full redraw repaints the whole canvas; a scroll that moves its pixels repaints the band or strip it
 * exposed; and any draw repaints the cells it draws again, as far as they show. */

import { snapRect } from "#canvas/device-pixels.ts";

import type { Rect } from "./canvas.ts";

/** A span of device pixels, `[start, end)`, down the canvas for rows or across it for columns. */
interface Span {
  readonly start: number;
  readonly end: number;
}

/** What a scroll exposed, in device pixels: a band of the body's rows, across the canvas, or a strip of the scrolling
 * columns, down it. */
interface Exposed extends Span {
  readonly axis: "rows" | "columns";
}

/** A rectangle in device pixels, `[left, top, right, bottom]`. */
type Box = readonly [left: number, top: number, right: number, bottom: number];

/** `rect`, in CSS pixels, as the device pixels a fill of it covers at `ratio`. */
function boxOf(rect: Rect, ratio: number): Box {
  const [x, y, width, height] = snapRect(rect, { ratio });
  const device = (value: number): number => Math.round(value * ratio);
  return [device(x), device(y), device(x + width), device(y + height)];
}

function areaOf([left, top, right, bottom]: Box): number {
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function intersect(
  [left, top, right, bottom]: Box,
  [otherLeft, otherTop, otherRight, otherBottom]: Box,
): Box {
  return [
    Math.max(left, otherLeft),
    Math.max(top, otherTop),
    Math.min(right, otherRight),
    Math.min(bottom, otherBottom),
  ];
}

/** The box of `exposed` on a canvas `width` by `height` device pixels. */
function exposedBox(exposed: Exposed, [width, height]: readonly [number, number]): Box {
  return exposed.axis === "rows"
    ? [0, exposed.start, width, exposed.end]
    : [exposed.start, 0, exposed.end, height];
}

/** The device pixels a span of `size` CSS pixels from `start` covers at `ratio`, within `[low, high)`. */
function spanOf(
  [start, size]: readonly [number, number],
  {
    ratio,
    within: [low, high],
  }: { readonly ratio: number; readonly within: readonly [number, number] },
): Span {
  return {
    end: Math.min(high, Math.round((start + size) * ratio)),
    start: Math.max(low, Math.round(start * ratio)),
  };
}

/** Whether a pass draws the row or column at `span`, along `axis`: a pass that paints what a scroll exposed draws those
 * that meet it, a pass beside one leaves those wholly within it, and any other draws them all. */
function drawsSpan(
  { only, besides }: { readonly only: Exposed | null; readonly besides: Exposed | null },
  axis: Exposed["axis"],
  span: Span,
): boolean {
  if (only !== null) {
    return only.axis !== axis || (span.end > only.start && span.start < only.end);
  }
  if (besides?.axis === axis) {
    return span.start < besides.start || span.end > besides.end;
  }
  return true;
}

/** Counts the device pixels a draw repaints. A cell drawn again counts as far as it shows within the area it is
 * clipped to, and not where the scroll's exposed area, counted whole, already covers it. */
class Tally {
  readonly #ratio: number;
  readonly #exposed: Box | null;
  /** Whether cells count: not in a pass that has counted its whole area already. */
  readonly #cells: boolean;
  #px = 0;

  public constructor({
    ratio,
    exposed,
    cells,
  }: {
    readonly ratio: number;
    readonly exposed: Box | null;
    readonly cells: boolean;
  }) {
    this.#ratio = ratio;
    this.#exposed = exposed;
    this.#cells = cells;
  }

  /** The device pixels counted. */
  public get px(): number {
    return this.#px;
  }

  /** Counts an area repainted whole, in device pixels. */
  public area(box: Box): void {
    this.#px += areaOf(box);
  }

  /** Counts a cell drawn again at `rect`, as far as it shows within `within`, both in CSS pixels. */
  public cell(rect: Rect, within: Rect): void {
    if (!this.#cells) {
      return;
    }
    const shown = intersect(boxOf(rect, this.#ratio), boxOf(within, this.#ratio));
    const covered = this.#exposed === null ? 0 : areaOf(intersect(shown, this.#exposed));
    this.#px += areaOf(shown) - covered;
  }
}

export { Tally, boxOf, drawsSpan, exposedBox, spanOf };
export type { Box, Exposed, Span };
