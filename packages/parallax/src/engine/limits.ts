/* What the engine in the browser holds, from spike 0.3, and how a load is stamped. Each limit is checked before a load
 * costs any memory, and its error names the limit, the size and what to do. */

import type { ExportFormat } from "./messages.ts";

/**
 * The most bytes of Arrow one table the app loads may have: spike 0.3's limit for a table held in the browser,
 * checked before the bytes leave the page. With {@link maxRows} it is the documented limit; a narrow table may hold
 * more rows within it, and a wide one fewer.
 */
const maxArrowBytes = 70_000_000;

/**
 * The most rows one table the app loads may have: spike 0.3's limit, at which the reference pivot meets its 500 ms
 * budget on a slow desktop. The engine counts them from the stream's batch headers before decoding any data.
 */
const maxRows = 150_000;

/**
 * The most cells an Excel export in the browser writes, the header and group column included. The browser holds a
 * sheet in memory at about 190 bytes a cell, which WebAssembly never returns, so a larger view is refused with a reason
 * that says to export CSV, which streams.
 */
const maxXlsxCells = 1_000_000;

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

/** What a load of Arrow bytes reports. */
interface Loaded {
  readonly dataset: string;
  /** The rows the table holds. */
  readonly rows: number;
}

/** The reason every view and request is given after the engine traps. */
function trapReason(trap: string): string {
  return `The engine in this page stopped after a fatal error (${trap}), most likely because it ran out of memory. It has started again without its tables: load the data again.`;
}

/** The refusal of bytes past {@link maxArrowBytes}, which never leave the page. */
function tooManyBytes(dataset: string, bytes: number): Error {
  return new Error(
    `${dataset} is ${String(bytes)} bytes of Arrow, more than the ${String(maxArrowBytes)} a table in the browser holds; have its API filter or aggregate the data to fit.`,
  );
}

export { exportTypes, maxArrowBytes, maxRows, maxXlsxCells, tooManyBytes, trapReason };
export type { LoadOptions, Loaded };
