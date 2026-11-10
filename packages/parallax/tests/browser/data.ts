/* Arrow tables for the browser tests, made in the page as an app's small-data path would, and the workers that hold
 * the engine. */

import { Float64, Table, Utf8, makeVector, tableToIPC, vectorFromArray } from "apache-arrow";

import type { LayoutInput } from "#layout/layout.ts";

// Six positions over two funds and two desks.
import positions from "./positions.json" with { type: "json" };

/** The positions' Arrow IPC stream, text as plain UTF-8, as an API sends it. */
function positionsBytes(): ArrayBuffer {
  const table = new Table({
    desk: vectorFromArray(positions.desk, new Utf8()),
    fund: vectorFromArray(positions.fund, new Utf8()),
    market_value: vectorFromArray(positions.market_value, new Float64()),
  });
  return new Uint8Array(tableToIPC(table, "stream")).buffer;
}

const hugeRows = 150_000;
const hugeColumns = 20;

/** 150,000 rows of 20 doubles, 24 MB of Arrow: within the browser's limits, but past a capped engine's memory. */
function hugeBytes(): ArrayBuffer {
  const columns = Object.fromEntries(
    Array.from({ length: hugeColumns }, (_entry, index) => [
      `c${String(index)}`,
      makeVector(Float64Array.from({ length: hugeRows }, (_value, row) => row + index)),
    ]),
  );
  return new Uint8Array(tableToIPC(new Table(columns), "stream")).buffer;
}

/** `count` rows of one column of doubles, `value`, numbered from 0. */
function countedBytes(count: number): ArrayBuffer {
  const value = makeVector(Float64Array.from({ length: count }, (_value, row) => row));
  return new Uint8Array(tableToIPC(new Table({ value }), "stream")).buffer;
}

/** Starts the engine's real worker, from the package's source. */
function startWorker(): Worker {
  return new Worker(new URL("../../src/worker.ts", import.meta.url), {
    name: "parallax",
    type: "module",
  });
}

/** Starts the real worker with its engine's memory capped at 32 MB, so a 24 MB load runs it out of memory. */
function startCappedWorker(): Worker {
  return new Worker(new URL("capped-worker.ts", import.meta.url), {
    name: "parallax",
    type: "module",
  });
}

/** The pivot of the positions' market value by fund. */
const byFund = {
  group_by: ["fund"],
  measures: [{ aggregate: "sum", column: "market_value" }],
} satisfies LayoutInput;

export { byFund, countedBytes, hugeBytes, positionsBytes, startCappedWorker, startWorker };
