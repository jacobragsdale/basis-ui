/* The harness's datasets: the Angular demo's, which `tests/e2e/data.sh` generates beside the page, fetched as an app
 * fetches its API's Arrow. */

import type { DatasetSource, LayoutInput } from "#index.ts";

/** The datasets the harness serves, by name, with their primary keys. */
const datasets = {
  blotter: "trade_id",
  book: "position_id",
  positions: "position_id",
  trades: "trade_id",
} as const;

type DatasetName = keyof typeof datasets;

/** Fetches a generated dataset's Arrow stream. */
async function fetchArrow(name: DatasetName): Promise<ArrayBuffer> {
  const url = `data/${name}.arrows`;
  // oxlint-disable-next-line eslint/no-restricted-globals -- the harness reads files data.sh wrote beside it; it calls no API, so there is no generated client to go through.
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} answered ${String(response.status)}; run tests/e2e/data.sh`);
  }
  return response.arrayBuffer();
}

/** Each dataset's source, one function each, so a dataset loads once. */
const sources: Readonly<Record<DatasetName, DatasetSource>> = {
  blotter: async () => fetchArrow("blotter"),
  book: async () => fetchArrow("book"),
  positions: async () => fetchArrow("positions"),
  trades: async () => fetchArrow("trades"),
};

/** The demo's reference pivot of the positions. */
const referencePivot: LayoutInput = {
  dataset: "positions",
  expand_depth: 3,
  group_by: ["fund", "strategy", "sector", "ticker"],
  measures: [
    { aggregate: "sum", column: "market_value_usd" },
    { aggregate: "sum", column: "daily_pnl_usd" },
    { aggregate: "count_all" },
  ],
  split_by: ["asset_class"],
};

/** The book: positions with their ticker pinned, and market value and P&L totalled, in columns near the left. */
const book: LayoutInput = {
  columns: [
    "ticker",
    "fund",
    "asset_class",
    "market_value_usd",
    "daily_pnl_usd",
    "long_short",
    "sector",
    "region",
    "quantity",
    "currency",
    "position_id",
  ],
  dataset: "book",
  formats: {
    daily_pnl_usd: { decimals: 0, negative: "parentheses" },
    market_value_usd: { decimals: 0 },
  },
  pinned: ["ticker"],
  totals: [
    { aggregate: "sum", column: "market_value_usd" },
    { aggregate: "sum", column: "daily_pnl_usd" },
  ],
};

/** The blotter: trades with their ticker pinned, counted and their quantities totalled. */
const blotter: LayoutInput = {
  columns: [
    "ticker",
    "trade_id",
    "trade_date",
    "fund",
    "side",
    "quantity",
    "price_local",
    "currency",
    "gross_amount_local",
    "broker",
    "status",
  ],
  dataset: "blotter",
  pinned: ["ticker"],
  totals: [
    { aggregate: "count", column: "trade_id" },
    { aggregate: "sum", column: "quantity" },
  ],
};

export { blotter, book, datasets, referencePivot, sources };
export type { DatasetName };
