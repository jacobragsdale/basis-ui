/* The views the pages of one view open, as the Angular demo opened them. */

import type { LayoutInput } from "@basis/parallax";

import type { DemoDataset } from "#api/datasets.ts";

type OwnView = LayoutInput & { readonly dataset: DemoDataset };

/** The reference pivot: fund, strategy, sector and ticker by asset class, three levels open. */
const positionsPivot: OwnView = {
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

const allTrades: OwnView = { dataset: "trades" };

/** The trades by gross amount, largest first, the id and ticker pinned, and counted. Their quantities are of different
 * tickers bought and sold, which do not add. */
const largestTrades: OwnView = {
  dataset: "trades",
  pinned: ["trade_id", "ticker"],
  sort: [{ column: "gross_amount_local", descending: true }],
  totals: [{ aggregate: "count", column: "trade_id" }],
};

/** The prices, newest first, then by ticker. */
const dailyPrices: OwnView = {
  dataset: "prices",
  sort: [{ column: "date", descending: true }, { column: "ticker" }],
};

export { allTrades, dailyPrices, largestTrades, positionsPivot };
export type { OwnView };
