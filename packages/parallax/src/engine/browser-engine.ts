/* The engine in the browser: a Web Worker running the WebAssembly build, holding the tables the app loads.
 *
 * One worker serves the page. The app hands it Arrow bytes with `load`, which move to the worker rather than being
 * copied, or a response whose body moves there piece by piece as it arrives, and the worker's connection answers views
 * of those tables. A first load's views open on its first rows and see more as they come.
 *
 * The browser's limits are checked before a load costs any memory, and say so plainly. A load or export that runs the
 * engine out of memory traps it, which nothing can recover from in place; the worker is then ended, which frees all
 * its memory, every waiting request and open view fails with the reason, and a new, empty worker takes its place. */

import { Answers } from "./answers.ts";
import type { Answered } from "./answers.ts";
import { Connection } from "./connection.ts";
import { Holdings, loadRequest } from "./holdings.ts";
import type { Job, LoadBody } from "./holdings.ts";
import { exportTypes, loadLimits, maxXlsxCells, tooManyBytes, trapReason } from "./limits.ts";
import type { LoadCall, Loaded } from "./limits.ts";
import type { ExportFormat, LoadRequest, ToWorker } from "./messages.ts";
import { arriving, listen } from "./port.ts";
import type { WorkerPort } from "./port.ts";
import { parseFromWorker } from "./replies.ts";
import type { Reply } from "./replies.ts";
import { checkResponse, streamBody } from "./stream.ts";

/** One worker and the connection to its engine. */
interface Running {
  readonly worker: WorkerPort;
  readonly connection: Connection;
}

/** The worker-hosted engine and its connection. */
class BrowserEngine {
  readonly #start: () => WorkerPort;
  readonly #answers = new Answers();
  readonly #holdings = new Holdings();
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
   * `bytes` may also be a `Response`, such as `fetch`'s, whose body then moves to the worker piece by piece as it
   * arrives: the engine reads each record batch as soon as it is all there, so a first load's views show its first
   * rows long before the last arrive. Or it may be a promise of either, such as a fetch still on its way: the load
   * counts as in flight from this call, so a view that opens before the bytes arrive waits for them, and a fetch that
   * fails fails its views with the reason.
   *
   * Bytes past `maxArrowBytes` are refused before they leave the page, and the buffer stays the app's; a response whose
   * `Content-Length` says it is past them is refused before its body is read, and one that does not say is refused as
   * soon as its bytes pass them. A stream of more than `maxRows` rows is refused by the engine before it decodes any
   * data when its bytes came whole, and at the record batch that passes them while they stream. The stream's schema
   * metadata may carry the load's status, as `parallax.load`: when the source was read, and NaNs the API turned blank.
   * A refused reload leaves the dataset's previous rows in place.
   *
   * The options' `onProgress` hears where the load stands: for a first load, each time its views are sent more rows;
   * for a reload, whose views keep the rows before it, at most four times a second.
   */
  public async load(
    dataset: string,
    bytes: LoadBody | PromiseLike<LoadBody>,
    options: LoadCall = {},
  ): Promise<Loaded> {
    const job = this.#holdings.job(dataset, options);
    const done = arriving(bytes) ? this.#sendWhenArrived(job, bytes) : this.#sendBody(job, bytes);
    return this.#failure === null ? this.#holdings.track(job, done) : done;
  }

  /**
   * Whether views of `dataset` run here, on a table the app loaded: true once a load of it has succeeded, or once a
   * first load's rows have begun to show, unless the view waits for the dataset `whole`. A load still in flight is
   * waited for, until then, and if it fails with nothing loaded before it, its reason is thrown, so the view says why.
   */
  public async holds(dataset: string, whole = false): Promise<boolean> {
    return this.#holdings.holds(dataset, whole);
  }

