/**
 * The engine in the browser: a Web Worker running the WebAssembly build, holding
 * the tables the app loads and copies of server tables.
 *
 * One worker serves the page. The app hands it Arrow bytes with `load`, which move
 * to the worker rather than being copied, and the worker's connection answers
 * views of those tables with no server at all. A dataset the server marks for the
 * browser is copied in the first time a view needs it.
 *
 * The browser's limits are checked before a load costs any memory, and say so
 * plainly. A load or export that runs the engine out of memory traps it, which
 * nothing can recover from in place; the worker is then ended, which frees all
 * its memory, every waiting request and open view fails with the reason, and a
 * new, empty worker takes its place.
 */

import * as z from "zod/mini";

import { Connection } from "./connection";

/** What the page needs from a worker; a `Worker` provides it. */
export interface WorkerPort {
  /** `options.transfer` lists buffers that move to the worker with the message rather than being copied. */
  readonly postMessage: (message: unknown, options?: StructuredSerializeOptions) => void;
  /** Called for `message`, `messageerror` and `error`. */
  readonly addEventListener: (type: string, listener: (event: Event) => void) => void;
  readonly terminate: () => void;
}

/** How long a copy may take to arrive and load before the view runs on the server instead. */
export const COPY_TIMEOUT_MS = 120_000;

/**
 * The most bytes of Arrow one table the app loads may have: spike 0.3's limit for a table held in the browser,
 * checked before the bytes leave the page. With {@link MAX_ROWS} it is the documented limit; a narrow table may hold
 * more rows within it, and a wide one fewer.
 */
export const MAX_ARROW_BYTES = 70_000_000;

/**
 * The most rows one table the app loads may have: spike 0.3's limit, at which the reference pivot meets its 500 ms
 * budget on a slow desktop. The engine counts them from the stream's batch headers before decoding any data.
 */
export const MAX_ROWS = 150_000;

/**
 * The most cells an Excel export in the browser writes, the header and group column included. The browser holds a
 * sheet in memory at about 190 bytes a cell, which WebAssembly never returns, so a larger view is refused with a
 * reason that says to export CSV, which streams.
 */
export const MAX_XLSX_CELLS = 1_000_000;

/** An export's file format. */
export type ExportFormat = "xlsx" | "csv";

/** The media type of each export format. */
export const EXPORT_TYPES: Readonly<Record<ExportFormat, string>> = { xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv;charset=utf-8" };

/** Messages the worker sends; see `worker/worker.ts`. */
const outboundSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("reply"), bytes: z.instanceof(Uint8Array) }),
  z.strictObject({ kind: z.literal("copied"), id: z.int(), rows: z.int().check(z.nonnegative()) }),
  z.strictObject({ kind: z.literal("loaded"), id: z.int(), rows: z.int().check(z.nonnegative()) }),
  z.strictObject({ kind: z.literal("chunk"), id: z.int(), bytes: z.instanceof(Uint8Array) }),
  z.strictObject({ kind: z.literal("exported"), id: z.int(), bytes: z.nullable(z.instanceof(Uint8Array)) }),
  z.strictObject({ kind: z.literal("failed"), id: z.int(), message: z.string() }),
  z.strictObject({ kind: z.literal("trapped"), message: z.string() }),
  z.strictObject({ kind: z.literal("fatal"), message: z.string() })
]);

type Outbound = z.output<typeof outboundSchema>;

/** An answer to one request. */
type Answer = Extract<Outbound, { kind: "copied" | "loaded" | "exported" }>;

/** How a load of the app's Arrow bytes is keyed and stamped. */
export interface LoadOptions {
  /** The primary key column of a new table, so that reloads apply as diffs; none by default. A reload keeps the table's. */
  readonly primaryKey?: string | null;
  /** When the app received the bytes, in microseconds since the Unix epoch, which the status shows as the load's time; now by default. */
  readonly receivedAtMicros?: number;
  /**
   * When the data's source was read, in microseconds since the Unix epoch. By default the stream says, in its schema
   * metadata's `parallax.load`, as the app's API sets it; without either, the time the app received the bytes.
   */
  readonly sourceAsOfMicros?: number;
}

/** What a load of Arrow bytes reports. */
export interface Loaded {
  readonly dataset: string;
  /** The rows the table holds. */
  readonly rows: number;
}

interface Pending {
  readonly resolve: (answer: Answer) => void;
  readonly reject: (error: Error) => void;
  /** A CSV export's chunks so far, joined without copying. */
  parts: Blob | null;
}

/** The key a copy is held under: the dataset and its parameters, in a fixed order. */
function copyKey(dataset: string, parameters: Readonly<Record<string, string>>): string {
  return JSON.stringify([dataset, Object.entries(parameters).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))]);
}

/** The reason every view and request is given after the engine traps. */
export function trapReason(trap: string): string {
  return `The engine in this page stopped after a fatal error (${trap}), most likely because it ran out of memory. It has started again without its tables: load the data again.`;
}

/** One worker and the connection to its engine. */
interface Running {
  readonly worker: WorkerPort;
  readonly connection: Connection;
}

