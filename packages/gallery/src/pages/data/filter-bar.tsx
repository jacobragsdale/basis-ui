/* FilterBar on the data page: a page of trades filtered by issuer, book, desks, the days they settle and their par,
 * each in the address of a router of its own, with its rows in a table under the bar. One example is at rest and one
 * opens filtered, so its chips show. The router is in memory, as a test's is, so the gallery's own address is left
 * alone. */

import {
  FilterBar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  filterRows,
  numberText,
  useFilters,
} from "@basis/ui";
import { RouterProvider } from "@tanstack/react-router";
import { createContext, use } from "react";
import type { ReactElement } from "react";

import { Section } from "#pages/section.tsx";
import { fields, tradeFilters, trades, tradesRouter } from "./filter-bar-trades.ts";
import type { Trade } from "./filter-bar-trades.ts";

/** The trades the filters keep. */
function TradesTable({ rows }: { readonly rows: readonly Trade[] }): ReactElement {
  return (
    <Table aria-label="Trades">
      <TableHeader>
        <TableRow>
          <TableHead>Issuer</TableHead>
          <TableHead>Desk</TableHead>
          <TableHead>Settles</TableHead>
          <TableHead variant="numeric">Par</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((trade) => (
          <TableRow key={trade.id}>
            <TableCell>{trade.issuer}</TableCell>
            <TableCell>{trade.desk}</TableCell>
            <TableCell>{trade.settles}</TableCell>
            <TableCell variant="numeric">{numberText(trade.par, { decimals: 0 })}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** The name of the bar's landmark, which tells the page's two examples apart. */
const BarLabel = createContext("Trade filters");

/** The page: the bar over the trades it keeps. */
function TradesPage(): ReactElement {
  const label = use(BarLabel);
  const filters = useFilters(tradeFilters);
  const rows = filterRows(trades, { fields, filters: tradeFilters, values: filters.values });
  return (
    <div className="flex flex-col gap-4">
      <FilterBar filters={filters} label={label} />
      <TradesTable rows={rows} />
    </div>
  );
}

const atRest = tradesRouter(TradesPage);

const filtered = tradesRouter(TradesPage, {
  book: "rates",
  desks: ["UST", "Agency"],
  issuer: "tre",
  par: { min: 5_000_000 },
  settles: { end: "2026-11-06", start: "2026-11-02" },
});

function FilterBarSection(): ReactElement {
  return (
    <Section
      title="FilterBar"
      description="A page's filters over its rows, kept in its address: text, a choice, several choices, a range of days and a range of numbers, with a chip for each active filter that clears it, and Clear all. Back and Forward step through them; typing adds one history entry, not one a key."
    >
      <div className="flex flex-col gap-8">
        <BarLabel value="Trade filters, at rest">
          <RouterProvider router={atRest} />
        </BarLabel>
        <BarLabel value="Trade filters, filtered">
          <RouterProvider router={filtered} />
        </BarLabel>
      </div>
    </Section>
  );
}

export { FilterBarSection, TradesPage };