  /** The connection for views of `dataset`, once the app's load of it has succeeded, or its first rows show, unless
   * the view waits for the dataset `whole`, as a chart does. A load still in flight is waited for, and one that fails,
   * or no load at all, fails the view with the reason. */
  public async connectionFor(dataset: string, whole = false): Promise<Connection> {
    if (!(await this.holds(dataset, whole))) {
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

  async #sendWhenArrived(job: Job, bytes: PromiseLike<LoadBody>): Promise<Loaded> {
    return this.#sendBody(job, await bytes);
  }

  async #sendBody(job: Job, body: LoadBody): Promise<Loaded> {
    return body instanceof Response ? this.#stream(job, body) : this.#send(job, body);
  }

  /** The rows a load's answer says the table holds, once the dataset is held. */
  #loaded(dataset: string, answer: Answered): Loaded {
    if (answer.kind !== "loaded") {
      throw new Error("The parallax worker answered a load with something else.");
    }
    this.#holdings.add(dataset);
    return { dataset, rows: answer.rows };
  }

  /** Asks the worker to load a job, moving its bytes there, and returns the load's id and its answer. */
  #ask(
    job: Job,
    fields: Pick<LoadRequest, "bytes" | "expectedBytes">,
  ): { readonly id: number; readonly answer: Promise<Answered> } {
    let loadId = 0;
    const transfer = fields.bytes === null ? [] : [fields.bytes];
    const answer = this.#request((id) => {
      loadId = id;
      this.#holdings.listen(id, job.hear);
      return loadRequest(job, { ...fields, id });
    }, transfer);
    return { answer, id: loadId };
  }

  /** Checks the bytes against the byte limit and moves them to the worker to load. */
  async #send(job: Job, bytes: ArrayBuffer): Promise<Loaded> {
    const { maxArrowBytes: mostBytes } = loadLimits();
    if (bytes.byteLength > mostBytes) {
      throw tooManyBytes(job.dataset, bytes.byteLength, mostBytes);
    }
    const { answer } = this.#ask(job, { bytes, expectedBytes: null });
    return this.#loaded(job.dataset, await answer);
  }

  /** Checks a response and posts its body to the worker chunk by chunk as it arrives, to load. */
  async #stream(job: Job, response: Response): Promise<Loaded> {
    const { maxArrowBytes: mostBytes } = loadLimits();
    const expectedBytes = await checkResponse(job.dataset, response, mostBytes);
    if (response.body === null) {
      return this.#send(job, new ArrayBuffer(0));
    }
    const { answer, id } = this.#ask(job, { bytes: null, expectedBytes });
    const post = (message: ToWorker, transfer: Transferable[]): void => {
      this.#running.worker.postMessage(message, { transfer });
    };
    // The answer may come first, as a refusal; a body that fails tells the worker, which answers with the reason.
    const pipe = { answer, dataset: job.dataset, id, mostBytes, post };
    streamBody(response.body, pipe).catch(() => null);
    return this.#loaded(job.dataset, await answer);
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
    } else if ("id" in message) {
      this.#answer(message);
    } else if (message.kind === "reply") {
      this.connection.receive(message.bytes);
    } else if (message.kind === "trapped") {
      this.#restart(trapReason(message.message));
    } else {
      this.#fail(message.message);
    }
  }

  /** Takes what the worker sent for one request: a load's progress, a CSV's chunk, or the request's answer. */
  #answer(message: Extract<Reply, { readonly id: number }>): void {
    if (message.kind === "progress") {
      this.#holdings.heard(message);
    } else if (message.kind === "chunk") {
      this.#answers.chunk(message.id, message.bytes);
    } else {
      this.#holdings.answered(message.id);
      this.#answers.settle(
        message.id,
        message.kind === "failed" ? new Error(message.message) : message,
      );
    }
  }

  /** Fails everything waiting on a worker and its views with `reason`, forgets its tables, and ends it. */
  #stop(reason: string, running: Running): void {
    this.#answers.failAll(reason);
    this.#holdings.clear();
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
