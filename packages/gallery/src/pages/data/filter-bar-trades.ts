/* The filter bar's example data: trades, their filters by search parameter, how each filter reads a trade, and a router
 * of one page in memory, as a test's is, opened with the filters a test or an example asks for. */

import { defineFilters, filterSearchSchema, parSuffixes } from "@basis/ui";
import type { FilterFields, FilterValues } from "@basis/ui";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  defaultStringifySearch,
} from "@tanstack/react-router";
import type { ReactElement } from "react";

interface Trade {
  readonly id: string;
  readonly issuer: string;
  readonly book: "rates" | "credit";
  readonly desk: "UST" | "Agency" | "IG";
  /** The day it settles, as ISO 8601. */
  readonly settles: string;
  /** Par in dollars. */
  readonly par: number;
}

const trades: readonly Trade[] = [
  {
    book: "rates",
    desk: "UST",
    id: "t1",
    issuer: "US Treasury",
    par: 25_000_000,
    settles: "2026-11-02",
  },
  {
    book: "rates",
    desk: "UST",
    id: "t2",
    issuer: "US Treasury",
    par: 10_000_000,
    settles: "2026-11-04",
  },
  {
    book: "rates",
    desk: "Agency",
    id: "t3",
    issuer: "Fannie Mae",
    par: 5_000_000,
    settles: "2026-11-05",
  },
  {
    book: "rates",
    desk: "Agency",
    id: "t4",
    issuer: "Freddie Mac",
    par: 2_000_000,
    settles: "2026-11-09",
  },
  {
    book: "credit",
    desk: "IG",
    id: "t5",
    issuer: "Apple Inc",
    par: 3_000_000,
    settles: "2026-11-06",
  },
  {
    book: "credit",
    desk: "IG",
    id: "t6",
    issuer: "Microsoft",
    par: 7_500_000,
    settles: "2026-11-10",
  },
];

/** The trades' filters, by their search parameters. */
const tradeFilters = defineFilters({
  issuer: { kind: "text", label: "Issuer", placeholder: "Search issuers" },
  book: {
    kind: "choice",
    label: "Book",
    options: [
      { label: "Rates", value: "rates" },
      { label: "Credit", value: "credit" },
    ],
  },
  desks: { kind: "multiChoice", label: "Desks", options: ["UST", "Agency", "IG"] },
  settles: { kind: "dateRange", label: "Settles" },
  par: { kind: "numberRange", label: "Par", suffixes: parSuffixes },
});

const fields: FilterFields<Trade, typeof tradeFilters> = {
  book: (trade) => trade.book,
  desks: (trade) => trade.desk,
  issuer: (trade) => trade.issuer,
  par: (trade) => trade.par,
  settles: (trade) => trade.settles,
};

/** A router of the trades page alone, in memory, opened with `search` as its search parameters. */
function tradesRouter(
  page: () => ReactElement,
  search: FilterValues<typeof tradeFilters> = {},
): ReturnType<typeof createRouter> {
  const rootRoute = createRootRoute();
  const routeTree = rootRoute.addChildren([
    createRoute({
      component: page,
      getParentRoute: () => rootRoute,
      path: "/",
      validateSearch: filterSearchSchema(tradeFilters),
    }),
  ]);
  return createRouter({
    history: createMemoryHistory({ initialEntries: [`/${defaultStringifySearch(search)}`] }),
    routeTree,
  });
}

/** The trades' active filters. */
type TradeFilterValues = FilterValues<typeof tradeFilters>;

export { fields, tradeFilters, trades, tradesRouter };
export type { Trade, TradeFilterValues };
