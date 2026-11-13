/* One load of `useDataset`'s: what it is for, how it stands, and how it runs, reporting its progress and its outcome
 * while the effect that started it holds. */

import type { ParallaxClient } from "#engine/client.ts";
import { loadLimits } from "#engine/limits.ts";
import type { LoadOptions, LoadProgress } from "#engine/limits.ts";
import { checkBytes } from "#engine/stream.ts";

import { applyWhenCurrent } from "./current.ts";
import { sharedLoad } from "./dataset-share.ts";

/** What a dataset's source is given each time it is called: `signal` aborts once no component waits for the load,
 * as when the source changes again or the component unmounts first, so pass it to the fetch. */
interface SourceContext {
  readonly signal: AbortSignal;
}

/**
 * Where a dataset's Arrow IPC stream comes from: bytes the app holds, or a function that fetches them. A function that
 * returns the response itself, such as `() => fetch(url)`, streams it: its body moves to the engine as it arrives, and
 * a first load's rows show batch by batch, the first long before the last has come. One that returns bytes, such as
 * `() => fetch(url).then((response) => response.arrayBuffer())`, shows them once they have all come. Bytes the app
 * holds are copied before they move to the engine, so the app's copy, such as a query cache's, stays readable; a
 * function's bytes or body move without a copy, so it returns fresh ones each call: bytes that already moved, or a
 * response whose body was already read, fail the load, saying so. After the engine restarts, the hook loads the source
 * again.
 */
type DatasetSource =
  | ArrayBuffer
  | ((context: SourceContext) => ArrayBuffer | Response | PromiseLike<ArrayBuffer | Response>);

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

/** The data a component gives a dataset: where it comes from, and what it loads with. */
type DatasetData = Pick<
  LoadRequest,
  "primaryKey" | "receivedAtMicros" | "source" | "sourceAsOfMicros"
>;

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

/** A copy of bytes the app holds, once they are known to be within the byte limit, so a buffer too large is refused
 * before it is copied. */
function copyOf(name: string, bytes: ArrayBuffer): ArrayBuffer {
  checkBytes(name, bytes, loadLimits().maxArrowBytes);
  return structuredClone(bytes);
}

/** How a load runs: who hears where it stands, and what says nobody waits for it any more. */
interface Running {
  readonly progress: (state: LoadProgress) => void;
  readonly signal: AbortSignal;
}

/** Loads a request's source, telling `progress` where it stands, and settling to the load's state. */
async function load(
  client: ParallaxClient,
  request: LoadRequest,
  { progress, signal }: Running,
): Promise<LoadState> {
  const { name, source } = request;
  try {
    // A copy of the app's bytes, or what its function returns.
    const bytes = typeof source === "function" ? source({ signal }) : copyOf(name, source);
    const { rows } = await client.load(name, bytes, {
      ...optionsOf(request),
      onProgress: progress,
      signal,
    });
    return { error: null, progress: null, rows, status: "loaded" };
  } catch (error: unknown) {
    return { error: describe(error), progress: null, rows: null, status: "failed" };
  }
}

/** Starts a request's load, or joins the same load another component started, applying its outcome while the effect
 * that started it holds. */
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
  const { outcome, leave } = sharedLoad(client, request, {
    progress,
    run: async (heard, signal) => load(client, request, { progress: heard, signal }),
  });
  applyWhenCurrent(outcome, () => live, apply).catch(reportError);
  return () => {
    live = false;
    leave();
  };
}

export { idle, loading, start };
export type {
  DatasetData,
  DatasetSource,
  DatasetStatus,
  LoadRequest,
  LoadState,
  Settled,
  SourceContext,
};
