/* The parallax engine in a Web Worker: the WebAssembly build of the session code, which answers byte for byte as the
 * native build does. `serve()` makes this worker answer the page, through the messages in `messages.ts`; the
 * package's worker entry, `src/worker.ts`, calls it.
 *
 * A WebAssembly trap, such as running out of memory, leaves the engine unusable: its state may be half-changed and
 * its object stays borrowed. The worker then sends `trapped` and answers nothing more, and the page ends it, which
 * frees all its memory, and starts another. */

import init, { Worker as Engine } from "#wasm/parallax_wasm.js";

import { parseToWorker } from "./messages.ts";
import type { ExportRequest, FromWorker, LoadRequest } from "./messages.ts";

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

/** Runs `work` on the engine. A trap ends this worker's use, and is reported once; the engine's own errors go to
 * `failed`, for the request they belong to. */
function run(work: () => void, failed: (message: string) => void): void {
  if (trapped) {
    return;
  }
  try {
    work();
  } catch (error: unknown) {
    if (isTrap(error)) {
      trapped = true;
      post({ kind: "trapped", message: `${error.name}: ${error.message}` });
      return;
    }
    failed(describe(error));
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

/** Loads bytes the page moved here, decoded in place, brings open views up to date, and answers with the rows. */
function load(engine: Engine, request: LoadRequest): void {
  run(
    () => {
      const rows = engine.loadTable(
        request.dataset,
        new Uint8Array(request.bytes),
        request.primaryKey ?? undefined,
        request.nowMicros,
        request.sourceAsOfMicros ?? undefined,
        request.maxRows,
      );
      const pushed: readonly unknown[] = engine.refresh();
      reply(pushed);
      post({ id: request.id, kind: "loaded", rows: Number(rows) });
    },
    (message) => {
      post({ id: request.id, kind: "failed", message });
    },
  );
}

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
    load(engine, message);
  } else {
    exportView(engine, message);
  }
}

/** The engine, started by the first message, which the page sends as soon as it starts this worker. */
let started: Promise<Engine> | null = null;

/** Starts the engine, whose WebAssembly sits beside this script. */
async function start(): Promise<Engine> {
  await init();
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
