/* The blotter's filters, kept in its address: its route validates them, and its page shows them in a FilterBar and
 * turns them into the grid's layout filters. */

import type { LayoutFor } from "@basis/parallax";
import { defineFilters } from "@basis/ui";
import type { FilterValues } from "@basis/ui";

import type { Trade } from "./rows.ts";

const tradeFilters = defineFilters({
  ticker: { kind: "text", label: "Ticker", placeholder: "Part of a ticker" },
  asset_class: {
    kind: "multiChoice",
    label: "Asset class",
    options: ["Bond", "Equity", "Future", "Option"],
  },
  side: { kind: "choice", label: "Side", options: ["Buy", "Sell", "Short", "Cover"] },
  status: {
    kind: "multiChoice",
    label: "Status",
    options: ["Filled", "PartiallyFilled", "Cancelled"],
  },
  trade_date: { kind: "dateRange", label: "Traded" },
  net_amount_local: { kind: "numberRange", label: "Net amount" },
});

type TradeFilterValues = FilterValues<typeof tradeFilters>;

/** A filter of one of the trades' columns, as the grid's typed layout takes it. */
type TradeFilter = NonNullable<LayoutFor<Trade>["filters"]>[number];
type Operand = string | number;

/** The filter `column op value`, or none when `value` is not set. */
function test(
  column: keyof Trade,
  op: TradeFilter["op"],
  value: Operand | undefined,
): TradeFilter[] {
  return value === undefined ? [] : [{ column, op, value }];
}

/** A filter of the rows whose `column` holds one of `options`, when any is chosen. */
function among(column: keyof Trade, options: readonly string[] | undefined): TradeFilter[] {
  return options === undefined || options.length === 0
    ? []
    : [{ column, op: "in", values: [...options] }];
}

/** Each active filter as the grid's filters of its column. */
function layoutFilters(values: TradeFilterValues): TradeFilter[] {
  const traded = values.trade_date;
  const net = values.net_amount_local;
  return [
    ...test("ticker", "contains", values.ticker),
    ...among("asset_class", values.asset_class),
    ...test("side", "eq", values.side),
    ...among("status", values.status),
    ...test("trade_date", "ge", traded?.start),
    ...test("trade_date", "le", traded?.end),
    ...test("net_amount_local", "ge", net?.min),
    ...test("net_amount_local", "le", net?.max),
  ];
}

export { layoutFilters, tradeFilters };
export type { TradeFilterValues };
