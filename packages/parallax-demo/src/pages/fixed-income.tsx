/* The fixed-income page: the relative-value scatter over a book of bonds, each bond a dot, with the bonds a click on it
 * narrows. Roadmap step 2.8 adds its other views for the firm's desks here. */

import { Chart, Grid } from "@basis/parallax";
import type { ChartSelection, LayoutInput } from "@basis/parallax";
import { Card, CardContent, CardHeader, CardTitle } from "@basis/ui";
import { useState } from "react";
import type { ReactNode } from "react";

import { useDemoDataset } from "#shell/datasets.ts";
import { Page } from "#shell/page.tsx";
import { pages } from "#shell/pages.ts";

import { pickedFilter } from "./layouts.ts";

/** Each bond's spread against its duration, by sector, sized by DV01, over each sector's fitted curve. */
const richCheap: LayoutInput = {
  chart: {
    fit: "fitted_spread_bp",
    id: "cusip",
    kind: "scatter",
    series: "sector",
    size: "dv01_usd",
    tooltip: ["issuer", "rating", "rich_cheap_bp"],
    x: "duration",
    y: ["spread_bp"],
  },
  dataset: "bonds",
  formats: {
    dv01_usd: { decimals: 0 },
    fitted_spread_bp: { decimals: 1 },
    rich_cheap_bp: { decimals: 1 },
    spread_bp: { decimals: 1 },
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
      "spread_bp",
      "fitted_spread_bp",
      "rich_cheap_bp",
      "dv01_usd",
    ],
    dataset: "bonds",
    filters: selected === null ? [] : [pickedFilter(selected)],
    sort: [{ column: "rich_cheap_bp", descending: true }],
  };
}

function FixedIncomePage(): ReactNode {
  const bonds = useDemoDataset("bonds");
  const [selected, setSelected] = useState<ChartSelection | null>(null);
  return (
    <Page page={pages.fixedIncome}>
      <Card size="sm" data-card="rich-cheap" className="min-h-0 flex-3">
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
      <section data-linked="rich-cheap" className="flex min-h-0 flex-2 flex-col gap-1.5">
        <h2 className="text-sm font-semibold">
          {selected === null
            ? "Bonds, richest to their curve first, until one is clicked"
            : `Bond ${selected.label}`}
        </h2>
        <Grid dataset={bonds} layout={bondsLayout(selected)} toolbar={{ group: false }} />
      </section>
    </Page>
  );
}

export { FixedIncomePage };