/** The worker-hosted engine and its connection. */
export class BrowserEngine {
  private running: Running;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly copies = new Map<string, Promise<void>>();
  /** Datasets the app has loaded into the running worker. */
  private readonly held = new Set<string>();
  /** The latest load of each dataset still waiting for its answer. */
  private readonly loading = new Map<string, Promise<Loaded>>();
  private readonly restartListeners: ((reason: string) => void)[] = [];
  private failure: string | null = null;

  /** `start` makes a worker: once now, and again whenever the engine traps. */
  constructor(private readonly start: () => WorkerPort) {
    this.running = this.spawn();
  }

  /** Starts the worker script at `url`, which must sit beside the package's WebAssembly files. */
  public static start(url: string): BrowserEngine {
    return new BrowserEngine(() => new Worker(new URL(url, location.href), { type: "module", name: "parallax" }));
  }

  /** The connection to the running worker's engine. A trap replaces it, after failing every view open on it. */
  public get connection(): Connection {
    return this.running.connection;
  }

  /** Calls `listener` with the reason whenever the engine traps and starts again empty, so that the app can load its data again. */
  public onRestart(listener: (reason: string) => void): void {
    this.restartListeners.push(listener);
  }

  private spawn(): Running {
    const worker = this.start();
    const connection = new Connection(
      {
        send: (bytes) => {
          worker.postMessage({ kind: "message", bytes });
        },
        close: () => {
          worker.terminate();
        }
      },
      "browser"
    );
    // A worker that has been replaced is never heard from again.
    const current = (): boolean => this.running.worker === worker;
    worker.addEventListener("message", (event) => {
      if (current()) {
        this.receive(event instanceof MessageEvent ? event.data : null);
      }
    });
    worker.addEventListener("messageerror", () => {
      if (current()) {
        this.fail("the parallax worker sent a message the page could not read");
      }
    });
    // A script that is missing, blocked or broken never posts anything.
    worker.addEventListener("error", (event) => {
      if (current()) {
        const detail = event instanceof ErrorEvent && event.message !== "" ? `: ${event.message}` : "";
        this.fail(`the parallax worker did not start; check that its worker URL serves worker.js from the package's wasm folder${detail}`);
      }
    });
    return { worker, connection };
  }

  /**
   * Loads the copy of `dataset` for `parameters` from `url`, once: later calls for
   * the same table share the first load. A load that fails, or takes longer than
   * `timeoutMs`, is forgotten, so a later call tries again.
   */
  public copy(dataset: string, parameters: Readonly<Record<string, string>>, url: string, timeoutMs: number = COPY_TIMEOUT_MS): Promise<void> {
    const key = copyKey(dataset, parameters);
    const known = this.copies.get(key);
    if (known !== undefined) {
      return known;
    }
    let sent = 0;
    const loaded = this.request((id) => {
      sent = id;
      this.running.worker.postMessage({ kind: "copy", id, dataset, parameters: { ...parameters }, url });
    }).then(() => undefined);
    if (this.failure !== null) {
      return loaded;
    }
    this.copies.set(key, loaded);
    const timer = setTimeout(() => {
      this.running.worker.postMessage({ kind: "cancel", id: sent });
      this.settle(sent, new Error(`the copy took longer than ${String(timeoutMs / 1000)} s`));
    }, timeoutMs);
    loaded.then(
      () => {
        clearTimeout(timer);
      },
      () => {
        clearTimeout(timer);
        if (this.copies.get(key) === loaded) {
          this.copies.delete(key);
        }
      }
    );
    return loaded;
  }

  /**
   * Loads Arrow IPC stream bytes that the app holds, such as its API's response, as `dataset`. The buffer moves to
   * the worker, so the page can no longer read it, and it is never copied between threads. A second load of the same
   * dataset reloads it, and its open views show the new rows.
   *
   * Bytes past {@link MAX_ARROW_BYTES} are refused before they leave the page, and the buffer stays the app's; a
   * stream of more than {@link MAX_ROWS} rows is refused by the engine before it decodes any data. The stream's schema
   * metadata may carry the load's status, as `parallax.load`: when the source was read, and NaNs the API turned
   * blank. A refused reload leaves the dataset's previous rows in place.
   */
  public load(dataset: string, bytes: ArrayBuffer, options: LoadOptions = {}): Promise<Loaded> {
    if (bytes.byteLength > MAX_ARROW_BYTES) {
      return Promise.reject(
        new Error(`${dataset} is ${String(bytes.byteLength)} bytes of Arrow, more than the ${String(MAX_ARROW_BYTES)} a table in the browser holds; have its API filter or aggregate the data to fit`)
      );
    }
    const nowMicros = options.receivedAtMicros ?? Date.now() * 1000;
    const loading = this.request((id) => {
      this.running.worker.postMessage(
        { kind: "load", id, dataset, bytes, primaryKey: options.primaryKey ?? null, nowMicros, sourceAsOfMicros: options.sourceAsOfMicros ?? null, maxRows: MAX_ROWS },
        { transfer: [bytes] }
      );
    }).then((answer): Loaded => {
      if (answer.kind !== "loaded") {
        throw new Error("the parallax worker answered a load with something else");
      }
      this.held.add(dataset);
      return { dataset, rows: answer.rows };
    });
    if (this.failure !== null) {
      return loading;
    }
    this.loading.set(dataset, loading);
    const settled = (): void => {
      if (this.loading.get(dataset) === loading) {
        this.loading.delete(dataset);
      }
    };
    loading.then(settled, settled);
    return loading;
  }

