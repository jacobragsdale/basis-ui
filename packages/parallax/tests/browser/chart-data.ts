/* Data for the chart's browser tests: a year of one bond's daily prices as an Arrow table, made in the page, and the
 * rows of small charts as an app holds them. */

import { DateDay, Float64, Table, tableToIPC, vectorFromArray } from "apache-arrow";

import type { ChartRow } from "#chart/small-data.ts";

const days = 250;
const millisPerDay = 86_400_000;
// 2025-01-02.
const start = 1_735_776_000_000;
/** The wave's period in days over 2π, and its height in points. */
const waveDays = 20;
const wavePoints = 3;

/** The price on day `day`: a slow wave around par, drifting up. */
function price(day: number): number {
  return 100 + Math.sin(day / waveDays) * wavePoints + day / 100;
}

/** A year of daily prices, open, high, low and close, as an API sends them. */
function pricesBytes(): ArrayBuffer {
  const indices = Array.from({ length: days }, (_entry, day) => day);
  const closes = indices.map((day) => price(day));
  const table = new Table({
    close: vectorFromArray(closes, new Float64()),
    date: vectorFromArray(
      indices.map((day) => new Date(start + day * millisPerDay)),
      new DateDay(),
    ),
    high: vectorFromArray(
      closes.map((close) => close + 1),
      new Float64(),
    ),
    low: vectorFromArray(
      closes.map((close) => close - 1),
      new Float64(),
    ),
    open: vectorFromArray(
      indices.map((day) => price(day - 1)),
      new Float64(),
    ),
  });
  return new Uint8Array(tableToIPC(table, "stream")).buffer;
}

/** Exposure by sector, in an order that is not the sectors' alphabetical one. */
const exposures: readonly ChartRow[] = [
  { exposure: 3.5, sector: "Rates" },
  { exposure: 5.25, sector: "Credit" },
  { exposure: 1.75, sector: "Agency" },
];

/** Three bonds, as a relative-value scatter draws them: spread against duration, sized by DV01, with the API's fitted
 * spread at each bond's duration. */
const bonds: readonly ChartRow[] = [
  { cusip: "ATL000A02", duration: 2, dv01: 400, fit: 72, issuer: "Atlas Corp", spread: 80 },
  { cusip: "BEA001A04", duration: 5, dv01: 4000, fit: 90, issuer: "Beacon Corp", spread: 90 },
  { cusip: "COB002A08", duration: 8, dv01: 1200, fit: 110, issuer: "Cobalt Corp", spread: 130 },
];

/** Two desks' exposure by sector, for a chart of two series. */
const deskExposures: readonly ChartRow[] = [
  { desk: "Atlas", exposure: 3.5, sector: "Rates" },
  { desk: "Boreal", exposure: 2, sector: "Rates" },
  { desk: "Atlas", exposure: 5.25, sector: "Credit" },
  { desk: "Boreal", exposure: 4, sector: "Credit" },
];

/** A week of a yield, by date, as text dates. */
const yields: readonly ChartRow[] = [
  { date: "2026-11-02", yield: 4.1 },
  { date: "2026-11-03", yield: 4.15 },
  { date: "2026-11-04", yield: 4.05 },
  { date: "2026-11-05", yield: 4.2 },
  { date: "2026-11-06", yield: 4.25 },
];

export { bonds, deskExposures, exposures, pricesBytes, yields };
