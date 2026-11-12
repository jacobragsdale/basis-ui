/* P&L explain: October's P&L by factor as a waterfall, each factor a step from the running total; a click on a factor
 * narrows the grid below to it, by portfolio and day. */

import { Chart, Grid } from "@basis/parallax";
import type { ChartSelection, LayoutFor } from "@basis/parallax";
import { Card, CardContent, CardHeader, CardTitle, Page } from "@basis/ui";
import { useState } from "react";
import type { ReactElement } from "react";

import { useAttribution } from "#data/datasets.ts";
import type { AttributionRow } from "#data/rows.ts";

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

const inThousands = { abbreviate: "thousands", decimals: 0 } as const;

const explain: LayoutFor<AttributionRow> = {
  chart: { kind: "waterfall" },
  formats: { pnl_usd: inThousands },
  group_by: ["factor"],
  measures: [{ aggregate: "sum", column: "pnl_usd" }],
  orders: { factor: { values: factorOrder } },
};

function detailLayout(selected: ChartSelection | null): LayoutFor<AttributionRow> {
  return {
    cells: { pnl_usd: { from: "zero", kind: "bar" } },
    columns: ["date", "factor_group", "factor", "pnl_usd"],
    detail: true,
    filters:
      selected === null
        ? []
        : [{ column: "factor", columns: [], op: "eq", value: selected.label, values: [] }],
    formats: { pnl_usd: inThousands },
    group_by: ["portfolio"],
    sort: [{ column: "date" }],
    totals: [{ aggregate: "sum", column: "pnl_usd" }],
  };
}

function PnlExplainPage(): ReactElement {
  const attribution = useAttribution();
  const [selected, setSelected] = useState<ChartSelection | null>(null);
  return (
    <Page
      title="P&L explain"
      description="October's P&L for four bond portfolios, by factor, in thousands of dollars."
    >
      <Card size="sm" className="h-110">
        <CardHeader>
          <CardTitle>October&apos;s P&amp;L by factor: click a factor</CardTitle>
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
      <section className="flex h-96 flex-col gap-1.5">
        <h2 className="text-sm font-semibold">
          {selected === null ? "Every factor, by portfolio" : `${selected.label}, by portfolio`}
        </h2>
        <Grid dataset={attribution} label="P&L by portfolio" layout={detailLayout(selected)} />
      </section>
    </Page>
  );
}

export { PnlExplainPage };
