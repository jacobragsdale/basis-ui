/* The worker the engine runs in, as the page sees it, and how the page listens to it. */

import type { ToWorker } from "./messages.ts";

/** What the page needs from a worker; a `Worker` provides it. */
interface WorkerPort {
  /** `options.transfer` lists buffers that move to the worker with the message rather than being copied. */
  readonly postMessage: (message: ToWorker, options: StructuredSerializeOptions) => void;
  /** Called for `message`, `messageerror` and `error`. */
  readonly addEventListener: (type: string, listener: (event: Event) => void) => void;
  readonly terminate: () => void;
}

/** What the page does with a worker's events. */
interface PortListener {
  readonly message: (data: unknown) => void;
  /** The worker cannot go on, for the reason given. */
  readonly fail: (reason: string) => void;
}

/** Why a worker never started, from its error event. */
function startFailure(event: Event): string {
  const detail = event instanceof ErrorEvent && event.message !== "" ? `: ${event.message}` : "";
  return `The parallax worker did not start; check that the worker the app gives ParallaxProvider serves the package's worker${detail}.`;
}

/** Listens to a worker's messages and failures, for as long as `current` says it is the page's worker; a worker
 * that has been replaced is never heard from again. */
function listen(worker: WorkerPort, current: () => boolean, listener: PortListener): void {
  worker.addEventListener("message", (event) => {
    if (current()) {
      listener.message(event instanceof MessageEvent ? event.data : null);
    }
  });
  worker.addEventListener("messageerror", () => {
    if (current()) {
      listener.fail("The parallax worker sent a message the page could not read.");
    }
  });
  // A script that is missing, blocked or broken never posts anything.
  worker.addEventListener("error", (event) => {
    if (current()) {
      listener.fail(startFailure(event));
    }
  });
}

/** Whether `bytes` are still on their way, rather than in hand. */
function arriving<TBytes extends object>(
  bytes: TBytes | PromiseLike<TBytes>,
): bytes is PromiseLike<TBytes> {
  return "then" in bytes && typeof bytes.then === "function";
}

export { arriving, listen };
export type { PortListener, WorkerPort };
