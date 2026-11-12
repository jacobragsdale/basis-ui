/* Curves: the Treasury curve on several dates, each point's change on the day in basis points in a pane beneath, and
 * the 10-year yield through the autumn on a reversed axis, so that up is a gain to a holder. */

import { Chart } from "@basis/parallax";
import type { LayoutFor } from "@basis/parallax";
import { Card, CardContent, CardHeader, CardTitle, Page } from "@basis/ui";
import type { ReactElement } from "react";

import { useCurves } from "#data/datasets.ts";
import type { CurveRow } from "#data/rows.ts";

const yieldFormat = { decimals: 3, percent: true } as const;

const onDates: LayoutFor<CurveRow> = {
  chart: {
    axis: "tenor",
    kind: "line",
    panes: [{ columns: ["change"], kind: "bar", title: "Change on the day" }],
    series: "curve_date",
    x: "tenor",
    y: ["yield"],
  },
  filters: [
    {
      column: "curve_date",
      columns: [],
      op: "in",
      value: null,
      values: ["2026-09-30", "2026-10-15", "2026-10-30"],
    },
  ],
  formats: { change: { bps: true, decimals: 1 }, yield: yieldFormat },
};

const tenYear: LayoutFor<CurveRow> = {
  chart: {
    axis: "trading",
    calendar: "sifma",
    kind: "line",
    reverse_y: true,
    x: "curve_date",
    y: ["yield"],
  },
  filters: [
    { column: "tenor", columns: [], op: "eq", value: "10Y", values: [] },
    { column: "curve_date", columns: [], op: "ge", value: "2026-08-01", values: [] },
  ],
  formats: { yield: yieldFormat },
};

function ChartCard({
  title,
  layout,
}: {
  readonly title: string;
  readonly layout: LayoutFor<CurveRow>;
}): ReactElement {
  const curves = useCurves();
  return (
    <Card size="sm" className="h-110">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <Chart className="min-h-0 flex-1" dataset={curves} layout={layout} />
      </CardContent>
    </Card>
  );
}

function CurvesPage(): ReactElement {
  return (
    <Page
      title="Curves"
      description="The Treasury curve, from parallax-datagen's curves on SIFMA's trading days."
    >
      <ChartCard
        title="The curve at the ends of September and October and in mid-October, with each point's change on the day"
        layout={onDates}
      />
      <ChartCard
        title="The 10-year yield since August, reversed so that up is a gain"
        layout={tenYear}
      />
    </Page>
  );
}

export { CurvesPage };
