/* The parallax engine in a Web Worker: the WebAssembly build of the session code, which answers byte for byte as the
 * native build does. `serve()` makes this worker answer the page, through the messages in `messages.ts`; the
 * package's worker entry, `src/worker.ts`, calls it.
 *
 * Loads read their streams a record batch at a time, answering the page's other messages in between, as
 * `worker-loads.ts` says.
 *
 * A WebAssembly trap, such as running out of memory, leaves the engine unusable: its state may be half-changed and
 * its object stays borrowed. The worker then sends `trapped` and answers nothing more, and the page ends it, which
 * frees all its memory, and starts another. */

import init, { Worker as Engine } from "#wasm/parallax_wasm.js";

import { parseToWorker } from "./messages.ts";
import type { ExportRequest, FromWorker, UnloadRequest } from "./messages.ts";
import { WorkerLoads } from "./worker-loads.ts";

/** Sends the page a message, moving the buffers in `transfer` rather than copying them. */
function post(message: FromWorker, transfer: Transferable[] = []): void {
  globalThis.postMessage(message, { transfer });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Whether an error came from the WebAssembly machine rather than from the engine's code: a trap, such as `unreachable`
 * when memory runs out, or a stack overflow, which the browser throws as a RangeError. The engine's own errors arrive
 * as plain Errors.
 */
function isTrap(error: unknown): error is Error {
  return error instanceof WebAssembly.RuntimeError || error instanceof RangeError;
}

/** Set once the engine has trapped; nothing more is answered. */
let trapped = false;

/** Runs `work` on the engine and returns what it returns, or null. A trap ends this worker's use, and is reported
 * once; the engine's own errors go to `failed`, for the request they belong to. */
function run<TResult>(work: () => TResult, failed: (message: string) => void): TResult | null {
  if (trapped) {
    return null;
  }
  try {
    return work();
  } catch (error: unknown) {
    if (isTrap(error)) {
      trapped = true;
      post({ kind: "trapped", message: `${error.name}: ${error.message}` });
      return null;
    }
    failed(describe(error));
    return null;
  }
}

/** Sends the engine's encoded replies to the page, in order. */
function reply(replies: readonly unknown[]): void {
  for (const bytes of replies) {
    if (bytes instanceof Uint8Array) {
      post({ bytes, kind: "reply" }, [bytes.buffer]);
    }
  }
}

/** The loads the page asks for, one after another. */
const loads = new WorkerLoads({
  post: (message): void => {
    post(message);
  },
  reply,
  run,
  trapped: (): boolean => trapped,
});

/** Writes an export: an xlsx's bytes move to the page whole, a CSV's in chunks as they are written. */
function exportView(engine: Engine, request: ExportRequest): void {
  run(
    () => {
      const loadVersion = request.loadVersion ?? undefined;
      if (request.format === "xlsx") {
        const bytes = engine.exportXlsx(request.layout, loadVersion, request.maxCells);
        post({ bytes, id: request.id, kind: "exported" }, [bytes.buffer]);
        return;
      }
      engine.exportCsv(request.layout, loadVersion, (bytes: Uint8Array) => {
        post({ bytes, id: request.id, kind: "chunk" }, [bytes.buffer]);
      });
      post({ bytes: null, id: request.id, kind: "exported" });
    },
    (message) => {
      post({ id: request.id, kind: "failed", message });
    },
  );
}

/** The engine's WebAssembly memory, once it has started. */
let memory: WebAssembly.Memory | null = null;

/** Drops a dataset once the loads before it have ended, and says what the memory holds then. */
function unload(engine: Engine, request: UnloadRequest): void {
  loads.after(() => {
    run(
      () => {
        engine.unloadTable(request.dataset);
        post({
          heldBytes: engine.heldBytes(),
          id: request.id,
          kind: "unloaded",
          memoryBytes: memory?.buffer.byteLength ?? 0,
        });
      },
      (message) => {
        post({ id: request.id, kind: "failed", message });
      },
    );
  });
}

/** Passes one encoded protocol message to the engine and its replies to the page. */
function protocol(engine: Engine, bytes: Uint8Array): void {
  run(
    () => {
      const replies: readonly unknown[] = engine.handle(bytes);
      reply(replies);
    },
    (reason) => {
      post({ kind: "fatal", message: `The parallax engine failed: ${reason}` });
    },
  );
}

/** Handles one message from the page. */
function handle(engine: Engine, data: unknown): void {
  const message = parseToWorker(data);
  if (message === null) {
    post({ kind: "fatal", message: "The parallax worker received a message it does not know." });
  } else if (message.kind === "message") {
    protocol(engine, message.bytes);
  } else if (message.kind === "load") {
    loads.start(engine, message);
  } else if (message.kind === "load-bytes") {
    loads.bytes(message);
  } else if (message.kind === "load-end") {
    loads.end(message);
  } else if (message.kind === "unload") {
    unload(engine, message);
  } else {
    exportView(engine, message);
  }
}

/** The engine, started by the first message, which the page sends as soon as it starts this worker. */
let started: Promise<Engine> | null = null;

/** Starts the engine, whose WebAssembly sits beside this script. */
async function start(): Promise<Engine> {
  ({ memory } = await init());
  return new Engine();
}

/** Handles a message once the engine has started. Messages are handled in the order they came, since each waits on
 * the one start in turn. */
async function receive(data: unknown): Promise<void> {
  started ??= start();
  const engine = await started;
  handle(engine, data);
}

/** Tells the page the engine did not start, so that it fails every view and load with the reason. */
function notStarted(reason: unknown): void {
  post({ kind: "fatal", message: `The parallax engine did not start: ${describe(reason)}` });
}

/** Serves the page from this worker: from now on, each message the page sends is handled, in order. */
function serve(): void {
  globalThis.addEventListener("message", (event: MessageEvent<unknown>) => {
    receive(event.data).catch(notStarted);
  });
}

export { serve };
