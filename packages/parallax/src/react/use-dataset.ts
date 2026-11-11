/* `useDataset()`: a table the app loads into the page's engine, and its load's state. */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import type { ParallaxClient, Restart } from "#engine/client.ts";
import type { LoadOptions } from "#engine/limits.ts";

import { useParallaxClient } from "./context.ts";
import { idle, loading, start } from "./dataset-load.ts";
import { holdDataset } from "./dataset-share.ts";
import type { DatasetSource, LoadRequest, LoadState, Settled } from "./dataset-load.ts";

/** A dataset as `useDataset` returns it, for `useView`. */
interface Dataset extends LoadState {
  readonly name: string;
  /** Counts the engine's restarts the hook has heard of; the dataset's views reopen on the new engine when it changes. */
  readonly engine: number;
  /** Loads the data again from the source: a function source fetches anew. */
  readonly reload: () => void;
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

/** The dataset's state now: what its latest load came to, if that load was for the request now. */
function stateOf(request: LoadRequest, settled: Settled | null, stopped: string | null): LoadState {
  if (stopped !== null) {
    return { error: stopped, progress: null, rows: null, status: "failed" };
  }
  return settled !== null && sameRequest(settled.request, request) ? settled.state : loading;
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
  // The last component to show the dataset unloads it as it unmounts.
  useEffect(() => holdDataset(client, name), [client, name]);
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
 * Views of the dataset, opened with `useView`, may open while it loads: they wait for its first rows. A first load
 * shows as it arrives, from a source that streams: its views open on its first rows and see more each time the rows
 * read have grown fourfold, while `progress` says how many have been read of how many are expected, and a grid's status
 * bar how many are still to come. Sorts, filters and pivots apply to the rows so far and update as more arrive; a
 * chart waits for the whole load, and an export is refused until it is done. A reload is read whole and checked before
 * anything changes: its views keep the rows before it until it applies, and a refused reload leaves them so, while
 * `progress` says how far it has read. When the engine runs out of
 * memory it starts again empty and fails every view; a dataset that was loaded then loads its source again, and its
 * views reopen. A dataset whose load was under way, most likely the one that ran the engine out of memory, fails with
 * the reason until `reload` is called or the source changes, as does every dataset once the engine keeps stopping.
 *
 * Components that ask for the same name and the same source share one load, so a page whose cards and grid show one
 * dataset fetches it once. When the last component that shows a dataset unmounts, the engine drops it and its memory
 * goes to later loads; once the engine's memory, which never shrinks, has grown past what its tables need, it starts
 * again with what is still shown, which loads again as after a restart.
 *
 * @use Once for each table a page shows, inside a ParallaxProvider; give the dataset to a Grid, a Pivot or a Chart.
 * @see ParallaxProvider, Grid, Pivot, Chart, useView, LayoutInput
 * @example
 * ```tsx
 * import { Grid, useDataset } from "@basis/parallax";
 * import type { LayoutInput } from "@basis/parallax";
 * import { useState } from "react";
 * import type { ReactNode } from "react";
 *
 * // The generated client's call for an Arrow route, as in `(await listPositions()).data.arrayBuffer()`.
 * declare const positionsBytes: () => Promise<ArrayBuffer>;
 *
 * export function Positions(): ReactNode {
 *   const positions = useDataset("positions", positionsBytes, { primaryKey: "position_id" });
 *   const [layout, setLayout] = useState<LayoutInput>({ pinned: ["ticker"] });
 *   return <Grid dataset={positions} layout={layout} onLayoutChange={setLayout} />;
 * }
 * ```
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
export type { Dataset };
export type { DatasetSource, DatasetStatus } from "./dataset-load.ts";
