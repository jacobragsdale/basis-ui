/* The page's engine, started on first use, independent of any framework; `ParallaxProvider` holds one for a React
 * tree.
 *
 * When the engine traps, every view fails and a new, empty engine starts; the client then tells its listeners whether
 * to recover, by loading their data again and reopening their views. An engine that traps again and again soon after
 * each recovery would load, trap and restart for ever, and hold a desktop's CPU while it did, so past a few restarts
 * each within five minutes of the one before, however long the data takes to load again, the client says not to,
 * and the views stay failed with the reason. A planned restart, which gives back the memory of datasets the page
 * unloaded, is always recovered from and never counted. */

import { BrowserEngine } from "./browser-engine.ts";
import type { EngineOptions, Unloaded } from "./memory.ts";
import type { Connection } from "./connection.ts";
import type { LoadRun } from "./holdings.ts";
import type { Loaded } from "./limits.ts";
import type { ExportFormat } from "./messages.ts";
import type { WorkerPort } from "./port.ts";

/** Where the engine's worker comes from: the URL that serves `@basis/parallax/worker`, or a function that starts
 * it, such as Vite's `?worker` import's constructor: `() => new ParallaxWorker()`. */
type WorkerSource = string | URL | (() => WorkerPort);

/** A restart, as the client's listeners hear of it. */
interface Restart {
  /** Why the engine stopped, which every view that was open has failed with. */
  readonly reason: string;
  /** Whether to load the data again and reopen the views; false once the engine keeps stopping. */
  readonly recover: boolean;
  /** Whether the restart was planned, to give back the memory of tables the page unloaded, rather than a trap: no load
   * of the engine before it ran it out of memory, so every dataset loads again. */
  readonly planned: boolean;
}

/** How the client counts restarts and gives memory back, which tests change. */
interface ClientOptions extends EngineOptions {
  /** The most restarts recovered from in a row, each within `recoveryWindowMs` of the one before; 2 by default. */
  readonly maxRecoveries?: number;
  /** Five minutes by default: a restart that long after the one before starts the count again. */
  readonly recoveryWindowMs?: number;
  /** The clock, in milliseconds; `performance.now()` by default. */
  readonly now?: () => number;
  /** Never starts a worker, as in a Node DOM, which has no Web Worker: every load and view waits, and a dataset's
   * source is never called. */
  readonly inert?: boolean;
}

/** A worker that is never started: it takes every message and answers none. */
const inertWorker: WorkerPort = {
  addEventListener: (): void => undefined,
  postMessage: (): void => undefined,
  terminate: (): void => undefined,
};

const defaultRecoveries = 2;
const defaultWindowMs = 300_000;

/** The reason a restart gives when the client will not recover from it. */
function givenUp(reason: string): string {
  return `${reason} It stopped again soon after its data was loaded again, so parallax leaves it stopped: reload the page, or narrow the data the page loads.`;
}

/** A function that starts the worker from its source. */
function starter(source: WorkerSource): () => WorkerPort {
  if (typeof source === "function") {
    return source;
  }
  return () =>
    new Worker(new URL(source, globalThis.location.href), { name: "parallax", type: "module" });
}

/** The page's engine and its worker, started on first use. */
class ParallaxClient {
  /** Whether the client never starts a worker, as in a Node DOM: its loads and views wait for ever. */
  public readonly inert: boolean;
  readonly #start: () => WorkerPort;
  readonly #listeners = new Set<(restart: Restart) => void>();
  readonly #maxRecoveries: number;
  readonly #recoveryWindowMs: number;
  readonly #now: () => number;
  readonly #engineOptions: EngineOptions;
  #engine: BrowserEngine | null = null;
  #restarts: readonly number[] = [];
  #generation = 0;

  public constructor(worker: WorkerSource, options: ClientOptions = {}) {
    this.inert = options.inert ?? false;
    this.#start = this.inert ? (): WorkerPort => inertWorker : starter(worker);
    this.#maxRecoveries = options.maxRecoveries ?? defaultRecoveries;
    this.#recoveryWindowMs = options.recoveryWindowMs ?? defaultWindowMs;
    this.#now = options.now ?? ((): number => performance.now());
    this.#engineOptions =
      options.restartAboveBytes === undefined
        ? {}
        : { restartAboveBytes: options.restartAboveBytes };
  }

