/**
 * The parallax engine in a Web Worker: the WebAssembly build of the same session
 * code the server runs, so a dataset held in the browser answers views as the
 * server would.
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
 * - `copy` fetches a table's copy from the server's `/copy/{dataset}` endpoint and
 *   loads it; the browser decodes the compressed answer natively. `cancel` stops
 *   a copy the page gave up on.
 * - `message` carries one encoded protocol message, and every reply goes back as
 *   `reply`, in order.
 *
 * A WebAssembly trap, such as running out of memory, leaves the engine unusable:
 * its state may be half-changed and its object stays borrowed. The worker then
 * sends `trapped` and answers nothing more, and the page ends it, which frees all
 * its memory, and starts another.
 */

import init, { Worker as Engine } from "./parallax_wasm.js";

/** A copy to fetch and load. */
interface CopyRequest {
  readonly kind: "copy";
  readonly id: number;
  readonly dataset: string;
  readonly parameters: Readonly<Record<string, string>>;
  readonly url: string;
}

/** One encoded protocol message. */
interface ProtocolMessage {
  readonly kind: "message";
  readonly bytes: Uint8Array;
}

/** The page gave up waiting for a copy. */
interface CancelCopy {
  readonly kind: "cancel";
  readonly id: number;
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

type Inbound = CopyRequest | ProtocolMessage | CancelCopy | LoadRequest | ExportRequest;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTextRecord(value: unknown): value is Readonly<Record<string, string>> {
  return isRecord(value) && Object.values(value).every((v) => typeof v === "string");
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

function parseCopy(data: Readonly<Record<string, unknown>>): CopyRequest | null {
  const { id, dataset, parameters, url } = data;
  if (typeof id !== "number" || typeof dataset !== "string" || !isTextRecord(parameters) || typeof url !== "string") {
    return null;
  }
  return { kind: "copy", id, dataset, parameters, url };
}

/** Reads a message from the page, or null if it is not one this worker knows. */
function parse(data: unknown): Inbound | null {
  if (!isRecord(data)) {
    return null;
  }
  const { kind, bytes, id } = data;
  switch (kind) {
    case "message":
      return bytes instanceof Uint8Array ? { kind, bytes } : null;
    case "load":
      return parseLoad(data);
    case "export":
      return parseExport(data);
    case "copy":
      return parseCopy(data);
    case "cancel":
      return typeof id === "number" ? { kind, id } : null;
    default:
      return null;
  }
}

const ARROW_STREAM = "application/vnd.apache.arrow.stream";

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

/** Copies being fetched, by request id, so that the page can cancel them. */
const fetching = new Map<number, AbortController>();

/** Fetches a copy while the engine starts, and returns its bytes. */
async function fetchCopy(request: CopyRequest, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(request.url, { credentials: "include", signal });
  if (!response.ok) {
    const reason = (await response.text()).trim();
    throw new Error(`the server answered ${response.status.toString()}${reason === "" ? "" : `: ${reason}`}`);
  }
  const type = response.headers.get("content-type") ?? "";
  if (!type.startsWith(ARROW_STREAM)) {
    throw new Error(`the server sent ${type === "" ? "no content type" : type}, not an Arrow stream`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function copy(request: CopyRequest): void {
  const controller = new AbortController();
  fetching.set(request.id, controller);
  const failed = (message: string): void => {
    fetching.delete(request.id);
    postMessage({ kind: "failed", id: request.id, message });
  };
  Promise.all([fetchCopy(request, controller.signal), engine]).then(
    ([bytes, e]) => {
      // A copy the page gave up on is not loaded, so that it holds no memory.
      if (controller.signal.aborted) {
        failed("the page stopped waiting for the copy");
        return;
      }
      fetching.delete(request.id);
      run(() => {
        const rows = Number(e.loadCopy(request.dataset, JSON.stringify(request.parameters), bytes));
        postMessage({ kind: "copied", id: request.id, rows });
      }, failed);
    },
    (error: unknown) => {
      failed(describe(error));
    }
  );
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
  if (message.kind === "cancel") {
    fetching.get(message.id)?.abort();
    return;
  }
  if (message.kind === "copy") {
    copy(message);
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
