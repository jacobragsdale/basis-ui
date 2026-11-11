/* A drag that selects past the body's edge scrolls the grid that way, a row or a step across at a time, and keeps on
 * while the pointer stays out, so a range can reach rows and columns not yet in view. */

import type { GridHost } from "./host.ts";

/** How often a held drag scrolls again, in ms, and how far a step across goes, in CSS pixels. */
const everyMs = 50;
const acrossPx = 40;

/** `step` when `at` is past `high`, `-step` when it is before `low`, and 0 between them. */
function past(at: number, [low, high]: readonly [number, number], step: number): number {
  if (at > high) {
    return step;
  }
  return at < low ? -step : 0;
}

/** Scrolls while a selecting drag is past the body's edge. */
class EdgeScroll {
  readonly #host: GridHost;
  #timer: ReturnType<typeof setInterval> | null = null;
  #step: readonly [across: number, down: number] = [0, 0];

  public constructor(host: GridHost) {
    this.#host = host;
  }

  /** Follows a selecting drag at `x`, `y` on the canvas: scrolls while it is past an edge, and stops once it is in. */
  public follow(x: number, y: number): void {
    const metrics = this.#host.metrics();
    const { canvas } = this.#host.dom.parts;
    if (metrics === null) {
      return;
    }
    this.#step = [
      past(x, [0, canvas.clientWidth], acrossPx),
      past(y, [metrics.headerPx, canvas.clientHeight], metrics.rowPx),
    ];
    if (this.#step[0] === 0 && this.#step[1] === 0) {
      this.stop();
      return;
    }
    this.#scroll();
    this.#timer ??= setInterval(() => {
      this.#scroll();
    }, everyMs);
  }

  /** Stops scrolling, as when the drag ends or comes back in. */
  public stop(): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  #scroll(): void {
    const { scroll } = this.#host.dom.parts;
    const [across, down] = this.#step;
    scroll.scrollBy({ left: across, top: down });
  }
}

export { EdgeScroll };
