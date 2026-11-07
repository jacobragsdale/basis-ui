/* The small tables' layouts, which the small tables' page and the dashboard share. */

import type { LayoutInput } from "@basis/parallax";

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

export { blotter, book };
