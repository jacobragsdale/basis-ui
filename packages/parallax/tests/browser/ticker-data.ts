/* Two tickers' daily closes and opens for the chart's browser tests, as an API sends them, with an event on one day
 * of each, and the plot's size the engine reduces them to. */

import { DateDay, Float64, Table, Utf8, tableToIPC, vectorFromArray } from "apache-arrow";

const days = 30;
const millisPerDay = 86_400_000;
// 2026-01-05.
const start = 1_767_571_200_000;
/** Each ticker's close on its first day; it rises a point a day, and opens half a point under its close. */
const tickers = [
  { base: 100, name: "ATLS" },
  { base: 300, name: "BCN" },
] as const;
const openBelow = 0.5;
/** The day each ticker has an event. */
const eventDay = 10;
/** The plot's size the frames are reduced to. */
const plot = { height: 300, width: 400 } as const;

/** Two tickers' closes and opens by day, each ticker's rows in day order. */
function tickerBytes(): ArrayBuffer {
  const rows = tickers.flatMap(({ base, name }) =>
    Array.from({ length: days }, (_entry, day) => ({ base, day, name })),
  );
  const table = new Table({
    close: vectorFromArray(
      rows.map(({ base, day }) => base + day),
      new Float64(),
    ),
    date: vectorFromArray(
      rows.map(({ day }) => new Date(start + day * millisPerDay)),
      new DateDay(),
    ),
    event: vectorFromArray(
      rows.map(({ day, name }) => (day === eventDay ? `${name} dividend` : null)),
      new Utf8(),
    ),
    open: vectorFromArray(
      rows.map(({ base, day }) => base + day - openBelow),
      new Float64(),
    ),
    ticker: vectorFromArray(
      rows.map(({ name }) => name),
      new Utf8(),
    ),
  });
  return new Uint8Array(tableToIPC(table, "stream")).buffer;
}

export { plot, tickerBytes };
