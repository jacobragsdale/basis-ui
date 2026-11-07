/* The protocol between the page and the engine's worker, besides the engine's own protobuf messages that ride inside
 * it. The page sends `ToWorker` messages and the worker answers with `FromWorker` ones; `worker.ts` is the other end.
 *
 * - `load` carries Arrow IPC stream bytes the app holds, such as its API's response. The buffer moves to the worker in
 *   the message's transfer list, so it is never copied between threads. The worker answers `loaded` with the rows.
 * - `export` asks for a view's xlsx, which comes back whole as `exported`, or its CSV, which comes back as `chunk`s and
 *   then `exported`, so the whole file is never held in the worker.
 * - `message` carries one encoded protocol message each way; the worker's replies come back as `reply`, in order.
 * - `failed` answers a load or an export the engine refused, with the reason.
 * - `trapped` says the engine hit a WebAssembly trap, such as running out of memory, which leaves it unusable; the
 *   worker answers nothing more, and the page ends it and starts another.
 * - `fatal` says the worker cannot go on at all, such as when the engine did not start. */

/** An export's file format. */
type ExportFormat = "xlsx" | "csv";

/** One encoded protocol message for the engine. */
interface ProtocolMessage {
  readonly kind: "message";
  readonly bytes: Uint8Array;
}

/** Arrow IPC stream bytes to load as a dataset; the buffer moved to the worker with the message. */
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
  readonly format: ExportFormat;
  readonly layout: string;
  readonly loadVersion: number | null;
  readonly maxCells: number;
}

/** A message the page sends the worker. */
type ToWorker = ProtocolMessage | LoadRequest | ExportRequest;

/** A message the worker sends the page. */
type FromWorker =
  | { readonly kind: "reply"; readonly bytes: Uint8Array }
  | { readonly kind: "loaded"; readonly id: number; readonly rows: number }
  | { readonly kind: "chunk"; readonly id: number; readonly bytes: Uint8Array }
  | { readonly kind: "exported"; readonly id: number; readonly bytes: Uint8Array | null }
  | { readonly kind: "failed"; readonly id: number; readonly message: string }
  | { readonly kind: "trapped"; readonly message: string }
  | { readonly kind: "fatal"; readonly message: string };

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isNullable<TValue>(
  value: unknown,
  check: (of: unknown) => of is TValue,
): value is TValue | null {
  return value === null || check(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

function parseLoad(data: Readonly<Record<string, unknown>>): LoadRequest | null {
  const { id, dataset, bytes, primaryKey, nowMicros, sourceAsOfMicros, maxRows } = data;
  const named = isCount(id) && isString(dataset) && bytes instanceof ArrayBuffer;
  const keyed = isNullable(primaryKey, isString);
  const stamped = isNumber(nowMicros) && isNullable(sourceAsOfMicros, isNumber);
  if (!named || !keyed || !stamped || !isCount(maxRows)) {
    return null;
  }
  return { bytes, dataset, id, kind: "load", maxRows, nowMicros, primaryKey, sourceAsOfMicros };
}

function parseExport(data: Readonly<Record<string, unknown>>): ExportRequest | null {
  const { id, format, layout, loadVersion, maxCells } = data;
  const known = format === "xlsx" || format === "csv";
  if (
    !isCount(id) ||
    !known ||
    !isString(layout) ||
    !isNullable(loadVersion, isCount) ||
    !isCount(maxCells)
  ) {
    return null;
  }
  return { format, id, kind: "export", layout, loadVersion, maxCells };
}

/** Reads a message the page sent, or null if it is not one the worker knows. The worker checks it by hand, so that
 * its bundle carries no schema library. */
function parseToWorker(data: unknown): ToWorker | null {
  if (!isRecord(data)) {
    return null;
  }
  switch (data["kind"]) {
    case "message": {
      const { bytes } = data;
      return bytes instanceof Uint8Array ? { bytes, kind: "message" } : null;
    }
    case "load": {
      return parseLoad(data);
    }
    case "export": {
      return parseExport(data);
    }
    default: {
      return null;
    }
  }
}

export { parseToWorker };
export type { ExportFormat, ExportRequest, FromWorker, LoadRequest, ProtocolMessage, ToWorker };
