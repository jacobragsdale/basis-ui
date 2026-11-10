/* One load of `useDataset`'s: what it is for, how it stands, and how it runs, reporting its progress and its outcome
 * while the effect that started it holds. */

import type { ParallaxClient } from "#engine/client.ts";
import type { LoadOptions, LoadProgress } from "#engine/limits.ts";

import { applyWhenCurrent } from "./current.ts";

/**
 * Where a dataset's Arrow IPC stream comes from: bytes the app holds, or a function that fetches them. A function that
 * returns the response itself, such as `() => fetch(url)`, streams it: its body moves to the engine as it arrives, and
 * a first load's rows show batch by batch, the first long before the last has come. One that returns bytes, such as
 * `() => fetch(url).then((response) => response.arrayBuffer())`, shows them once they have all come. Bytes the app
 * holds are copied before they move to the engine, so the app's copy, such as a query cache's, stays readable; a
 * function's bytes or body move without a copy, so it returns fresh ones each call. After the engine restarts, the hook
 * loads the source again.
 */
type DatasetSource =
  | ArrayBuffer
  | (() => ArrayBuffer | Response | PromiseLike<ArrayBuffer | Response>);

/** Where a dataset's load stands. `idle` has no source yet. */
type DatasetStatus = "idle" | "loading" | "loaded" | "failed";

/** A load's state. */
interface LoadState {
  readonly status: DatasetStatus;
  /** The rows the table holds, once loaded. */
  readonly rows: number | null;
  /** Why the load failed, as the engine or the source said. */
  readonly error: string | null;
  /** Where a load under way stands, once the engine has read rows of it: the rows read of the rows expected, and
   * whether they show yet. Null when no load is under way, or before its first rows. */
  readonly progress: LoadProgress | null;
}

/** What one load is for: when any of it changes, the dataset loads again. */
interface LoadRequest {
  readonly name: string;
  readonly source: DatasetSource;
  readonly reloads: number;
  readonly engine: number;
  readonly primaryKey: string | null;
  readonly receivedAtMicros: number | undefined;
  readonly sourceAsOfMicros: number | undefined;
}

/** A load's outcome, with the request it answered. */
interface Settled {
  readonly request: LoadRequest;
  readonly state: LoadState;
}

const idle: LoadState = { error: null, progress: null, rows: null, status: "idle" };
const loading: LoadState = { error: null, progress: null, rows: null, status: "loading" };

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The options a request loads with. */
function optionsOf({ primaryKey, receivedAtMicros, sourceAsOfMicros }: LoadRequest): LoadOptions {
  return {
    primaryKey,
    ...(receivedAtMicros === undefined ? {} : { receivedAtMicros }),
    ...(sourceAsOfMicros === undefined ? {} : { sourceAsOfMicros }),
  };
}

/** Loads a request's source, telling `progress` where it stands, and settling to the load's state. */
async function load(
  client: ParallaxClient,
  request: LoadRequest,
  progress: (state: LoadProgress) => void,
): Promise<LoadState> {
  const { name, source } = request;
  try {
    // A copy of the app's bytes, or what its function returns.
    const bytes = typeof source === "function" ? source() : structuredClone(source);
    const { rows } = await client.load(name, bytes, {
      ...optionsOf(request),
      onProgress: progress,
    });
    return { error: null, progress: null, rows, status: "loaded" };
  } catch (error: unknown) {
    return { error: describe(error), progress: null, rows: null, status: "failed" };
  }
}

/** Starts a request's load, applying its outcome while the effect that started it holds. */
function start(
  client: ParallaxClient,
  request: LoadRequest,
  settle: (settled: Settled) => void,
): () => void {
  let live = true;
  const apply = (state: LoadState): void => {
    settle({ request, state });
  };
  const progress = (state: LoadProgress): void => {
    if (live) {
      apply({ ...loading, progress: state });
    }
  };
  applyWhenCurrent(load(client, request, progress), () => live, apply).catch(reportError);
  return () => {
    live = false;
  };
}

export { idle, loading, start };
export type { DatasetSource, DatasetStatus, LoadRequest, LoadState, Settled };
