/* Zooming and panning without a render each frame: the x range a gesture shows goes to the engine at most once an
 * animation frame, as a chart window, and reaches the layout only once the gesture ends, as one change. */

import type { Range } from "./range.ts";

/** How long the wheel rests before its zoom is recorded in the layout, in milliseconds. */
const wheelRestMs = 250;

/** What zooming reads from its chart, and how it asks and records. */
interface ZoomHost {
  /** The data's whole x range, from the latest frame, or null before one. */
  readonly extent: () => Range | null;
  /** The range the layout records, or null for everything. */
  readonly recorded: () => Range | null;
  /** Asks the engine for the chart over `range`, or over everything. */
  readonly ask: (range: Range | null) => void;
  /** Records `range` in the layout, or everything for null. */
  readonly record: (range: Range | null) => void;
}

/** A range a gesture asked for: null for everything. */
interface Wanted {
  readonly range: Range | null;
}

/** Whether two ranges, or two nulls for everything, are the same. */
function sameRange(first: Range | null, second: Range | null): boolean {
  return first?.[0] === second?.[0] && first?.[1] === second?.[1];
}

/** The x range a chart shows while it is zoomed and panned. */
class ChartZoom {
  readonly #host: ZoomHost;
  /** A zoom or pan waiting for the next animation frame, so that a drag or a burst of wheel events asks once a frame. */
  #pending: Wanted | null = null;
  /** The range asked of the engine and not yet recorded in the layout. */
  #live: Wanted | null = null;
  #frame: number | null = null;
  #rest: ReturnType<typeof setTimeout> | null = null;

  public constructor(host: ZoomHost) {
    this.#host = host;
  }

  /** The range shown, or about to be: a pending zoom or pan, one not yet recorded, the layout's, or everything. */
  public shown(): Range | null {
    const next = this.#pending ?? this.#live;
    if (next !== null) {
      return next.range ?? this.#host.extent();
    }
    return this.#host.recorded() ?? this.#host.extent();
  }

  /** Whether less than everything is shown, or about to be. */
  public zoomed(): boolean {
    const next = this.#pending ?? this.#live;
    return next === null ? this.#host.recorded() !== null : next.range !== null;
  }

  /** Zooms or pans to `range`, or shows everything for null, at the next animation frame. */
  public schedule(range: Range | null): void {
    this.#pending = { range };
    this.#frame ??= requestAnimationFrame(() => {
      this.#frame = null;
      this.flush();
    });
  }

  /** Asks the engine at once for the zoom or pan waiting, if any. */
  public flush(): void {
    const pending = this.#pending;
    this.#pending = null;
    if (pending !== null) {
      this.#live = pending;
      this.#host.ask(pending.range);
    }
  }

  /** Records what is shown in the layout: at once, as when a drag ends, or once the wheel has rested. */
  public settle(when: "now" | "at rest"): void {
    this.#stopRest();
    if (when === "at rest") {
      this.#rest = setTimeout(() => {
        this.#rest = null;
        this.settle("now");
      }, wheelRestMs);
      return;
    }
    this.flush();
    const live = this.#live;
    if (live !== null && !sameRange(live.range, this.#host.recorded())) {
      this.#host.record(live.range);
    }
  }

  /** Shows everything again, and records it. */
  public reset(): void {
    this.#pending = { range: null };
    this.settle("now");
  }

  /** The layout's range changed from `before`: a range this chart recorded, or one set from outside, which wins over
   * any gesture's. */
  public adopt(before: Range | null): void {
    if (!sameRange(before, this.#host.recorded())) {
      this.#live = null;
    }
  }

  /** Stops waiting for the next frame or for the wheel to rest, as when the chart goes. */
  public dispose(): void {
    if (this.#frame !== null) {
      cancelAnimationFrame(this.#frame);
      this.#frame = null;
    }
    this.#stopRest();
  }

  #stopRest(): void {
    if (this.#rest !== null) {
      clearTimeout(this.#rest);
      this.#rest = null;
    }
  }
}

export { ChartZoom, sameRange };
export type { ZoomHost };