  /**
   * Whether views of `dataset` run here, on a table the app loaded: true once a load of it has succeeded. A load
   * still in flight is waited for, and if it fails with nothing loaded before it, its reason is thrown, so that the
   * view says why.
   */
  public async holds(dataset: string): Promise<boolean> {
    const loading = this.loading.get(dataset);
    if (loading !== undefined) {
      try {
        await loading;
      } catch (failure: unknown) {
        if (!this.held.has(dataset)) {
          throw failure;
        }
      }
    }
    return this.held.has(dataset);
  }

  /**
   * Writes the view a layout describes as xlsx or CSV, in the worker, which already holds its table, and returns the
   * file. `loadVersion` is the load the screen shows; an export of any other load is refused, so the file holds what
   * the screen does. An xlsx of more than {@link MAX_XLSX_CELLS} cells is refused with a reason that says to export
   * CSV. A CSV arrives in chunks as it is written, joined into the file without being held whole anywhere else.
   */
  public export(layoutJson: string, format: ExportFormat, loadVersion: bigint | number | null = null): Promise<Blob> {
    return this.request((id) => {
      this.running.worker.postMessage({ kind: "export", id, format, layout: layoutJson, loadVersion: loadVersion === null ? null : Number(loadVersion), maxCells: MAX_XLSX_CELLS });
    }).then((answer) => {
      if (answer.kind !== "exported") {
        throw new Error("the parallax worker answered an export with something else");
      }
      const type = EXPORT_TYPES[format];
      if (answer.bytes !== null) {
        return new Blob([answer.bytes], { type });
      }
      return new Blob(answer.parts === null ? [] : [answer.parts], { type });
    });
  }

  /** Sends a request with a fresh id and waits for its answer, which comes with any CSV chunks collected for it. */
  private request(send: (id: number) => void): Promise<Answer & { readonly parts: Blob | null }> {
    if (this.failure !== null) {
      return Promise.reject(new Error(this.failure));
    }
    const id = this.nextId;
    this.nextId += 1;
    const answered = new Promise<Answer & { readonly parts: Blob | null }>((resolve, reject) => {
      const entry: Pending = {
        resolve: (answer) => {
          resolve({ ...answer, parts: entry.parts });
        },
        reject,
        parts: null
      };
      this.pending.set(id, entry);
    });
    send(id);
    return answered;
  }

  private settle(id: number, outcome: Answer | Error): void {
    const pending = this.pending.get(id);
    this.pending.delete(id);
    if (outcome instanceof Error) {
      pending?.reject(outcome);
    } else {
      pending?.resolve(outcome);
    }
  }

  private receive(data: unknown): void {
    const parsed = outboundSchema.safeParse(data);
    if (!parsed.success) {
      this.fail("the parallax worker sent a message the page does not know");
      return;
    }
    const message = parsed.data;
    switch (message.kind) {
      case "reply":
        this.connection.receive(message.bytes);
        return;
      case "copied":
      case "loaded":
      case "exported":
        this.settle(message.id, message);
        return;
      case "chunk": {
        const pending = this.pending.get(message.id);
        if (pending !== undefined) {
          // A Blob made of a Blob refers to its parts rather than copying them, so the chunk can be freed.
          pending.parts = new Blob(pending.parts === null ? [message.bytes] : [pending.parts, message.bytes]);
        }
        return;
      }
      case "failed":
        this.settle(message.id, new Error(message.message));
        return;
      case "trapped":
        this.restart(trapReason(message.message));
        return;
      case "fatal":
        this.fail(message.message);
        return;
    }
  }

  /** Fails everything waiting on the running worker and its views with `reason`, forgets its tables, and ends it. */
  private stop(reason: string, worker: Running): void {
    for (const id of [...this.pending.keys()]) {
      this.settle(id, new Error(reason));
    }
    this.copies.clear();
    this.held.clear();
    this.loading.clear();
    worker.connection.disconnect(reason);
    worker.worker.terminate();
  }

  /**
   * Replaces a worker whose engine trapped with a new, empty one. Every pending request and open view fails with
   * `reason`, and ending the old worker frees all its memory.
   */
  private restart(reason: string): void {
    const trapped = this.running;
    // The new worker first, so that whatever reacts to the failures below reaches it.
    this.running = this.spawn();
    this.stop(reason, trapped);
    for (const listener of this.restartListeners) {
      listener(reason);
    }
  }

  /**
   * Stops using the worker for good: every pending and later request fails, every view reports `reason`, and the
   * worker ends, releasing the tables it held. A worker that cannot start would only fail again, so it is not
   * replaced.
   */
  private fail(reason: string): void {
    if (this.failure !== null) {
      return;
    }
    this.failure = reason;
    this.stop(reason, this.running);
  }
}
