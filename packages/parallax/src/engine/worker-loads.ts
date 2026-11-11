/* The worker's loads. Each reads its stream a record batch at a time, and between batches the worker answers the page's
 * other messages, so that views open on a first load's rows so far, which reach them each time the engine publishes
 * more. Loads run one after another, in the order the page sent them. A response's body comes chunk by chunk as the
 * page receives it; its chunks wait here until their load reads them, and are handed to the engine, which reads them
 * in place, outside its own memory, and lets each go once it has read past it. */

import type { Worker as Engine } from "#wasm/parallax_wasm.js";

import type { FromWorker, LoadBytes, LoadEnd, LoadRequest } from "./messages.ts";

/** What the loads need of the worker that serves them. */
interface WorkerSide {
  readonly post: (message: FromWorker) => void;
  /** Sends the engine's encoded replies to the page, in order. */
  readonly reply: (replies: readonly unknown[]) => void;
  /** Runs work on the engine, returning what it returns, or null when it failed, which goes to `failed`, or trapped,
   * which the worker reports once. */
  readonly run: <TResult>(work: () => TResult, failed: (message: string) => void) => TResult | null;
  readonly trapped: () => boolean;
}

/** A load the page asked for: its stream's pieces that have come and not yet gone to the engine, whether the stream
 * has ended and the engine been told, and why it failed on its way, if it did. */
interface LoadTask {
  readonly request: LoadRequest;
  readonly pieces: Uint8Array[];
  ended: boolean;
  told: boolean;
  /** When the page was last told where the load stands, by `performance.now()`. */
  toldAt: number;
  error: string | null;
  /** Wakes the load when it waits for its stream. */
  wake: (() => void) | null;
}

/** The least time between the reports of a reload's progress, in milliseconds. */
const reloadReportMs = 250;

/** Where a step of a load left it, as the engine reports it. */
interface Stepped {
  readonly rows: number;
  readonly expectedRows: number | null;
  readonly estimated: boolean;
  readonly shown: boolean;
  readonly published: boolean;
  readonly waiting: boolean;
  readonly ended: boolean;
}

/** A step's report as the engine returns it, a plain object of `Stepped`'s fields. */
function steppedOf(value: unknown): Stepped {
  const field = (name: keyof Stepped): unknown =>
    typeof value === "object" && value !== null ? Reflect.get(value, name) : undefined;
  const expected = field("expectedRows");
  return {
    ended: field("ended") === true,
    estimated: field("estimated") === true,
    expectedRows: typeof expected === "number" ? expected : null,
    published: field("published") === true,
    rows: Number(field("rows")),
    shown: field("shown") === true,
    waiting: field("waiting") === true,
  };
}

/** Lets the worker answer the page's other messages, such as a view opening on the rows so far, before the load reads
 * on: a message to itself runs after what is already queued, without a timer's delay. */
async function yieldToPage(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<null>();
  const channel = new MessageChannel();
  channel.port1.addEventListener("message", () => {
    channel.port1.close();
    resolve(null);
  });
  channel.port1.start();
  channel.port2.postMessage(null);
  await promise;
}

/** Waits until more of a load's stream has come, or it has ended or failed. */
async function arrival(task: LoadTask): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<null>();
  task.wake = (): void => {
    task.wake = null;
    resolve(null);
  };
  await promise;
}

/** Whether a load has nothing new to read: its step waited, and no piece, end or failure has come since. */
function idle(task: LoadTask, stepped: Stepped): boolean {
  const unchanged = task.pieces.length === 0 && task.error === null && task.ended === task.told;
  return stepped.waiting && unchanged;
}

/** Hands the engine the pieces of a load's stream that have come, and says when it has ended. */
function feed(engine: Engine, task: LoadTask): void {
  const { dataset } = task.request;
  for (const piece of task.pieces.splice(0)) {
    engine.addLoadBytes(dataset, piece);
  }
  if (task.ended && !task.told) {
    engine.endLoadBytes(dataset);
    task.told = true;
  }
}

/** The worker's loads, one after another. */
class WorkerLoads {
  readonly #side: WorkerSide;
  readonly #tasks = new Map<number, LoadTask>();
  #queue: Promise<void> = Promise.resolve();

  public constructor(side: WorkerSide) {
    this.#side = side;
  }

  /** Starts a load once the loads before it have ended; a body's chunks wait meanwhile. */
  public start(engine: Engine, request: LoadRequest): void {
    const whole = request.bytes;
    const task: LoadTask = {
      ended: whole !== null,
      error: null,
      pieces: whole === null ? [] : [new Uint8Array(whole)],
      request,
      told: false,
      toldAt: Number.NEGATIVE_INFINITY,
      wake: null,
    };
    this.#tasks.set(request.id, task);
    this.#queue = this.#queue.then(async () => this.#guarded(engine, task));
  }

