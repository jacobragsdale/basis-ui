// Calling a function less often than it is asked to be called: debounce, throttle and once a frame, each with
// es-toolkit's (MIT) options, `edges` and `signal`, and its `cancel` and `flush`; and a sleep an AbortSignal can end.

/** When a call runs: at the start of a burst of calls, at its end, or both. */
type Edge = "leading" | "trailing";

interface TimingOptions {
  /** Which edges call the function. Debounce calls on the trailing edge, and throttle on both, unless set. */
  readonly edges?: readonly Edge[];
  /** Aborting it cancels a pending call and stops later ones, as a component's unmount does. */
  readonly signal?: AbortSignal;
}

/** A function whose calls are held back, with ways to drop or run the one held. */
interface ControlledFunction<TArgs extends unknown[]> {
  (...args: TArgs): void;
  /** Drops the held call. */
  readonly cancel: () => void;
  /** Runs the held call now, if there is one and the trailing edge would have run it. */
  readonly flush: () => void;
}

type DebouncedFunction<TArgs extends unknown[]> = ControlledFunction<TArgs>;
type ThrottledFunction<TArgs extends unknown[]> = ControlledFunction<TArgs>;

/** The latest arguments a held-back call will run with, and the timer that will run it. */
class Held<TArgs extends unknown[]> {
  public timer: ReturnType<typeof setTimeout> | undefined = undefined;
  public args: TArgs | undefined = undefined;
  readonly #func: (...args: TArgs) => void;

  public constructor(func: (...args: TArgs) => void) {
    this.#func = func;
  }

  /** Runs the held call, if any, and holds nothing after. */
  public run(): void {
    const { args } = this;
    this.args = undefined;
    if (args !== undefined) {
      this.#func(...args);
    }
  }

  public stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  public cancel(): void {
    this.stop();
    this.args = undefined;
  }

  public flush(trailing: boolean): void {
    this.stop();
    if (trailing) {
      this.run();
    } else {
      this.args = undefined;
    }
  }
}

function edgesOf(
  edges: readonly Edge[],
  wait: number,
): { readonly leading: boolean; readonly trailing: boolean } {
  if (edges.length === 0) {
    throw new RangeError(
      "With no edges, the function would never be called: name leading, trailing or both.",
    );
  }
  if (!Number.isFinite(wait) || wait < 0) {
    throw new RangeError(`A wait of ${String(wait)} ms is not a duration from 0.`);
  }
  return { leading: edges.includes("leading"), trailing: edges.includes("trailing") };
}

function controlled<TArgs extends unknown[]>(
  call: (...args: TArgs) => void,
  held: Held<TArgs>,
  trailing: boolean,
): ControlledFunction<TArgs> {
  return Object.assign(call, {
    cancel: () => {
      held.cancel();
    },
    flush: () => {
      held.flush(trailing);
    },
  });
}

/** Calls `func` once calls have stopped for `debounceMs`, with the last call's arguments: for a search box, or a
 * layout saved as it is dragged. With the leading edge, the first call of a burst also runs at once. */
function debounce<TArgs extends unknown[]>(
  func: (...args: TArgs) => void,
  debounceMs: number,
  { edges = ["trailing"], signal }: TimingOptions = {},
): DebouncedFunction<TArgs> {
  const { leading, trailing } = edgesOf(edges, debounceMs);
  const held = new Held(func);
  signal?.addEventListener("abort", () => {
    held.cancel();
  });
  return controlled(
    (...args: TArgs) => {
      if (signal?.aborted === true) {
        return;
      }
      const idle = held.timer === undefined;
      held.args = args;
      held.stop();
      held.timer = setTimeout(() => {
        held.flush(trailing);
      }, debounceMs);
      if (leading && idle) {
        held.run();
      }
    },
    held,
    trailing,
  );
}

/** Calls `func` at most once every `throttleMs`: at once on the leading edge, and with the latest arguments at the end
 * of the wait on the trailing edge, which then starts a new wait. Calls are never closer than `throttleMs`, where
 * lodash's throttle can call again right after a trailing call. */
function throttle<TArgs extends unknown[]>(
  func: (...args: TArgs) => void,
  throttleMs: number,
  { edges = ["leading", "trailing"], signal }: TimingOptions = {},
): ThrottledFunction<TArgs> {
  const { leading, trailing } = edgesOf(edges, throttleMs);
  const held = new Held(func);
  const startWait = (): void => {
    held.timer = setTimeout(() => {
      held.timer = undefined;
      if (trailing && held.args !== undefined) {
        held.run();
        startWait();
      }
      held.args = undefined;
    }, throttleMs);
  };
  signal?.addEventListener("abort", () => {
    held.cancel();
  });
  return controlled(
    (...args: TArgs) => {
      if (signal?.aborted === true) {
        return;
      }
      held.args = args;
      if (held.timer === undefined) {
        if (leading) {
          held.run();
        }
        startWait();
      }
    },
    held,
    trailing,
  );
}

/** Calls `func` at most once an animation frame, with the latest arguments: for pointer moves and scroll handlers
 * that draw. */
function rafThrottle<TArgs extends unknown[]>(
  func: (...args: TArgs) => void,
): ControlledFunction<TArgs> {
  let frame: number | undefined = undefined;
  let pending: TArgs | undefined = undefined;
  const run = (): void => {
    frame = undefined;
    const args = pending;
    pending = undefined;
    if (args !== undefined) {
      func(...args);
    }
  };
  const stop = (): void => {
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
    }
  };
  const call = (...args: TArgs): void => {
    pending = args;
    frame ??= requestAnimationFrame(run);
  };
  return Object.assign(call, {
    cancel: () => {
      stop();
      frame = undefined;
      pending = undefined;
    },
    flush: () => {
      stop();
      run();
    },
  });
}

/** Resolves after `ms`, or rejects with the signal's reason, an `AbortError` unless it was given another, as soon as
 * the signal aborts. */
async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const { promise, reject, resolve } = Promise.withResolvers<undefined>();
  const timer = setTimeout(resolve, ms);
  const abort = (): void => {
    clearTimeout(timer);
    reject(signal?.reason);
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    await promise;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

export { debounce, rafThrottle, sleep, throttle };
export type { ControlledFunction, DebouncedFunction, Edge, ThrottledFunction, TimingOptions };
