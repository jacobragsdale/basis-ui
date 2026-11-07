/* `useDataset()`: a table the app loads into the page's engine, and its load's state. */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import type { ParallaxClient, Restart } from "#engine/client.ts";
import type { LoadOptions } from "#engine/limits.ts";

import { useParallaxClient } from "./context.ts";
import { applyWhenCurrent } from "./current.ts";

/**
 * Where a dataset's Arrow IPC stream comes from: bytes the app holds, or a function that fetches them, such as
 * `() => fetch(url).then((response) => response.arrayBuffer())`. Bytes are copied before they move to the engine, so
 * the app's copy, such as a query cache's, stays readable; a function's bytes move without a copy, so it returns fresh
 * ones each call. After the engine restarts, the hook loads the source again.
 */
type DatasetSource = ArrayBuffer | (() => ArrayBuffer | PromiseLike<ArrayBuffer>);

/** Where a dataset's load stands. `idle` has no source yet. */
type DatasetStatus = "idle" | "loading" | "loaded" | "failed";

/** A load's state. */
interface LoadState {
  readonly status: DatasetStatus;
  /** The rows the table holds, once loaded. */
  readonly rows: number | null;
  /** Why the load failed, as the engine or the source said. */
  readonly error: string | null;
}

/** A dataset as `useDataset` returns it, for `useView`. */
interface Dataset extends LoadState {
  readonly name: string;
  /** Counts the engine's restarts the hook has heard of; the dataset's views reopen on the new engine when it changes. */
  readonly engine: number;
  /** Loads the data again from the source: a function source fetches anew. */
  readonly reload: () => void;
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

/** What the hook tracks across renders: the engine's restarts it has heard of, why the dataset stopped, if it did, and
 * its latest load's outcome. */
interface Tracked {
  readonly engine: number;
  readonly stopped: Stopped | null;
  readonly settled: Settled | null;
}

/** Why a request stopped loading: until the app asks for something else, or to load again, it waits. */
interface Stopped {
  readonly reason: string;
  readonly request: LoadRequest;
}

const idle: LoadState = { error: null, rows: null, status: "idle" };
const loading: LoadState = { error: null, rows: null, status: "loading" };

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Whether two requests ask for the same data, on whichever engine. */
function sameData(first: LoadRequest, second: LoadRequest): boolean {
  return (
    first.name === second.name &&
    first.source === second.source &&
    first.reloads === second.reloads &&
    first.primaryKey === second.primaryKey &&
    first.receivedAtMicros === second.receivedAtMicros &&
    first.sourceAsOfMicros === second.sourceAsOfMicros
  );
}

function sameRequest(first: LoadRequest, second: LoadRequest): boolean {
  return first.engine === second.engine && sameData(first, second);
}

/** Why the request stopped, if it is the one that did. */
function stoppedFor(stopped: Stopped | null, request: LoadRequest): string | null {
  return stopped !== null && sameData(stopped.request, request) ? stopped.reason : null;
}

/** The options a request loads with. */
function optionsOf({ primaryKey, receivedAtMicros, sourceAsOfMicros }: LoadRequest): LoadOptions {
  return {
    primaryKey,
    ...(receivedAtMicros === undefined ? {} : { receivedAtMicros }),
    ...(sourceAsOfMicros === undefined ? {} : { sourceAsOfMicros }),
  };
}

/** Loads a request's source, settling to the load's state. */
async function load(client: ParallaxClient, request: LoadRequest): Promise<LoadState> {
  const { name, source } = request;
  try {
    // A copy of the app's bytes, or what its function returns.
    const bytes = typeof source === "function" ? source() : structuredClone(source);
    const { rows } = await client.load(name, bytes, optionsOf(request));
    return { error: null, rows, status: "loaded" };
  } catch (error: unknown) {
    return { error: describe(error), rows: null, status: "failed" };
  }
}

/** The dataset's state now: what its latest load came to, if that load was for the request now. */
function stateOf(request: LoadRequest, settled: Settled | null, stopped: string | null): LoadState {
  if (stopped !== null) {
    return { error: stopped, rows: null, status: "failed" };
  }
  return settled !== null && sameRequest(settled.request, request) ? settled.state : loading;
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
  applyWhenCurrent(load(client, request), () => live, apply).catch(reportError);
  return () => {
    live = false;
  };
}

/**
 * What a restart leaves of a dataset. A dataset that was loaded on the engine that stopped loads again on the new one,
 * when the client says to recover. One whose load was under way, most likely the load that ran the engine out of
 * memory, fails with the reason, and loads again only when the app calls `reload` or gives it other data, so it cannot
 * stop the engine again and again.
 */
function restarted(
  was: Tracked,
  request: LoadRequest | null,
  { reason, recover }: Restart,
): Tracked {
  const engine = was.engine + 1;
  const held =
    request !== null &&
    was.settled !== null &&
    was.settled.state.status === "loaded" &&
    sameRequest(was.settled.request, request);
  if (request === null || (recover && held)) {
    return { engine, settled: was.settled, stopped: null };
  }
  return { engine, settled: was.settled, stopped: { reason, request } };
}

/** Tracks the dataset's loads and the engine's restarts, given the request the dataset wants now. */
function useTracked(
  client: ParallaxClient,
  requestRef: RefObject<LoadRequest | null>,
): readonly [Tracked, (settled: Settled) => void] {
  const [tracked, setTracked] = useState<Tracked>({ engine: 0, settled: null, stopped: null });
  useEffect(
    () =>
      client.onRestart((restart) => {
        setTracked((was) => restarted(was, requestRef.current, restart));
      }),
    [client, requestRef],
  );
  // Stable, since the load's effect depends on it.
  const settle = useCallback((settled: Settled): void => {
    setTracked((was) => ({ ...was, settled }));
  }, []);
  return [tracked, settle];
}

/** A load's options as a request holds them. */
function wantedOptions({
  primaryKey = null,
  receivedAtMicros,
  sourceAsOfMicros,
}: LoadOptions): Pick<LoadRequest, "primaryKey" | "receivedAtMicros" | "sourceAsOfMicros"> {
  return { primaryKey, receivedAtMicros, sourceAsOfMicros };
}

/** What the hook loads: a request's fields, with a source that may not be there yet, and why the engine stopped for
 * good, if it did. */
type Wanted = Omit<LoadRequest, "source"> & {
  readonly source: DatasetSource | null;
  readonly stopped: string | null;
};

/** Loads what is wanted whenever any of it changes, handing each outcome to `settle`. */
function useLoad(client: ParallaxClient, wanted: Wanted, settle: (settled: Settled) => void): void {
  const { engine, name, primaryKey, receivedAtMicros, reloads, source, sourceAsOfMicros, stopped } =
    wanted;
  useEffect(() => {
    if (source === null || stopped !== null) {
      return (): void => undefined;
    }
    const request = {
      engine,
      name,
      primaryKey,
      receivedAtMicros,
      reloads,
      source,
      sourceAsOfMicros,
    };
    return start(client, request, settle);
  }, [
    client,
    engine,
    name,
    primaryKey,
    receivedAtMicros,
    reloads,
    settle,
    source,
    sourceAsOfMicros,
    stopped,
  ]);
}

/**
 * Loads a table into the page's engine as `name`, from `source`, and reports the load's state. It loads again when
 * `name`, `source` or the options change, so give it a stable source: bytes held in state or a query, or a function
 * the React Compiler keeps. A null source waits, as `idle`.
 *
 * Views of the dataset, opened with `useView`, may open while it loads: they wait for it. When the engine runs out of
 * memory it starts again empty and fails every view; a dataset that was loaded then loads its source again, and its
 * views reopen. A dataset whose load was under way, most likely the one that ran the engine out of memory, fails with
 * the reason until `reload` is called or the source changes, as does every dataset once the engine keeps stopping.
 */
function useDataset(
  name: string,
  source: DatasetSource | null,
  options: LoadOptions = {},
): Dataset {
  const client = useParallaxClient();
  const [reloads, setReloads] = useState(0);
  const wanted = { name, reloads, ...wantedOptions(options) };
  // The request the dataset wants, for a restart to judge after this render.
  const requestRef = useRef<LoadRequest | null>(null);
  const [{ engine, settled, stopped }, settle] = useTracked(client, requestRef);
  const request = source === null ? null : { ...wanted, engine, source };
  useEffect(() => {
    requestRef.current = request;
  });
  const reason = request === null ? null : stoppedFor(stopped, request);
  useLoad(client, { ...wanted, engine, source, stopped: reason }, settle);
  return {
    ...(request === null ? idle : stateOf(request, settled, reason)),
    engine,
    name,
    reload: () => {
      setReloads((count) => count + 1);
    },
  };
}

export { useDataset };
export type { Dataset, DatasetSource, DatasetStatus };
