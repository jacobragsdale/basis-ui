/* Relative value: each bond's spread against its duration, by sector, sized by DV01, over each sector's fitted curve,
 * linked to the grid of bonds below it: a click on a dot narrows the grid to that bond, whose CUSIP opens its page. */

import { Chart, Grid } from "@basis/parallax";
import type { ChartSelection, GridCell, LayoutFor } from "@basis/parallax";
import { Card, CardContent, CardHeader, CardTitle, Page, useTelemetry } from "@basis/ui";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { ReactElement } from "react";

import { businessDate, useBonds } from "#data/datasets.ts";
import type { BondRow } from "#data/rows.ts";

/** Spreads arrive as fractions, and read in basis points to a tenth. */
const inBps = { bps: true, decimals: 1 } as const;

const richCheap: LayoutFor<BondRow> = {
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
  formats: { dv01_usd: { decimals: 0 }, fitted_spread: inBps, rich_cheap: inBps, spread: inBps },
};

function bondsLayout(selected: ChartSelection | null): LayoutFor<BondRow> {
  return {
    cells: { cusip: { kind: "link" }, rich_cheap: { kind: "heat", scale: "diverging" } },
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
    filters:
      selected === null
        ? []
        : [{ column: "cusip", columns: [], op: "eq", value: selected.label, values: [] }],
    formats: { fitted_spread: inBps, rich_cheap: inBps, spread: inBps },
    sort: [{ column: "rich_cheap", descending: true }],
  };
}

function RelativeValuePage(): ReactElement {
  const bonds = useBonds();
  const navigate = useNavigate();
  const telemetry = useTelemetry();
  const report = (error: unknown): void => {
    telemetry.error(error, { source: "relative-value" });
  };
  const [selected, setSelected] = useState<ChartSelection | null>(null);
  const open = (cell: GridCell): void => {
    if (cell.column === "cusip") {
      navigate({ params: { cusip: cell.text }, to: "/bonds/$cusip" }).catch(report);
    }
  };
  return (
    <Page
      title="Relative value"
      description="Spread against duration over each sector's fitted curve: click a dot for its bond, and a CUSIP for its page."
    >
      <Card size="sm" className="h-110">
        <CardHeader>
          <CardTitle>Spread against duration, by sector, sized by DV01</CardTitle>
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
      <section className="flex h-96 flex-col gap-1.5">
        <h2 className="text-sm font-semibold">
          {selected === null ? "Bonds, richest to their curve first" : `Bond ${selected.label}`}
        </h2>
        <Grid
          asOf={businessDate}
          dataset={bonds}
          label="Bonds"
          layout={bondsLayout(selected)}
          onCellClick={open}
        />
      </section>
    </Page>
  );
}

export { RelativeValuePage };
