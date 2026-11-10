/* The engine in the browser: a Web Worker running the WebAssembly build, holding the tables the app loads.
 *
 * One worker serves the page. The app hands it Arrow bytes with `load`, which move to the worker rather than being
 * copied, and the worker's connection answers views of those tables.
 *
 * The browser's limits are checked before a load costs any memory, and say so plainly. A load or export that runs the
 * engine out of memory traps it, which nothing can recover from in place; the worker is then ended, which frees all
 * its memory, every waiting request and open view fails with the reason, and a new, empty worker takes its place. */

import { Answers } from "./answers.ts";
import type { Answered } from "./answers.ts";
import { Connection } from "./connection.ts";
import { exportTypes, loadLimits, maxXlsxCells, tooManyBytes, trapReason } from "./limits.ts";
import type { LoadOptions, Loaded } from "./limits.ts";
import type { ExportFormat, ToWorker } from "./messages.ts";
import { arriving, listen } from "./port.ts";
import type { WorkerPort } from "./port.ts";
import { parseFromWorker } from "./replies.ts";

const microsPerMilli = 1000;

/** One worker and the connection to its engine. */
interface Running {
  readonly worker: WorkerPort;
  readonly connection: Connection;
}

/** The worker-hosted engine and its connection. */
class BrowserEngine {
  readonly #start: () => WorkerPort;
  readonly #answers = new Answers();
  /** Datasets the app has loaded into the running worker. */
  readonly #held = new Set<string>();
  /** The latest load of each dataset still waiting for its answer. */
  readonly #loading = new Map<string, Promise<Loaded>>();
  readonly #restartListeners = new Set<(reason: string) => void>();
  #running: Running;
  #failure: string | null = null;

  /** `start` makes a worker: once now, and again whenever the engine traps. */
  public constructor(start: () => WorkerPort) {
    this.#start = start;
    this.#running = this.#spawn();
  }

  /** The connection to the running worker's engine. A trap replaces it, after failing every view open on it. */
  public get connection(): Connection {
    return this.#running.connection;
  }

  /** Calls `listener` with the reason whenever the engine traps and starts again empty, so that the app can load its
   * data again. Returns a function that stops calling it. */
  public onRestart(listener: (reason: string) => void): () => void {
    this.#restartListeners.add(listener);
    return () => {
      this.#restartListeners.delete(listener);
    };
  }

  /**
   * Loads Arrow IPC stream bytes that the app holds, such as its API's response, as `dataset`. The buffer moves to the
   * worker, so the page can no longer read it, and it is never copied between threads. A second load of the same
   * dataset reloads it, and its open views show the new rows.
   *
   * `bytes` may also be a promise of them, such as a fetch's `arrayBuffer()`: the load counts as in flight from this
   * call, so a view that opens before the bytes arrive waits for them, and a fetch that fails fails its views with the
   * reason.
   *
   * Bytes past `maxArrowBytes` are refused before they leave the page, and the buffer stays the app's; a stream
   * of more than `maxRows` rows is refused by the engine before it decodes any data. The stream's schema metadata
   * may carry the load's status, as `parallax.load`: when the source was read, and NaNs the API turned blank. A refused
   * reload leaves the dataset's previous rows in place.
   */
  public async load(
    dataset: string,
    bytes: ArrayBuffer | PromiseLike<ArrayBuffer>,
    options: LoadOptions = {},
  ): Promise<Loaded> {
    const loading = arriving(bytes)
      ? this.#sendWhenArrived(dataset, bytes, options)
      : this.#send(dataset, bytes, options);
    if (this.#failure !== null) {
      return loading;
    }
    this.#loading.set(dataset, loading);
    try {
      return await loading;
    } finally {
      if (this.#loading.get(dataset) === loading) {
        this.#loading.delete(dataset);
      }
    }
  }

  /**
   * Whether views of `dataset` run here, on a table the app loaded: true once a load of it has succeeded. A load still
   * in flight is waited for, and if it fails with nothing loaded before it, its reason is thrown, so the view says why.
   */
  public async holds(dataset: string): Promise<boolean> {
    const loading = this.#loading.get(dataset);
    if (loading !== undefined) {
      try {
        await loading;
      } catch (error: unknown) {
        if (!this.#held.has(dataset)) {
          throw error;
        }
      }
    }
    return this.#held.has(dataset);
  }

  /** The connection for views of `dataset`, once the app's load of it has succeeded. A load still in flight is waited
   * for, and one that fails, or no load at all, fails the view with the reason. */
  public async connectionFor(dataset: string): Promise<Connection> {
    if (!(await this.holds(dataset))) {
      throw new Error(
        `${dataset} is not loaded in this page; load it with useDataset before opening a view of it.`,
      );
    }
    return this.connection;
  }

