/* One instrument's technical analysis: a chart whose indicators, kind and range the controls set, and its days below,
 * which a brush on the chart narrows. */

import { Chart, Grid } from "@basis/parallax";
import type { Layout, LayoutFilter, LayoutInput } from "@basis/parallax";
import { Card, CardContent, Page } from "@basis/ui";
import { useState } from "react";
import type { ReactNode } from "react";

import { useDemoDataset } from "#shell/datasets.ts";
import { pages } from "#shell/pages.ts";
import { trackGrid } from "#tools/grid-stats.ts";

import { TechnicalControls } from "./technical-controls.tsx";
import type { Apply, Change } from "./technical-controls.tsx";
import { chartLayout, daysLayout, firstSettings } from "./technical-settings.ts";
import type { Kept, Settings } from "./technical-settings.ts";

/** What the chart keeps of the one before it: its drawings unless the units change, its zoom unless the rows do, and
 * its hidden series. */
function keptOf(chart: LayoutInput["chart"], change: Change): Kept {
  return {
    ...(change.units || chart?.drawings === undefined ? {} : { drawings: chart.drawings }),
    ...(change.rows ? {} : { range: chart?.range ?? null }),
    ...(chart?.hidden === undefined ? {} : { hidden: chart.hidden }),
  };
}

/** The page's settings and its chart. */
interface Shown {
  readonly settings: Settings;
  readonly chart: LayoutInput;
}

/**
 * New settings remake the chart. Another ticker, start date or comparison draws other rows: the zoom goes, the grid
 * lists every day again, and the chart drops its brush itself. Another ticker or a comparison also puts prices on
 * another scale, so drawings anchored to the old one go too. Indicators, events and the log scale change neither.
 */
function useTechnical(): Shown & {
  readonly apply: Apply;
  readonly brush: readonly LayoutFilter[];
  readonly handleBrush: (filters: readonly LayoutFilter[] | null) => void;
  readonly handleChart: (layout: Layout) => void;
} {
  const [shown, setShown] = useState<Shown>(() => ({
    chart: chartLayout(firstSettings, {}),
    settings: firstSettings,
  }));
  const [brush, setBrush] = useState<readonly LayoutFilter[]>([]);
  return {
    ...shown,
    apply: (next, change) => {
      setShown((was) => ({
        chart: chartLayout(next, keptOf(was.chart.chart, change)),
        settings: next,
      }));
      if (change.rows) {
        setBrush([]);
      }
    },
    brush,
    handleBrush: (filters) => {
      setBrush(filters ?? []);
    },
    handleChart: (layout) => {
      setShown((was) => ({ ...was, chart: layout }));
    },
  };
}

function TechnicalPage(): ReactNode {
  const prices = useDemoDataset("prices");
  const page = useTechnical();
  return (
    <Page title={pages.technical.title} description={pages.technical.about} layout="fill">
      <TechnicalControls settings={page.settings} apply={page.apply} />
      <Card size="sm" data-slot="technical-chart" className="min-h-0 flex-3">
        <CardContent className="flex min-h-0 flex-1 flex-col">
          <Chart
            className="min-h-0 flex-1"
            dataset={prices}
            layout={page.chart}
            onLayoutChange={page.handleChart}
            onBrush={page.handleBrush}
          />
        </CardContent>
      </Card>
      <section data-linked="technical" className="flex min-h-0 flex-2 flex-col gap-1.5">
        <h2 className="text-sm font-semibold">
          {page.brush.length === 0
            ? "Every day shown, newest first: Shift-drag on the chart to narrow them"
            : "The days brushed on the chart"}
        </h2>
        <Grid
          ref={trackGrid("prices")}
          dataset={prices}
          layout={daysLayout(page.settings, page.brush)}
          toolbar={{ group: false }}
        />
      </section>
    </Page>
  );
}

export { TechnicalPage };
