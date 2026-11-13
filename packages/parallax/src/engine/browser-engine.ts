/* The engine in the browser: one Web Worker running the WebAssembly build, holding the tables the app loads. The app
 * hands it Arrow bytes with `load`, which move rather than copy, or a response whose body moves piece by piece as it
 * arrives, and its connection answers views of those tables, a first load's from its first rows. The browser's limits
 * are checked before a load costs memory. A load or export that runs the engine out of memory traps it; the worker is
 * then ended, which frees its memory, every waiting request and open view fails with the reason, and a new, empty
 * worker takes its place. A dataset the page unloads gives its memory back as `memory.ts` says. */

import { Answers } from "./answers.ts";
import type { Answered } from "./answers.ts";
import type { Connection } from "./connection.ts";
import { Holdings, loadRequest } from "./holdings.ts";
import type { Job, LoadBody, LoadRun } from "./holdings.ts";
import { exportRequest, exportedFile } from "./exported.ts";
import { loadLimits, trapReason } from "./limits.ts";
import type { Loaded } from "./limits.ts";
import type { ExportFormat, LoadRequest, ToWorker } from "./messages.ts";
import { MemoryWatch, plannedReason } from "./memory.ts";
import type { EngineOptions, Unloaded } from "./memory.ts";
import { arriving } from "./port.ts";
import type { WorkerPort } from "./port.ts";
import { parseFromWorker } from "./replies.ts";
import type { Reply } from "./replies.ts";
import { Restarts } from "./restarts.ts";
import type { RestartListener } from "./restarts.ts";
import { checkArrival, spawn } from "./running.ts";
import type { Running } from "./running.ts";
import { checkBytes, checkResponse, streamBody } from "./stream.ts";

/** The worker-hosted engine and its connection. */
class BrowserEngine {
  readonly #start: () => WorkerPort;
  readonly #answers = new Answers();
  readonly #holdings = new Holdings();
  readonly #restarts = new Restarts();
  readonly #memory: MemoryWatch;
  #running: Running;
  #failure: string | null = null;

  /** `start` makes a worker: once now, and again whenever the engine traps or gives its memory back. */
  public constructor(start: () => WorkerPort, options: EngineOptions = {}) {
    this.#start = start;
    this.#memory = new MemoryWatch(options);
    this.#running = this.#spawn();
  }

  /** The connection to the running worker's engine. A trap replaces it, after failing every view open on it. */
  public get connection(): Connection {
    return this.#running.connection;
  }

  /** Calls `listener` whenever the engine starts again empty, so the app loads its data again; returns its remover. */
  public onRestart(listener: RestartListener): () => void {
    return this.#restarts.add(listener);
  }

  /**
   * Loads Arrow IPC stream bytes that the app holds, such as its API's response, as `dataset`. The buffer moves to the
   * worker, never copied, so the page can no longer read it. A second load of the same dataset reloads it. `bytes` may
   * also be a `Response`, whose body moves to the worker piece by piece, the engine reading each record batch once it
   * is there, so a first load's views show its first rows long before the last arrive; or a promise of either, such as
   * a fetch on its way, which counts as in flight from this call, so a view that opens first waits for it, and fails
   * with the fetch's reason.
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
    options: LoadRun = {},
  ): Promise<Loaded> {
    const job = this.#holdings.job(dataset, options);
    const running = this.#running;
    const done = arriving(bytes)
      ? Promise.resolve(bytes).then(async (body) => {
          // Unless its dataset was unloaded, or its worker replaced, while the body was on its way.
          await checkArrival(running, { dropped: this.#holdings.dropped(job), job }, body);
          return this.#sendBody(job, body);
        })
      : this.#sendBody(job, bytes);
    this.#holdings.underWay(job, done, () => {
      this.#restartIfIdle();
    });
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

  /** The connection for views of `dataset` once its load has succeeded or its first rows show, or, `whole`, once it
   * has all loaded, as a chart's; a load that fails, or none, fails the view with the reason. */
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
   * the screen does. An xlsx of more than `maxXlsxCells` cells is refused with a reason that says to export CSV.
   * A CSV arrives in chunks as it is written, joined into the file without being held whole anywhere else.
   */
  public async export(
    layoutJson: string,
    format: ExportFormat,
    loadVersion: bigint | number | null = null,
  ): Promise<Blob> {
    const answer = await this.#request(exportRequest(layoutJson, format, loadVersion));
    return exportedFile(answer, format);
  }

