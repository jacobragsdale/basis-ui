/* A window a view asks the engine for, of which one at a time is in flight and only the newest waits: scrolling,
 * zooming or panning faster than frames arrive replaces the window waiting instead of queueing them, so the engine is
 * never flooded and the screen never falls behind. */

/** A window in flight: its request, and when it was asked for, or null when an update carried it untimed. */
interface InFlight<TWindow> {
  readonly window: TWindow;
  readonly requestId: bigint;
  readonly askedAtMs: number | null;
}

/** A window waiting behind the one in flight, and when it was asked for. */
interface Waiting<TWindow> {
  readonly window: TWindow;
  readonly askedAtMs: number;
}

/** How a slot compares and sends its windows. */
interface SlotOptions<TWindow> {
  readonly same: (first: TWindow, second: TWindow) => boolean;
  /** Sends a request for the window and returns its request id. */
  readonly send: (window: TWindow) => bigint;
}

/** One kind of window a view asks for: rows and columns, or a chart's range. */
class WindowSlot<TWindow> {
  readonly #options: SlotOptions<TWindow>;
  #inFlight: InFlight<TWindow> | null = null;
  #waiting: Waiting<TWindow> | null = null;
  /** The window last answered, which the view shows until it asks for another. */
  #answered: TWindow | null = null;

  public constructor(options: SlotOptions<TWindow>) {
    this.#options = options;
  }

  /** The newest window asked for, whether answered yet or not. */
  public requested(): TWindow | null {
    return this.#waiting?.window ?? this.#inFlight?.window ?? null;
  }

  /** The newest window asked for, answered or not, so that a view at rest still has one: what a layout update is
   * answered with. Null before the first. */
  public latest(): TWindow | null {
    return this.requested() ?? this.#answered;
  }

  /** Asks for `window`, at once unless one is in flight or `held` says an update is waiting; then it waits, replacing
   * any window already waiting. */
  public ask(window: TWindow, held: boolean): void {
    if (this.#isWaiting(window)) {
      return;
    }
    // Back to the window in flight: whatever was waiting is no longer wanted.
    if (this.#isInFlight(window)) {
      this.#waiting = null;
      return;
    }
    // The clock starts now, so time spent waiting behind the request in flight counts.
    const askedAtMs = performance.now();
    if (this.#inFlight !== null || held) {
      this.#waiting = { askedAtMs, window };
    } else {
      this.#dispatch(window, askedAtMs);
    }
  }

  /** Records `window` as in flight under an update's request, untimed, since the update is timed instead. The window
   * waiting is no longer wanted: the update's answer holds the newest. */
  public carried(window: TWindow, requestId: bigint): void {
    this.#waiting = null;
    this.#inFlight = { askedAtMs: null, requestId, window };
  }

  /** Releases the window in flight if `requestId` answers it, and sends the one waiting unless `held`. Returns when
   * the answered window was asked for, if it was timed. */
  public settle(requestId: bigint, held: boolean): number | undefined {
    if (this.#inFlight?.requestId !== requestId) {
      return undefined;
    }
    const { askedAtMs, window } = this.#inFlight;
    this.#answered = window;
    this.#inFlight = null;
    if (!held) {
      this.flush();
    }
    return askedAtMs ?? undefined;
  }

  /** Sends the window waiting, if nothing is in flight. */
  public flush(): void {
    const next = this.#waiting;
    if (next !== null && this.#inFlight === null) {
      this.#waiting = null;
      this.#dispatch(next.window, next.askedAtMs);
    }
  }

  /** Forgets every window, as when the view closes. */
  public clear(): void {
    this.#inFlight = null;
    this.#waiting = null;
    this.#answered = null;
  }

  #isWaiting(window: TWindow): boolean {
    return this.#waiting !== null && this.#options.same(this.#waiting.window, window);
  }

  #isInFlight(window: TWindow): boolean {
    return this.#inFlight !== null && this.#options.same(this.#inFlight.window, window);
  }

  #dispatch(window: TWindow, askedAtMs: number): void {
    const requestId = this.#options.send(window);
    this.#inFlight = { askedAtMs, requestId, window };
  }
}

export { WindowSlot };
export type { SlotOptions };
