/* One worker the engine runs in, the connection to its engine, and why it stopped, once it has; and what a load whose
 * bytes arrive late finds of it. */

import { Connection } from "./connection.ts";
import type { Job, LoadBody } from "./holdings.ts";
import { listen } from "./port.ts";
import type { PortListener, WorkerPort } from "./port.ts";

/** One worker and the connection to its engine, and why it stopped, once it has. */
interface Running {
  readonly worker: WorkerPort;
  readonly connection: Connection;
  stopped: string | null;
}

/** Starts a worker and the connection to its engine; `listener` hears the worker while `current` says it is the
 * page's. */
function spawn(
  start: () => WorkerPort,
  current: (worker: WorkerPort) => boolean,
  listener: PortListener,
): Running {
  const worker = start();
  const connection = new Connection({
    close: (): void => {
      worker.terminate();
    },
    send: (bytes): void => {
      worker.postMessage({ bytes, kind: "message" }, { transfer: [] });
    },
  });
  listen(worker, () => current(worker), listener);
  return { connection, stopped: null, worker };
}

/** Why a load nobody waits for any more, which its signal cancelled, loads nothing. */
function cancelled(dataset: string): Error {
  return new Error(`${dataset}'s load was cancelled, as nothing waits for it any more.`);
}

/** Why a load of a dataset unloaded before its data arrived loads nothing. */
function unloadedFirst(dataset: string): Error {
  return new Error(`${dataset} was unloaded before its data arrived, so it was not loaded.`);
}

/**
 * Refuses a load whose bytes arrived after it was asked for, if they load nothing: the worker it was meant for
 * stopped meanwhile, and the one that replaced it is not its; its dataset was unloaded meanwhile, `dropped`, and no
 * component shows it; or it was cancelled, as nobody waits for it. A response's body is then cancelled unread.
 */
async function checkArrival(
  running: Running,
  { job, dropped }: { readonly job: Job; readonly dropped: boolean },
  body: LoadBody,
): Promise<void> {
  let refusal: Error | null = null;
  if (running.stopped !== null) {
    refusal = new Error(running.stopped);
  } else if (dropped) {
    refusal = unloadedFirst(job.dataset);
  } else if (job.signal?.aborted === true) {
    refusal = cancelled(job.dataset);
  }
  if (refusal === null) {
    return;
  }
  if (body instanceof Response && body.body?.locked === false) {
    await body.body.cancel();
  }
  throw refusal;
}

export { cancelled, checkArrival, spawn, unloadedFirst };
export type { Running };
