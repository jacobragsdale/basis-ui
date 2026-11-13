/* What the engine in the browser holds, from spike 0.3, and how a load is stamped. Each limit is checked before a load
 * costs any memory, and its error names the limit, the size and what to do. */

import type { ExportFormat } from "./messages.ts";

/**
 * The most bytes of Arrow one table the app loads may have, checked before the bytes leave the page: the limit, since
 * the engine's memory follows the bytes. Step 6.3.9 set it from the scale harness: 1,000,000 positions, 460 MB of Arrow
 * and 40 columns, take 449 MB of WebAssembly and 1.3 GB of browser at their peak, and pivot in about 200 ms, 700 ms
 * with the CPU held to 40 %. A narrow table holds more rows within it, and a wide one fewer.
 */
const maxArrowBytes = 500_000_000;

/**
 * The most rows one table the app loads may have, far above what {@link maxArrowBytes} lets a table of a few columns
 * hold: the grid's scrollbar lands on every row up to about 15,000,000. The engine counts them from the stream's batch
 * headers before decoding any data.
 */
const maxRows = 10_000_000;

/**
 * The most cells an Excel export in the browser writes, the header and group column included. The browser holds a
 * sheet in memory at about 190 bytes a cell, which WebAssembly never returns, so a larger view is refused with a reason
 * that says to export CSV, which streams.
 */
const maxXlsxCells = 1_000_000;

/** The limits a load is checked against. */
interface LoadLimits {
  readonly maxArrowBytes: number;
  readonly maxRows: number;
}

/**
 * Where a measuring page, such as `tests/perf`'s scale harness, raises the load limits for itself before the engine
 * starts: `globalThis[Symbol.for("@basis/parallax/load-limits")] = { maxArrowBytes, maxRows }`. It is not part of the
 * package's API, which no app may rely on: the documented limits are the ones above.
 */
const liftedLimitsKey = Symbol.for("@basis/parallax/load-limits");

/** The largest row limit the engine takes, as a u32. */
const mostRows = 4_294_967_295;

function isLimit(value: unknown, most: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= most;
}

/** The limits a load is checked against: {@link maxArrowBytes} and {@link maxRows}, unless the page has raised them
 * at {@link liftedLimitsKey}. */
function loadLimits(): LoadLimits {
  const lifted: unknown = Reflect.get(globalThis, liftedLimitsKey);
  if (typeof lifted !== "object" || lifted === null) {
    return { maxArrowBytes, maxRows };
  }
  const bytes: unknown = Reflect.get(lifted, "maxArrowBytes");
  const rows: unknown = Reflect.get(lifted, "maxRows");
  return {
    maxArrowBytes: isLimit(bytes, Number.MAX_SAFE_INTEGER) ? bytes : maxArrowBytes,
    maxRows: isLimit(rows, mostRows) ? rows : maxRows,
  };
}

/** The media type of each export format. */
const exportTypes: Readonly<Record<ExportFormat, string>> = {
  csv: "text/csv;charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** How a load of the app's Arrow bytes is keyed and stamped. */
interface LoadOptions {
  /** The primary key column of a new table, so that reloads apply as diffs; none by default. A reload keeps the
   * table's. */
  readonly primaryKey?: string | null;
  /** When the app received the bytes, in microseconds since the Unix epoch, which the status shows as the load's
   * time; now by default. */
  readonly receivedAtMicros?: number;
  /**
   * When the data's source was read, in microseconds since the Unix epoch. By default the stream says, in its schema
   * metadata's `parallax.load`, as the app's API sets it. Without either the table has no source time, and a grid's
   * status bar says nothing of when the data is from unless the page gives the grid an `asOf` date: never the time the
   * app received the bytes, which would make data days old read as current.
   */
  readonly sourceAsOfMicros?: number;
}

/** A load's options, with who hears where it stands while the engine reads its rows. */
interface LoadCall extends LoadOptions {
  readonly onProgress?: ((progress: LoadProgress) => void) | undefined;
}

/** What a load of Arrow bytes reports. */
interface Loaded {
  readonly dataset: string;
  /** The rows the table holds. */
  readonly rows: number;
}

/** Where a load stands while the engine reads its rows. */
interface LoadProgress {
  /** The rows read so far. */
  readonly rows: number;
  /** The rows the load brings: counted from the stream's headers when its bytes came whole, estimated from the
   * response's `Content-Length` while they stream, or null when neither is known. */
  readonly expectedRows: number | null;
  /** Whether `expectedRows` is an estimate. */
  readonly estimated: boolean;
  /** Whether the rows read so far show in the dataset's views: a first load's do, as they arrive, while a reload's views
   * keep the rows before it until it has all arrived and applies whole. */
  readonly shown: boolean;
}

/**
 * The reason every view and request is given after the engine traps: a panic, which the worker reports as what it
 * said and where, is a fault in the engine; a trap without one, such as `RuntimeError: unreachable`, most likely ran
 * out of memory, since an allocation that fails aborts without a panic.
 */
function trapReason(trap: string): string {
  if (trap.startsWith("panicked")) {
    return `The engine in this page stopped after an internal error (${trap}). It has started again without its tables: load the data again, and report the error with the steps that led to it.`;
  }
  return `The engine in this page stopped after a fatal error (${trap}), most likely because it ran out of memory. It has started again without its tables: load the data again.`;
}

/** The refusal of bytes past the byte limit, {@link maxArrowBytes} unless lifted, which never leave the page. */
function tooManyBytes(dataset: string, bytes: number, limit = maxArrowBytes): Error {
  return new Error(
    `${dataset} is ${String(bytes)} bytes of Arrow, more than the ${String(limit)} a table in the browser holds; have its API filter or aggregate the data to fit.`,
  );
}

/** The refusal of a response whose body passed the byte limit as it streamed, without saying its length first. */
function streamedTooManyBytes(dataset: string, limit = maxArrowBytes): Error {
  return new Error(
    `${dataset} is more than the ${String(limit)} bytes of Arrow a table in the browser holds; have its API filter or aggregate the data to fit.`,
  );
}

export {
  exportTypes,
  liftedLimitsKey,
  loadLimits,
  maxArrowBytes,
  maxRows,
  maxXlsxCells,
  streamedTooManyBytes,
  tooManyBytes,
  trapReason,
};
export type { LoadCall, LoadLimits, LoadOptions, LoadProgress, Loaded };
