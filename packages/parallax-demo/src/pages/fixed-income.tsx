/* The fixed-income page: the relative-value scatter over a book of bonds, each bond a dot, with the bonds a click on it
 * narrows, and October's P&L explained by factor as a waterfall, with the factor a click on it picks by portfolio.
 * Roadmap step 2.8 adds its other views for the firm's desks here. */

import { Chart, Grid, Pivot } from "@basis/parallax";
import type { ChartSelection, LayoutInput } from "@basis/parallax";
import { Card, CardContent, CardHeader, CardTitle } from "@basis/ui";
import { useState } from "react";
import type { ReactNode } from "react";

import { useDemoDataset } from "#shell/datasets.ts";
import { Page } from "#shell/page.tsx";
import { pages } from "#shell/pages.ts";

import { pickedFilter } from "./layouts.ts";

/** Spreads arrive as fractions, the one unit rates have, and read in basis points to a tenth. */
const inBps = { bps: true, decimals: 1 } as const;

/** Each bond's spread against its duration, by sector, sized by DV01, over each sector's fitted curve. */
const richCheap: LayoutInput = {
  chart: {
    fit: "fitted_spread",
    id: "cusip",
    kind: "scatter",
    series: "sector",
    size: "dv01_usd",
    tooltip: ["issuer", "rating", "rich_cheap"],
    x: "duration",
    y: ["spread"],
  },
  dataset: "bonds",
  formats: {
    dv01_usd: { decimals: 0 },
    fitted_spread: inBps,
    rich_cheap: inBps,
    spread: inBps,
  },
};

/** The bonds, narrowed to the one clicked. */
function bondsLayout(selected: ChartSelection | null): LayoutInput {
  return {
    columns: [
      "cusip",
      "issuer",
      "sector",
      "rating",
      "duration",
      "spread",
      "fitted_spread",
      "rich_cheap",
      "dv01_usd",
    ],
    dataset: "bonds",
    filters: selected === null ? [] : [pickedFilter(selected)],
    formats: { fitted_spread: inBps, rich_cheap: inBps, spread: inBps },
    sort: [{ column: "rich_cheap", descending: true }],
  };
}

/** The factors in the order an explain lists them: income, then rates, spreads, currency and the rest. */
const factorOrder = [
  "Carry",
  "Roll-down",
  "Curve 2Y",
  "Curve 5Y",
  "Curve 10Y",
  "Curve 30Y",
  "Spread IG",
  "Spread HY",
  "FX",
  "Trading",
  "Residual",
];

/** Dollars, in thousands. */
const inThousands = { abbreviate: "thousands", decimals: 0 } as const;

/** The book's P&L over the month, explained by factor: each factor a step from the running total, ending on the total. */
const explain: LayoutInput = {
  chart: { kind: "waterfall" },
  dataset: "attribution",
  formats: { pnl_usd: inThousands },
  group_by: ["factor"],
  measures: [{ aggregate: "sum", column: "pnl_usd" }],
  orders: { factor: { values: factorOrder } },
};

/** The P&L by portfolio, of the factor clicked or of every factor. */
function byPortfolio(selected: ChartSelection | null): LayoutInput {
  return {
    dataset: "attribution",
    filters: selected === null ? [] : [pickedFilter(selected)],
    formats: { pnl_usd: inThousands },
    group_by: ["portfolio", "factor_group"],
    measures: [{ aggregate: "sum", column: "pnl_usd" }],
  };
}

/** The relative-value scatter and the bonds a click on it narrows. */
function RichCheap(): ReactNode {
  const bonds = useDemoDataset("bonds");
  const [selected, setSelected] = useState<ChartSelection | null>(null);
  return (
    <>
      <Card size="sm" data-card="rich-cheap" className="h-120">
        <CardHeader>
          <CardTitle>
            Spread against duration, by sector, sized by DV01, over each sector&apos;s fitted curve
          </CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          <Chart
            className="min-h-0 flex-1"
            dataset={bonds}
            layout={richCheap}
            onSelect={setSelected}
          />
        </CardContent>
      </Card>
      <section data-linked="rich-cheap" className="flex h-80 flex-col gap-1.5">
        <h2 className="text-sm font-semibold">
          {selected === null
            ? "Bonds, richest to their curve first, until one is clicked"
            : `Bond ${selected.label}`}
        </h2>
        <Grid dataset={bonds} layout={bondsLayout(selected)} toolbar={{ group: false }} />
      </section>
    </>
  );
}

/** October's P&L explain as a waterfall, and the factor a click on it picks, by portfolio. */
function Explain(): ReactNode {
  const attribution = useDemoDataset("attribution");
  const [selected, setSelected] = useState<ChartSelection | null>(null);
  return (
    <>
      <Card size="sm" data-card="pnl-explain" className="h-110">
        <CardHeader>
          <CardTitle>
            October&apos;s P&amp;L explained by factor, in thousands: click a factor
          </CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          <Chart
            className="min-h-0 flex-1"
            dataset={attribution}
            layout={explain}
            onSelect={setSelected}
          />
        </CardContent>
      </Card>
      <section data-linked="pnl-explain" className="flex h-80 flex-col gap-1.5">
        <h2 className="text-sm font-semibold">
          {selected === null
            ? "P&L by portfolio and factor group, until a factor is clicked"
            : `${selected.label} by portfolio`}
        </h2>
        <Pivot dataset={attribution} defaultSettingsOpen={false} layout={byPortfolio(selected)} />
      </section>
    </>
  );
}

function FixedIncomePage(): ReactNode {
  return (
    <Page page={pages.fixedIncome} scrolls>
      <RichCheap />
      <Explain />
    </Page>
  );
}

export { FixedIncomePage };
