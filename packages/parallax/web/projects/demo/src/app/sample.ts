import { tableFromArrays, tableToIPC } from "apache-arrow";

/**
 * The bytes an app's API would send for a small table of orders: an Arrow IPC stream whose schema metadata says when
 * the source was read and how many NaNs the API turned blank before sending. Three notionals are still NaN, which the
 * engine turns blank and counts with the API's.
 */
export function sampleOrders(now: number): ArrayBuffer {
  const rows = 2_000;
  const desks = ["Rates", "Credit", "Equities", "FX"];
  const table = tableFromArrays({
    order_id: Int32Array.from({ length: rows }, (_, i) => i + 1),
    desk: Array.from({ length: rows }, (_, i) => desks[i % desks.length] ?? ""),
    notional: Float64Array.from({ length: rows }, (_, i) => (i % 700 === 3 ? Number.NaN : ((i * 7_919) % 100_000) * 1.25))
  });
  table.schema.metadata.set("parallax.load", JSON.stringify({ source_as_of_micros: Math.round((now - 20 * 60_000) * 1000), nans_to_null: [["notional", 2]] }));
  return tableToIPC(table, "stream").slice().buffer;
}