  /**
   * Writes the view a layout describes as xlsx or CSV, in the worker, which already holds its table, and returns the
   * file. `loadVersion` is the load the screen shows; an export of any other load is refused, so the file holds what
   * the screen does. An xlsx of more than {@link maxXlsxCells} cells is refused with a reason that says to export CSV.
   * A CSV arrives in chunks as it is written, joined into the file without being held whole anywhere else.
   */
  public async export(
    layoutJson: string,
    format: ExportFormat,
    loadVersion: bigint | number | null = null,
  ): Promise<Blob> {
    const answer = await this.#request((id) => ({
      format,
      id,
      kind: "export",
      layout: layoutJson,
      loadVersion: loadVersion === null ? null : Number(loadVersion),
      maxCells: maxXlsxCells,
    }));
    if (answer.kind !== "exported") {
      throw new Error("The parallax worker answered an export with something else.");
    }
    const type = exportTypes[format];
    if (answer.bytes !== null) {
      return new Blob([answer.bytes], { type });
    }
    return new Blob(answer.parts === null ? [] : [answer.parts], { type });
  }

  /** Stops using the worker for good, as when the page no longer shows parallax: every pending and later request
   * fails, every view reports `reason`, and the worker ends, releasing the tables it held. */
  public close(reason = "Parallax was closed in this page."): void {
    this.#fail(reason);
  }

  #spawn(): Running {
    const worker = this.#start();
    const connection = new Connection({
      close: (): void => {
        worker.terminate();
      },
      send: (bytes): void => {
        worker.postMessage({ bytes, kind: "message" }, { transfer: [] });
      },
    });
    listen(worker, () => this.#running.worker === worker, {
      fail: (reason) => {
        this.#fail(reason);
      },
      message: (data) => {
        this.#receive(data);
      },
    });
    return { connection, worker };
  }

  async #sendWhenArrived(
    dataset: string,
    bytes: PromiseLike<ArrayBuffer>,
    options: LoadOptions,
  ): Promise<Loaded> {
    return this.#send(dataset, await bytes, options);
  }

  /** Checks the bytes against the byte limit and moves them to the worker to load as `dataset`. */
  async #send(dataset: string, bytes: ArrayBuffer, options: LoadOptions): Promise<Loaded> {
    const { maxArrowBytes: mostBytes, maxRows } = loadLimits();
    if (bytes.byteLength > mostBytes) {
      throw tooManyBytes(dataset, bytes.byteLength, mostBytes);
    }
    const answer = await this.#request(
      (id) => ({
        bytes,
        dataset,
        id,
        kind: "load",
        maxRows,
        nowMicros: options.receivedAtMicros ?? Date.now() * microsPerMilli,
        primaryKey: options.primaryKey ?? null,
        sourceAsOfMicros: options.sourceAsOfMicros ?? null,
      }),
      [bytes],
    );
    if (answer.kind !== "loaded") {
      throw new Error("The parallax worker answered a load with something else.");
    }
    this.#held.add(dataset);
    return { dataset, rows: answer.rows };
  }

  /** Sends a request and waits for its answer, which comes with any CSV chunks collected for it. */
  async #request(
    message: (id: number) => ToWorker,
    transfer: Transferable[] = [],
  ): Promise<Answered> {
    if (this.#failure !== null) {
      throw new Error(this.#failure);
    }
    return this.#answers.ask((id) => {
      this.#running.worker.postMessage(message(id), { transfer });
    });
  }

  #receive(data: unknown): void {
    const message = parseFromWorker(data);
    if (message === null) {
      this.#fail("The parallax worker sent a message the page does not know.");
    } else if (message.kind === "reply") {
      this.connection.receive(message.bytes);
    } else if (message.kind === "loaded" || message.kind === "exported") {
      this.#answers.settle(message.id, message);
    } else if (message.kind === "chunk") {
      this.#answers.chunk(message.id, message.bytes);
    } else if (message.kind === "failed") {
      this.#answers.settle(message.id, new Error(message.message));
    } else if (message.kind === "trapped") {
      this.#restart(trapReason(message.message));
    } else {
      this.#fail(message.message);
    }
  }

  /** Fails everything waiting on a worker and its views with `reason`, forgets its tables, and ends it. */
  #stop(reason: string, running: Running): void {
    this.#answers.failAll(reason);
    this.#held.clear();
    this.#loading.clear();
    running.connection.disconnect(reason);
    running.worker.terminate();
  }

  /** Replaces a worker whose engine trapped with a new, empty one. Every pending request and open view fails with
   * `reason`, and ending the old worker frees all its memory. */
  #restart(reason: string): void {
    const trapped = this.#running;
    // The new worker first, so that whatever reacts to the failures below reaches it.
    this.#running = this.#spawn();
    this.#stop(reason, trapped);
    for (const listener of this.#restartListeners) {
      listener(reason);
    }
  }

  /** Stops using the worker for good. A worker that cannot start would only fail again, so it is not replaced. */
  #fail(reason: string): void {
    if (this.#failure !== null) {
      return;
    }
    this.#failure = reason;
    this.#stop(reason, this.#running);
  }
}

export { BrowserEngine };
