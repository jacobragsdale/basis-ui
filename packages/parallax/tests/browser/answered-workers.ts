/* Workers the test answers itself, for the hooks' tests of what the engine says rarely, such as a planned restart: each
 * records what the page posts, and the test answers as the engine's worker would. */

import type { ToWorker } from "#engine/messages.ts";
import type { WorkerPort } from "#engine/port.ts";

/** A worker that records what the page posts, and lets the test answer. */
interface AnsweredWorker extends WorkerPort {
  readonly posted: ToWorker[];
  readonly terminated: () => boolean;
  /** Sends the page a message, as the worker would. */
  readonly answer: (data: unknown) => void;
}

function answeredWorker(): AnsweredWorker {
  const posted: ToWorker[] = [];
  const listeners = new Map<string, (event: Event) => void>();
  let terminated = false;
  return {
    addEventListener: (type, listener): void => {
      listeners.set(type, listener);
    },
    answer: (data): void => {
      listeners.get("message")?.(new MessageEvent("message", { data }));
    },
    postMessage: (message): void => {
      posted.push(message);
    },
    posted,
    terminate: (): void => {
      terminated = true;
    },
    terminated: () => terminated,
  };
}

/** The workers started so far, newest last. */
interface AnsweredWorkers {
  readonly all: readonly AnsweredWorker[];
  readonly start: () => AnsweredWorker;
  readonly current: () => AnsweredWorker;
}

function answeredWorkers(): AnsweredWorkers {
  const all: AnsweredWorker[] = [];
  return {
    all,
    current: () => all.at(-1) ?? answeredWorker(),
    start: () => {
      const worker = answeredWorker();
      all.push(worker);
      return worker;
    },
  };
}

export { answeredWorkers };
export type { AnsweredWorker, AnsweredWorkers };
