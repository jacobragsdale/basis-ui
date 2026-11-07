/* The breakdowns page: big pies, donuts and bars over 150,000 positions and 150,000 trades, as in the Angular demo
 * (web/projects/demo/src/app/breakdowns.component.ts). Gross notional rather than market value, because short
 * positions' market values are negative, which a pie refuses. */

import type { ReactNode } from "react";

import { Chart, useDataset } from "#index.ts";
import type { Dataset, LayoutInput } from "#index.ts";

import { datasetBytes, datasets } from "./api/datasets.ts";

/** A big chart on the page, over one dataset. */
interface Breakdown {
  readonly id: string;
  readonly title: string;
  readonly dataset: "positions" | "trades";
  readonly layout: LayoutInput;
}

const largestFirst = { by: { measure: 0 }, descending: true } as const;
/** The funds a pie shows before the rest, and the tickers a bar chart shows. */
const eightFunds = 8;
const tenTickers = 10;
const billions = { notional_usd: { abbreviate: "billions" } } as const;

/** A measure and its share of the whole, which a pie's legend, slices and tooltip read; a count when `column` is null. */
function withShare(column: string | null): LayoutInput["measures"] {
  const aggregate = column === null ? "count_all" : "sum";
  return [
    { aggregate, column },
    { aggregate, column, show_as: "percent_of_grand_total" },
  ];
}

/** The `top` groups by the first measure, and the rest in one "Other" group if `other`. */
function topGroups(top: number, other: boolean): LayoutInput["top_n"] {
  // oxlint-disable-next-line eslint/id-length -- `n` is the layout's JSON field, as parallax-protocol's Rust names it.
  return { measure: 0, n: top, other };
}

const breakdowns: readonly Breakdown[] = [
  {
    dataset: "positions",
    id: "notional-by-region",
    layout: {
      chart: { kind: "pie" },
      formats: billions,
      group_by: ["region"],
      group_sort: largestFirst,
      measures: withShare("notional_usd"),
    },
    title: "Gross notional by region",
  },
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
  {
    dataset: "positions",
    id: "notional-by-currency",
    layout: {
      chart: { kind: "pie" },
      formats: billions,
      group_by: ["currency"],
      group_sort: largestFirst,
      measures: withShare("notional_usd"),
    },
    title: "Gross notional by currency: the seven largest and the rest",
  },
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
  {
    dataset: "positions",
    id: "notional-by-fund-and-class",
    layout: {
      chart: { kind: "bar", stacked: true },
      formats: billions,
      group_by: ["fund"],
      measures: [{ aggregate: "sum", column: "notional_usd" }],
      split_by: ["asset_class"],
    },
    title: "Gross notional by fund and asset class",
  },
  {
    dataset: "positions",
    id: "long-short-by-region",
    layout: {
      chart: { kind: "bar" },
      formats: billions,
      group_by: ["region"],
      measures: [{ aggregate: "sum", column: "notional_usd" }],
      split_by: ["long_short"],
    },
    title: "Long against short by region",
  },
  {
    dataset: "trades",
    id: "trades-by-status",
    layout: {
      chart: { kind: "pie" },
      group_by: ["status"],
      group_sort: largestFirst,
      measures: withShare(null),
    },
    title: "Trades by status",
  },
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
  {
    dataset: "trades",
    id: "trades-by-order-type",
    layout: {
      chart: { donut: false, kind: "pie" },
      group_by: ["order_type"],
      group_sort: largestFirst,
      measures: withShare(null),
    },
    title: "Trades by order type",
  },
];

const positions = async (): Promise<ArrayBuffer> => datasetBytes("positions");
const trades = async (): Promise<ArrayBuffer> => datasetBytes("trades");

/** One dataset's breakdowns, under its heading. */
function Part({
  title,
  data,
  of,
}: {
  readonly title: string;
  readonly data: Dataset;
  readonly of: Breakdown["dataset"];
}): ReactNode {
  return (
    <div data-dataset={of} className="flex flex-col gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-3">
        {breakdowns
          .filter((breakdown) => breakdown.dataset === of)
          .map((breakdown) => (
            <section
              key={breakdown.id}
              data-breakdown={breakdown.id}
              className="flex h-110 min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm"
            >
              <h3 className="px-3 pt-2.5 text-sm font-semibold">{breakdown.title}</h3>
              <Chart className="min-h-0 flex-1" dataset={data} layout={breakdown.layout} />
            </section>
          ))}
      </div>
    </div>
  );
}

/** The page of big charts. */
function BreakdownsPage(): ReactNode {
  const positionData = useDataset("positions", positions, { primaryKey: datasets.positions });
  const tradeData = useDataset("trades", trades, { primaryKey: datasets.trades });
  return (
    <main className="flex flex-col gap-5 px-3 pt-1 pb-4">
      <Part title="150,000 positions, held in this page" data={positionData} of="positions" />
      <Part title="150,000 trades, held in this page" data={tradeData} of="trades" />
    </main>
  );
}

export { BreakdownsPage };
