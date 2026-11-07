/* The data the "Data from the app" page makes itself, as its own API would send it: a small table of orders. */

import { tableFromArrays, tableToIPC } from "apache-arrow";

const rows = 2000;
const desks = ["Rates", "Credit", "Equities", "FX"] as const;
/** Every 700th notional, from the fourth, is NaN, which the engine turns blank and counts with the API's. */
const nanEvery = 700;
const nanAt = 3;
/** The notionals: a deterministic spread of values, a quarter apart. */
const spread = 7919;
const notionalRange = 100_000;
const notionalStep = 1.25;
/** How long before `now` the API read its source, and how many NaNs it blanked itself. */
const readMinutesAgo = 20;
const blankedByTheApi = 2;
const microsPerMilli = 1000;
const millisPerMinute = 60_000;

/** The name the page loads the sample under. */
const sampleName = "orders";

/**
 * The bytes an app's API would send for a small table of orders: an Arrow IPC stream whose schema metadata says when
 * the source was read and how many NaNs the API turned blank before sending. Three notionals are still NaN, which the
 * engine turns blank and counts with the API's.
 */
function sampleOrders(now: number): ArrayBuffer {
  const table = tableFromArrays({
    order_id: Int32Array.from({ length: rows }, (_row, index) => index + 1),
    desk: Array.from({ length: rows }, (_row, index) => desks[index % desks.length] ?? ""),
    notional: Float64Array.from({ length: rows }, (_row, index) =>
      index % nanEvery === nanAt ? Number.NaN : ((index * spread) % notionalRange) * notionalStep,
    ),
  });
  const readAt = (now - readMinutesAgo * millisPerMinute) * microsPerMilli;
  table.schema.metadata.set(
    "parallax.load",
    JSON.stringify({
      nans_to_null: [["notional", blankedByTheApi]],
      source_as_of_micros: Math.round(readAt),
    }),
  );
  // A copy of its own, so the buffer holds the stream alone.
  return Uint8Array.from(tableToIPC(table, "stream")).buffer;
}

export { sampleName, sampleOrders };
