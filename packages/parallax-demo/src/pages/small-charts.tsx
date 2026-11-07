/* Charts of a few rows the page already holds, as a summary card or a report would have them, through `<Chart>`'s
 * small-data form: each passes its rows, which the chart makes into a table of its own in the engine, in their order.
 * The rows here stand in for what an app's query would hold. */

import { Chart } from "@basis/parallax";
import type { ChartRow, RowsChartProps } from "@basis/parallax";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@basis/ui";
import type { ReactNode } from "react";

import { Page } from "#shell/page.tsx";
import { pages } from "#shell/pages.ts";

const exposures: readonly ChartRow[] = [
  { exposure: 182.4, sector: "Financials" },
  { exposure: 141.9, sector: "Technology" },
  { exposure: 96.2, sector: "Health care" },
  { exposure: 74.8, sector: "Industrials" },
  { exposure: 51.3, sector: "Energy" },
  { exposure: 33.7, sector: "Utilities" },
];

const deskPnl: readonly ChartRow[] = [
  { desk: "Rates", pnl: 412_000 },
  { desk: "Credit", pnl: -138_500 },
  { desk: "Municipals", pnl: 96_250 },
  { desk: "Mortgages", pnl: 57_800 },
  { desk: "Emerging markets", pnl: -21_400 },
];

const allocation: readonly ChartRow[] = [
  { asset_class: "Government", weight: 38 },
  { asset_class: "Corporate", weight: 27 },
  { asset_class: "Securitized", weight: 19 },
  { asset_class: "Municipal", weight: 9 },
  { asset_class: "Cash", weight: 7 },
];

const nav: readonly ChartRow[] = [
  { day: "2026-01-30", nav: 100 },
  { day: "2026-02-27", nav: 101.2 },
  { day: "2026-03-31", nav: 100.4 },
  { day: "2026-04-30", nav: 102.9 },
  { day: "2026-05-29", nav: 103.6 },
  { day: "2026-06-30", nav: 102.8 },
  { day: "2026-07-31", nav: 104.7 },
  { day: "2026-08-31", nav: 105.1 },
  { day: "2026-09-30", nav: 106.3 },
  { day: "2026-10-30", nav: 105.9 },
];

const hedging: readonly ChartRow[] = [
  { currency: "EUR", hedge: "Hedged", notional: 64 },
  { currency: "EUR", hedge: "Unhedged", notional: 21 },
  { currency: "GBP", hedge: "Hedged", notional: 38 },
  { currency: "GBP", hedge: "Unhedged", notional: 12 },
  { currency: "JPY", hedge: "Hedged", notional: 29 },
  { currency: "JPY", hedge: "Unhedged", notional: 17 },
  { currency: "CAD", hedge: "Hedged", notional: 14 },
  { currency: "CAD", hedge: "Unhedged", notional: 4 },
];

/** A small chart: what it shows, what the card says of it, and the chart itself. */
interface SmallChartCard {
  readonly id: string;
  readonly title: string;
  readonly about: string;
  readonly chart: RowsChartProps;
}

const smallCharts: readonly SmallChartCard[] = [
  {
    about: "Six rows, one bar each, in the rows' order.",
    chart: { kind: "bar", rows: exposures, x: "sector", y: "exposure" },
    id: "exposure",
    title: "Exposure by sector, $ millions",
  },
  {
    about: "Bars across, losses in parentheses.",
    chart: {
      formats: { pnl: { abbreviate: "thousands", negative: "parentheses" } },
      kind: "bar",
      rows: deskPnl,
      settings: { horizontal: true },
      x: "desk",
      y: "pnl",
    },
    id: "desk-pnl",
    title: "P&L by desk today",
  },
  {
    about: "A donut of each class's weight.",
    chart: { kind: "pie", rows: allocation, x: "asset_class", y: "weight" },
    id: "allocation",
    title: "Allocation by asset class, %",
  },
  {
    about: "Month-end dates as text, read as days.",
    chart: { kind: "line", rows: nav, x: "day", y: "nav" },
    id: "nav",
    title: "Net asset value, rebased to 100",
  },
  {
    about: "A series column splits the bars, stacked.",
    chart: {
      kind: "bar",
      rows: hedging,
      series: "hedge",
      settings: { stacked: true },
      x: "currency",
      y: "notional",
    },
    id: "hedging",
    title: "Currency exposure, hedged and not, $ millions",
  },
];

function SmallChartsPage(): ReactNode {
  return (
    <Page page={pages.smallCharts} scrolls>
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {smallCharts.map((card) => (
          <Card key={card.id} size="sm" data-small-chart={card.id} className="h-72">
            <CardHeader>
              <CardTitle>{card.title}</CardTitle>
              <CardDescription>{card.about}</CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col">
              <Chart {...card.chart} name={card.id} status={false} className="min-h-0 flex-1" />
            </CardContent>
          </Card>
        ))}
      </div>
    </Page>
  );
}

export { SmallChartsPage };
