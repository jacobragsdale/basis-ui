/* Counters for measuring a grid's drawing: how often it draws, how much, how much of the canvas it repaints, and how
 * long the engine's answers take to reach the screen. */

import type { FrameData } from "#frame/frame.ts";

/** How many recent timings the counters keep. */
const kept = 100;

/** A change, such as a sort or a filter, sent at one time and drawn at another, by `performance.now()`. */
interface Timed {
  readonly sentAtMs: number;
  readonly drawnAtMs: number;
}

/** Counters for measuring the grid. */
interface DrawStats {
  readonly frames: number;
  readonly fullDraws: number;
  readonly cellDraws: number;
  /** Draws that moved the pixels of a scroll rather than repainting them, which `fullDraws` does not count. */
  readonly copies: number;
  /** The device pixels repainted, in all: the whole canvas for a full redraw, and for any other draw the rows or
   * columns a scroll exposed and the cells drawn again. A remote desktop, such as Citrix's, sends what changed, so
   * this is the cost it sees. Pixels a scroll moves are not counted. */
  readonly paintedPx: number;
  readonly drawMs: number;
  /** For the most recent frames that answered a request, the time from asking for the rows to drawing them, in ms. */
  readonly latencyMs: readonly number[];
  /** When the view last began opening and when its first rows were drawn, by `performance.now()`; null until
   * drawn. */
  readonly firstRows: { readonly openedAtMs: number; readonly drawnAtMs: number } | null;
  /** For the most recent layout changes, when each was sent and when its answer was drawn. */
  readonly changes: readonly Timed[];
}

const none: DrawStats = {
  cellDraws: 0,
  changes: [],
  copies: 0,
  drawMs: 0,
  firstRows: null,
  frames: 0,
  fullDraws: 0,
  latencyMs: [],
  paintedPx: 0,
};

/** The newest of `values` with `value` added, at most {@link kept} of them. */
function keep<TValue>(values: readonly TValue[], value: TValue): readonly TValue[] {
  return [...values.slice(1 - kept), value];
}

/** Keeps a grid's drawing counters. */
class DrawCounter {
  #stats: DrawStats = none;
  /** When the rows of the last frame timed were asked for, and the change it answered, so each is counted once. */
  #timedRequest: number | null = null;
  #timedChange: number | null = null;
  #openedAtMs: number | null = null;

  public get stats(): DrawStats {
    return this.#stats;
  }

  /** Records when the view began opening. */
  public opening(atMs: number): void {
    this.#openedAtMs = atMs;
  }

  /** Counts a draw that repainted everything, or that moved a scroll's pixels. */
  public began(kind: "full" | "copy" | "partial"): void {
    const stats = this.#stats;
    this.#stats = {
      ...stats,
      copies: stats.copies + (kind === "copy" ? 1 : 0),
      fullDraws: stats.fullDraws + (kind === "full" ? 1 : 0),
    };
  }

  /** Counts a frame drawn: its cells, the device pixels it repainted, the time it took, and how long its rows and its
   * change took to arrive. */
  public drew(
    frame: FrameData,
    {
      cells,
      painted,
      started,
    }: { readonly cells: number; readonly painted: number; readonly started: number },
  ): void {
    const now = performance.now();
    const stats = this.#stats;
    this.#stats = {
      cellDraws: stats.cellDraws + cells,
      changes: this.#changes(frame, now),
      copies: stats.copies,
      drawMs: stats.drawMs + now - started,
      firstRows: this.#firstRows(now),
      frames: stats.frames + 1,
      fullDraws: stats.fullDraws,
      latencyMs: this.#latencies(frame, now),
      paintedPx: stats.paintedPx + painted,
    };
  }

  #latencies(frame: FrameData, now: number): readonly number[] {
    const asked = frame.requestedAtMs;
    if (asked === undefined || asked === this.#timedRequest) {
      return this.#stats.latencyMs;
    }
    this.#timedRequest = asked;
    return keep(this.#stats.latencyMs, now - asked);
  }

  #changes(frame: FrameData, now: number): readonly Timed[] {
    const changed = frame.changedAtMs;
    if (changed === undefined || changed === this.#timedChange) {
      return this.#stats.changes;
    }
    this.#timedChange = changed;
    return keep(this.#stats.changes, { drawnAtMs: now, sentAtMs: changed });
  }

  /** The first frame drawn after the view began opening holds its first rows. */
  #firstRows(now: number): DrawStats["firstRows"] {
    const opened = this.#openedAtMs;
    const known = this.#stats.firstRows;
    return opened !== null && opened !== known?.openedAtMs
      ? { drawnAtMs: now, openedAtMs: opened }
      : known;
  }
}

export { DrawCounter };
export type { DrawStats };