  /** Runs `work` once the loads started before it have ended. */
  public after(work: () => void): void {
    this.#queue = this.#queue.then(work);
  }

  /** Keeps the next chunk of a load's body for the load to read. */
  public bytes(message: LoadBytes): void {
    const task = this.#tasks.get(message.id);
    if (task !== undefined && !task.ended) {
      task.pieces.push(new Uint8Array(message.bytes));
      task.wake?.();
    }
  }

  /** Notes that a load's body has ended, or failed on its way. */
  public end(message: LoadEnd): void {
    const task = this.#tasks.get(message.id);
    if (task !== undefined && !task.ended) {
      task.ended = true;
      task.error = message.error;
      task.wake?.();
    }
  }

  /** Runs one load, failing the worker if the load itself breaks, so the loads after it still run. */
  async #guarded(engine: Engine, task: LoadTask): Promise<void> {
    try {
      await this.#pump(engine, task);
    } catch (error: unknown) {
      this.#fatal(error instanceof Error ? error.message : String(error));
    }
  }

  #fatal(reason: string): void {
    this.#side.post({ kind: "fatal", message: `The parallax engine failed: ${reason}` });
  }

  /** Runs one load to its end: it starts in the engine, then reads the stream a batch at a time, waiting for pieces
   * still on their way and letting the page's other messages through between batches. */
  async #pump(engine: Engine, task: LoadTask): Promise<void> {
    let stepped = this.#begin(engine, task) ? this.#step(engine, task) : null;
    while (stepped !== null && !this.#side.trapped()) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- a load reads a batch at a time, letting the page in between.
      await (idle(task, stepped) ? arrival(task) : yieldToPage());
      stepped = this.#step(engine, task);
    }
    this.#tasks.delete(task.request.id);
  }

  #begin(engine: Engine, { request }: LoadTask): boolean {
    const begun = this.#side.run(
      () => {
        engine.beginLoad(
          request.dataset,
          request.primaryKey ?? undefined,
          request.nowMicros,
          request.sourceAsOfMicros ?? undefined,
          request.maxRows,
          request.expectedBytes ?? undefined,
        );
        return true;
      },
      (message) => {
        this.#side.post({ id: request.id, kind: "failed", message });
      },
    );
    return begun === true;
  }

  /** Reads a load's next record batch, if it has come. Returns null once the load is over, answered or failed. */
  #step(engine: Engine, task: LoadTask): Stepped | null {
    return this.#side.run(
      () => this.#read(engine, task),
      (message) => {
        this.#fail(engine, task, message);
      },
    );
  }

  #read(engine: Engine, task: LoadTask): Stepped | null {
    if (task.error !== null) {
      return this.#abandon(engine, task, task.error);
    }
    feed(engine, task);
    const next = steppedOf(engine.stepLoad(task.request.dataset));
    this.#tell(engine, task, next);
    return next.ended ? this.#finish(engine, task) : next;
  }

  /** Gives up a load whose stream failed on its way to the page. */
  #abandon(engine: Engine, task: LoadTask, reason: string): null {
    engine.abandonLoad(task.request.dataset);
    this.#fail(engine, task, reason);
    return null;
  }

  /** Ends a load whose stream has ended, brings its views up to date, and answers with the rows. */
  #finish(engine: Engine, { request }: LoadTask): null {
    const rows = engine.finishLoad(request.dataset);
    this.#side.reply(engine.refresh());
    this.#side.post({ id: request.id, kind: "loaded", rows: Number(rows) });
    return null;
  }

  /** Brings the views a batch was published to, and tells the page where the load stands: a first load as its views
   * see more rows, and a reload, whose views wait, at most every {@link reloadReportMs}, so the page renders no more
   * often. */
  #tell(engine: Engine, task: LoadTask, next: Stepped): void {
    if (next.published) {
      this.#side.reply(engine.refresh());
    }
    const now = performance.now();
    const reloading = !next.shown && !next.waiting && !next.ended;
    if (next.published || (reloading && now - task.toldAt >= reloadReportMs)) {
      task.toldAt = now;
      const { rows, expectedRows, estimated, shown } = next;
      this.#side.post({
        estimated,
        expectedRows,
        id: task.request.id,
        kind: "progress",
        rows,
        shown,
      });
    }
  }

  /** Fails a load, bringing its views up to date first, such as a refused reload's, which say its refresh failed. */
  #fail(engine: Engine, { request }: LoadTask, message: string): void {
    this.#side.run(
      () => {
        this.#side.reply(engine.refresh());
      },
      (reason) => {
        this.#fatal(reason);
      },
    );
    this.#side.post({ id: request.id, kind: "failed", message });
  }
}

export { WorkerLoads };