  /** Drops `dataset`, which the page no longer shows, once any load of it before has ended; views open on it keep it
   * until they close. The worker may then be replaced to give its memory back, as `memory.ts` says. */
  public async unload(dataset: string): Promise<Unloaded> {
    this.#holdings.drop(dataset);
    const answer = await this.#request((id) => ({ dataset, id, kind: "unload" }));
    const unloaded = this.#memory.unloaded(answer);
    this.#restartIfIdle();
    return unloaded;
  }

  /** Stops using the worker for good, as when the page no longer shows parallax: every pending and later request
   * fails, every view reports `reason`, and the worker ends, releasing the tables it held. */
  public close(reason = "Parallax was closed in this page."): void {
    this.#fail(reason);
  }

  #spawn(): Running {
    return spawn(this.#start, (worker) => this.#running.worker === worker, {
      fail: (reason) => {
        this.#fail(reason);
      },
      message: (data) => {
        this.#receive(data);
      },
    });
  }

  async #sendBody(job: Job, body: LoadBody): Promise<Loaded> {
    return body instanceof Response ? this.#stream(job, body) : this.#send(job, body);
  }

  /** The rows a load's answer says the table holds, once the dataset is held. */
  #loaded(job: Job, answer: Answered): Loaded {
    if (answer.kind !== "loaded") {
      throw new Error("The parallax worker answered a load with something else.");
    }
    this.#holdings.add(job);
    return { dataset: job.dataset, rows: answer.rows };
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
    // A load that never reached the worker, or that it failed, has no more progress to hear.
    answer.catch(() => {
      this.#holdings.answered(loadId);
    });
    return { answer, id: loadId };
  }

  /** Checks the bytes against the byte limit and moves them to the worker to load. */
  async #send(job: Job, bytes: ArrayBuffer): Promise<Loaded> {
    checkBytes(job.dataset, bytes, loadLimits().maxArrowBytes);
    const { answer } = this.#ask(job, { bytes, expectedBytes: null });
    return this.#loaded(job, await answer);
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
    const pipe = { answer, dataset: job.dataset, id, mostBytes, post, signal: job.signal };
    streamBody(response.body, pipe).catch(() => null);
    return this.#loaded(job, await answer);
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
      queueMicrotask(() => {
        this.#restartIfIdle();
      });
    }
  }

  /** Replaces a worker that is to give its memory back, once nothing waits on it: after an answer's own
   * continuations, which may ask for more. */
  #restartIfIdle(): void {
    if (
      this.#failure === null &&
      this.#memory.restartNow(this.#answers.idle && this.#holdings.idle)
    ) {
      this.#restart(plannedReason, true);
    }
  }

  /** Fails everything waiting on a worker and its views with `reason`, forgets its tables, and ends it. */
  #stop(reason: string, running: Running): void {
    running.stopped = reason;
    this.#answers.failAll(reason);
    this.#holdings.clear();
    running.connection.disconnect(reason);
    running.worker.terminate();
  }

  /** Replaces a worker whose engine trapped, or that is to give its memory back, `planned`, with a new, empty one.
   * Every pending request and open view fails with `reason`, and ending the old worker frees all its memory. */
  #restart(reason: string, planned = false): void {
    this.#memory.reset();
    const trapped = this.#running;
    // The new worker first, so that whatever reacts to the failures below reaches it.
    this.#running = this.#spawn();
    this.#stop(reason, trapped);
    this.#restarts.tell(reason, planned);
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
