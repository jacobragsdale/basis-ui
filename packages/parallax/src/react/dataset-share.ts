/* What the components of one page share of each dataset: one load for the same request, and the count of those that
 * show it, so that the last to unmount unloads it. */

import type { ParallaxClient } from "#engine/client.ts";
import type { LoadProgress } from "#engine/limits.ts";

import type { LoadRequest, LoadState } from "./dataset-load.ts";

/** A load that several components wait on, and who hears its progress. */
interface SharedLoad {
  readonly request: LoadRequest;
  /** The client's engine the load ran on: a closed engine's loads are gone with it. */
  readonly generation: number;
  readonly outcome: Promise<LoadState>;
  readonly listeners: Set<(progress: LoadProgress) => void>;
}

/** One client's datasets: the components that show each, and its latest load. */
interface Share {
  readonly holders: Map<string, number>;
  readonly loads: Map<string, SharedLoad>;
}

const shares = new WeakMap<ParallaxClient, Share>();

function shareOf(client: ParallaxClient): Share {
  let share = shares.get(client);
  if (share === undefined) {
    share = { holders: new Map(), loads: new Map() };
    shares.set(client, share);
  }
  return share;
}

/** Whether two requests load the same data on the same engine. */
function sameLoad(first: LoadRequest, second: LoadRequest): boolean {
  return (
    first.engine === second.engine &&
    first.name === second.name &&
    first.source === second.source &&
    first.reloads === second.reloads &&
    first.primaryKey === second.primaryKey &&
    first.receivedAtMicros === second.receivedAtMicros &&
    first.sourceAsOfMicros === second.sourceAsOfMicros
  );
}

/** How a component takes part in a load: it hears the progress, and `run` runs the load if none is shared. */
interface Joining {
  readonly progress: (state: LoadProgress) => void;
  readonly run: (progress: (state: LoadProgress) => void) => Promise<LoadState>;
}

/** Waits for a shared load's outcome, hearing its progress meanwhile. */
async function heard(
  shared: SharedLoad,
  progress: (state: LoadProgress) => void,
): Promise<LoadState> {
  shared.listeners.add(progress);
  try {
    return await shared.outcome;
  } finally {
    shared.listeners.delete(progress);
  }
}

/** Starts `request`'s load, for every component that asks for the same data to share. */
function begin(client: ParallaxClient, request: LoadRequest, run: Joining["run"]): SharedLoad {
  const listeners = new Set<(state: LoadProgress) => void>();
  const outcome = run((state) => {
    for (const listener of listeners) {
      listener(state);
    }
  });
  // The load has started the engine by now, if none ran.
  const shared = { generation: client.generation, listeners, outcome, request };
  shareOf(client).loads.set(request.name, shared);
  return shared;
}

/**
 * The outcome of `request`'s load, run once by `run` for every component that asks for the same data on the same
 * engine, whichever asks first; each hears its progress through `progress`. A load already settled answers at once,
 * as long as some component still shows its dataset.
 */
async function sharedLoad(
  client: ParallaxClient,
  request: LoadRequest,
  { progress, run }: Joining,
): Promise<LoadState> {
  const existing = shareOf(client).loads.get(request.name);
  const current =
    existing !== undefined &&
    client.running &&
    existing.generation === client.generation &&
    sameLoad(existing.request, request);
  const shared = current ? existing : begin(client, request, run);
  return heard(shared, progress);
}

/**
 * Counts a component that shows dataset `name`, and returns the function that stops counting it. When none is left,
 * the dataset is unloaded, after the rest of the commit, so a page that hands the dataset to another component, or
 * StrictMode's second run of an effect, keeps it.
 */
function holdDataset(client: ParallaxClient, name: string): () => void {
  const { holders, loads } = shareOf(client);
  holders.set(name, (holders.get(name) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    const left = (holders.get(name) ?? 1) - 1;
    holders.set(name, left);
    if (left > 0) {
      return;
    }
    setTimeout(() => {
      if ((holders.get(name) ?? 0) === 0) {
        holders.delete(name);
        loads.delete(name);
        client.unload(name).catch(() => null);
      }
    }, 0);
  };
}

export { holdDataset, sharedLoad };
