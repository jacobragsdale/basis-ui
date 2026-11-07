/**
 * The parallax engine in a Web Worker: the WebAssembly build of the session code,
 * which answers byte for byte as the native build does.
 *
 * The page sends these messages:
 *
 * - `load` loads Arrow IPC stream bytes the app holds, such as its API's response.
 *   The buffer moves here with the message, so it is never copied between
 *   threads, and the engine decodes it in place. Views of the dataset that are
 *   already open get the new rows, then the page gets `loaded`.
 * - `export` writes a view's xlsx, whose bytes move back as `exported`, or its
 *   CSV, which goes back as `chunk`s, then `exported`, so that the whole file is
 *   never held here.
 * - `message` carries one encoded protocol message, and every reply goes back as
 *   `reply`, in order.
 *
 * A WebAssembly trap, such as running out of memory, leaves the engine unusable:
 * its state may be half-changed and its object stays borrowed. The worker then
 * sends `trapped` and answers nothing more, and the page ends it, which frees all
 * its memory, and starts another.
 */

import init, { Worker as Engine } from "./parallax_wasm.js";

/** One encoded protocol message. */
interface ProtocolMessage {
  readonly kind: "message";
  readonly bytes: Uint8Array;
}

/** Arrow IPC stream bytes to load as a dataset; the buffer moved here with the message. */
interface LoadRequest {
  readonly kind: "load";
  readonly id: number;
  readonly dataset: string;
  readonly bytes: ArrayBuffer;
  readonly primaryKey: string | null;
  readonly nowMicros: number;
  /** When the source was read, if the app says so outside the stream; null reads it from the stream. */
  readonly sourceAsOfMicros: number | null;
  readonly maxRows: number;
}

/** A view to export, as its layout, which names the dataset. */
interface ExportRequest {
  readonly kind: "export";
  readonly id: number;
  readonly format: "xlsx" | "csv";
  readonly layout: string;
  readonly loadVersion: number | null;
  readonly maxCells: number;
}

type Inbound = ProtocolMessage | LoadRequest | ExportRequest;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseLoad(data: Readonly<Record<string, unknown>>): LoadRequest | null {
  const { id, dataset, bytes, primaryKey, nowMicros, sourceAsOfMicros, maxRows } = data;
  const keyed = primaryKey === null || typeof primaryKey === "string";
  const stamped = typeof nowMicros === "number" && (sourceAsOfMicros === null || typeof sourceAsOfMicros === "number");
  if (typeof id !== "number" || typeof dataset !== "string" || !(bytes instanceof ArrayBuffer) || !keyed || !stamped || !isCount(maxRows)) {
    return null;
  }
  return { kind: "load", id, dataset, bytes, primaryKey, nowMicros, sourceAsOfMicros, maxRows };
}

function parseExport(data: Readonly<Record<string, unknown>>): ExportRequest | null {
  const { id, format, layout, loadVersion, maxCells } = data;
  if (typeof id !== "number" || (format !== "xlsx" && format !== "csv") || typeof layout !== "string" || !(loadVersion === null || isCount(loadVersion)) || !isCount(maxCells)) {
    return null;
  }
  return { kind: "export", id, format, layout, loadVersion, maxCells };
}

/** Reads a message from the page, or null if it is not one this worker knows. */
function parse(data: unknown): Inbound | null {
  if (!isRecord(data)) {
    return null;
  }
  const { kind, bytes } = data;
  switch (kind) {
    case "message":
      return bytes instanceof Uint8Array ? { kind, bytes } : null;
    case "load":
      return parseLoad(data);
    case "export":
      return parseExport(data);
    default:
      return null;
  }
}

const engine: Promise<Engine> = init({ module_or_path: new URL("./parallax_wasm_bg.wasm", import.meta.url) }).then(() => new Engine());

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Whether an error came from the WebAssembly machine rather than from the engine's code: a trap, such as
 * `unreachable` when memory runs out, or a stack overflow, which the browser throws as a RangeError. The engine's
 * own errors arrive as plain Errors.
 */
function isTrap(error: unknown): error is Error {
  return error instanceof WebAssembly.RuntimeError || error instanceof RangeError;
}

/** Set once the engine has trapped; nothing more is answered. */
let trapped = false;

/**
 * Runs `work` on the engine. A trap ends this worker's use, and is reported once; the engine's own errors go to
 * `failed`, for the request they belong to.
 */
function run(work: () => void, failed: (message: string) => void): void {
  if (trapped) {
    return;
  }
  try {
    work();
  } catch (error: unknown) {
    if (isTrap(error)) {
      trapped = true;
      postMessage({ kind: "trapped", message: `${error.name}: ${error.message}` });
      return;
    }
    failed(describe(error));
  }
}

/** Loads bytes the page moved here, brings open views up to date, and answers with the rows. */
function load(e: Engine, request: LoadRequest): void {
  run(
    () => {
      const rows = Number(e.loadTable(request.dataset, new Uint8Array(request.bytes), request.primaryKey ?? undefined, request.nowMicros, request.sourceAsOfMicros ?? undefined, request.maxRows));
      reply(e.refresh());
      postMessage({ kind: "loaded", id: request.id, rows });
    },
    (message) => {
      postMessage({ kind: "failed", id: request.id, message });
    }
  );
}

/** Writes an export: an xlsx's bytes move to the page whole, a CSV's in chunks as they are written. */
function exportView(e: Engine, request: ExportRequest): void {
  run(
    () => {
      const loadVersion = request.loadVersion ?? undefined;
      if (request.format === "xlsx") {
        const bytes = e.exportXlsx(request.layout, loadVersion, request.maxCells);
        postMessage({ kind: "exported", id: request.id, bytes }, [bytes.buffer]);
        return;
      }
      e.exportCsv(request.layout, loadVersion, (bytes: Uint8Array) => {
        postMessage({ kind: "chunk", id: request.id, bytes }, [bytes.buffer]);
      });
      postMessage({ kind: "exported", id: request.id, bytes: null });
    },
    (message) => {
      postMessage({ kind: "failed", id: request.id, message });
    }
  );
}

function reply(replies: readonly unknown[]): void {
  for (const bytes of replies) {
    if (bytes instanceof Uint8Array) {
      postMessage({ kind: "reply", bytes }, [bytes.buffer]);
    }
  }
}

// Replies keep the order of the messages: callbacks on one promise run in the
// order they were added.
addEventListener("message", (event: MessageEvent<unknown>) => {
  const message = parse(event.data);
  if (message === null) {
    postMessage({ kind: "fatal", message: "the parallax worker received a message it does not know" });
    return;
  }
  engine.then(
    (e) => {
      switch (message.kind) {
        case "message":
          run(
            () => {
              reply(e.handle(message.bytes));
            },
            (reason) => {
              postMessage({ kind: "fatal", message: `the parallax engine failed: ${reason}` });
            }
          );
          return;
        case "load":
          load(e, message);
          return;
        case "export":
          exportView(e, message);
          return;
      }
    },
    (error: unknown) => {
      postMessage({ kind: "fatal", message: `the parallax engine did not start: ${describe(error)}` });
    }
  );
});