  /** Counts the engines this client has started: it rises when the engine restarts, or starts again after `close`.
   * Views opened on an older engine are gone. */
  public get generation(): number {
    return this.#generation;
  }

  /** Whether an engine runs: false before the first use, and after `close` until the next. */
  public get running(): boolean {
    return this.#engine !== null;
  }

  /** Starts the engine's worker before any data or view needs it, so the first rows show sooner. */
  public prewarm(): void {
    this.#current();
  }

  /**
   * Loads Arrow IPC stream bytes the app fetched, such as its API's response, into the engine as `dataset`; views of
   * it then run there. The buffer moves to the engine's worker, so the app can no longer read it. `bytes` may be a
   * `Response`, whose body moves to the worker as it arrives, so that a first load's views show its first rows before
   * the rest has come, or a promise of either, such as a fetch still on its way: views that open meanwhile wait for the
   * first rows rather than fail. The options' `onProgress` hears where the load stands. See `BrowserEngine.load` for the limits and
   * the load's status.
   */
  public async load(
    dataset: string,
    bytes: ArrayBuffer | Response | PromiseLike<ArrayBuffer | Response>,
    options: LoadRun = {},
  ): Promise<Loaded> {
    return this.#current().load(dataset, bytes, options);
  }

  /** The connection for views of `dataset`, once its load has succeeded or its first rows show, or, `whole`, once it
   * has all loaded; see `BrowserEngine.connectionFor`. */
  public async connectionFor(dataset: string, whole = false): Promise<Connection> {
    // An inert client loads nothing, so its views wait, as for a load still on its way.
    return this.inert
      ? Promise.withResolvers<Connection>().promise
      : this.#current().connectionFor(dataset, whole);
  }

  /** Writes a view of a table the app loaded as xlsx or CSV in the engine; see `BrowserEngine.export`. */
  public async export(
    layoutJson: string,
    format: ExportFormat,
    loadVersion: bigint | null = null,
  ): Promise<Blob> {
    return this.#current().export(layoutJson, format, loadVersion);
  }

  /** Drops `dataset`, which the page no longer shows, freeing its memory for later loads; see
   * `BrowserEngine.unload`. Null when no engine runs, which holds nothing. */
  public async unload(dataset: string): Promise<Unloaded | null> {
    return this.#engine === null ? null : this.#engine.unload(dataset);
  }

  /** Calls `listener` whenever the engine stops and starts again empty, with whether to recover. Returns a function
   * that stops calling it. */
  public onRestart(listener: (restart: Restart) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * Drops every table and view, as when the signed-in user changes: the worker ends, freeing every table it held, its
   * views fail with `reason`, and the listeners hear of a planned restart, so they load their data again, for the
   * user now signed in, on a new engine. A load whose bytes arrive later loads nothing.
   */
  public renew(reason: string): void {
    this.#engine?.close(reason);
    this.#engine = null;
    this.#restarted(reason, true);
  }

  /** Ends the worker, freeing every table it held; views open on it fail. A later use starts a new one. */
  public close(): void {
    this.#engine?.close();
    this.#engine = null;
  }

  #current(): BrowserEngine {
    if (this.#engine !== null) {
      return this.#engine;
    }
    const engine = new BrowserEngine(this.#start, this.#engineOptions);
    this.#generation += 1;
    engine.onRestart((reason, planned) => {
      this.#restarted(reason, planned);
    });
    this.#engine = engine;
    return engine;
  }

  #restarted(reason: string, planned: boolean): void {
    this.#generation += 1;
    const now = this.#now();
    if (!planned) {
      // A run of restarts, each soon after the one before, as a load that traps the engine each time it loads again.
      const last = this.#restarts.at(-1);
      const inRun = last !== undefined && now - last < this.#recoveryWindowMs;
      this.#restarts = inRun ? [...this.#restarts, now] : [now];
    }
    const recover = planned || this.#restarts.length <= this.#maxRecoveries;
    const restart: Restart = { planned, reason: recover ? reason : givenUp(reason), recover };
    for (const listener of this.#listeners) {
      listener(restart);
    }
  }
}

export { ParallaxClient };
export type { ClientOptions, Restart, WorkerSource };
