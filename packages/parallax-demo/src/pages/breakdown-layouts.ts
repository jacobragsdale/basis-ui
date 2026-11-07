/* The breakdowns page's charts: big pies, donuts and bars over 150,000 positions and 150,000 trades, both loaded into
 * the page. Gross notional rather than market value, because short positions' market values are negative, which a pie
 * refuses. A click on a slice or bar narrows the other charts of its dataset to that group, unless they group by the
 * same column. */

import type { ChartSelection, LayoutInput } from "@basis/parallax";

import { largestFirst, pickedFilter, withShare } from "./layouts.ts";

/** A big chart on the page, over one dataset. */
interface Breakdown {
  /** A name that stays when the title is reworded, such as for tests and screenshots. */
  readonly id: string;
  readonly title: string;
  readonly dataset: "positions" | "trades";
  /** The chart's own layout, before the page's filter; its first group column is what a click on it selects. */
  readonly layout: LayoutInput;
}

/** The funds a pie shows before the rest, and the tickers a bar chart shows. */
const eightFunds = 8;
const tenTickers = 10;
const billions = { notional_usd: { abbreviate: "billions" } } as const;

/** The `top` groups by the first measure, and the rest in one "Other" group if `other`. */
function topGroups(top: number, other: boolean): LayoutInput["top_n"] {
  // oxlint-disable-next-line eslint/id-length -- `n` is the layout's JSON field, as parallax-protocol's Rust names it.
  return { measure: 0, n: top, other };
}

/** A chart of gross notional by `column`, as a donut of each group's share. */
function notionalDonut(id: string, title: string, column: string): Breakdown {
  return {
    dataset: "positions",
    id,
    layout: {
      chart: { kind: "pie" },
      formats: billions,
      group_by: [column],
      group_sort: largestFirst,
      measures: withShare("notional_usd"),
    },
    title,
  };
}

/** How a bar chart of gross notional groups: by `column`, split by `split`, the splits stacked if `stacked`. */
interface Bars {
  readonly column: string;
  readonly split: string;
  readonly stacked: boolean;
}

/** A bar chart of gross notional, grouped as `bars` says. */
function notionalBars(id: string, title: string, { column, split, stacked }: Bars): Breakdown {
  return {
    dataset: "positions",
    id,
    layout: {
      chart: stacked ? { kind: "bar", stacked } : { kind: "bar" },
      formats: billions,
      group_by: [column],
      measures: [{ aggregate: "sum", column: "notional_usd" }],
      split_by: [split],
    },
    title,
  };
}

/** A pie of the trades counted by `column`, a donut unless `donut` is false. */
function tradesPie(
  id: string,
  title: string,
  { column, donut }: { readonly column: string; readonly donut: boolean },
): Breakdown {
  return {
    dataset: "trades",
    id,
    layout: {
      chart: { donut, kind: "pie" },
      group_by: [column],
      group_sort: largestFirst,
      measures: withShare(null),
    },
    title,
  };
}

const breakdowns: readonly Breakdown[] = [
  notionalDonut("notional-by-region", "Gross notional by region", "region"),
  {
    dataset: "positions",
    id: "positions-by-fund",
    layout: {
      chart: { donut: false, kind: "pie" },
      group_by: ["fund"],
      group_sort: largestFirst,
      measures: withShare(null),
      top_n: topGroups(eightFunds, true),
    },
    title: "Positions by fund",
  },
  notionalDonut(
    "notional-by-currency",
    "Gross notional by currency: the seven largest and the rest",
    "currency",
  ),
  {
    dataset: "positions",
    id: "pnl-by-strategy",
    layout: {
      chart: { kind: "bar" },
      formats: { daily_pnl_usd: { abbreviate: "millions", negative: "parentheses" } },
      group_by: ["strategy"],
      group_sort: largestFirst,
      measures: [{ aggregate: "sum", column: "daily_pnl_usd" }],
    },
    title: "Daily P&L by strategy",
  },
  {
    dataset: "positions",
    id: "largest-tickers",
    layout: {
      chart: { horizontal: true, kind: "bar" },
      formats: billions,
      group_by: ["ticker"],
      group_sort: largestFirst,
      measures: [{ aggregate: "sum", column: "notional_usd" }],
      top_n: topGroups(tenTickers, false),
    },
    title: "The ten largest tickers by gross notional",
  },
  notionalBars("notional-by-fund-and-class", "Gross notional by fund and asset class", {
    column: "fund",
    split: "asset_class",
    stacked: true,
  }),
  notionalBars("long-short-by-region", "Long against short by region", {
    column: "region",
    split: "long_short",
    stacked: false,
  }),
  tradesPie("trades-by-status", "Trades by status", { column: "status", donut: true }),
  {
    dataset: "trades",
    id: "trades-by-broker",
    layout: {
      chart: { horizontal: true, kind: "bar" },
      group_by: ["broker"],
      group_sort: largestFirst,
      measures: [{ aggregate: "count_all" }],
    },
    title: "Trades by broker",
  },
  tradesPie("trades-by-order-type", "Trades by order type", { column: "order_type", donut: false }),
];

/** The group a click picked, which narrows every other chart over the same dataset. */
interface Pick {
  readonly chart: string;
  readonly selection: ChartSelection;
}

/** A chart's layout narrowed to the picked group, unless it groups by the picked column itself, which keeps them all. */
function narrowed(breakdown: Breakdown, pick: Pick | null): LayoutInput {
  if (pick === null || breakdown.layout.group_by?.[0] === pick.selection.column) {
    return breakdown.layout;
  }
  return { ...breakdown.layout, filters: [pickedFilter(pick.selection)] };
}

export { breakdowns, narrowed };
export type { Breakdown, Pick };
