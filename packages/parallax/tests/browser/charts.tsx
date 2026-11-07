/* Charts for the browser tests: a dataset's chart, counted each time React renders it, and what the tests read off a
 * chart: its plot, its status line's summary, its text alternative and how much its canvas inks. */

import { Profiler } from "react";
import type { ReactNode } from "react";

import { Chart } from "#chart/chart.tsx";
import type { ChartOptions } from "#chart/chart-view.tsx";
import type { LayoutInput } from "#layout/layout.ts";
import { useDataset } from "#react/use-dataset.ts";

import { pricesBytes } from "./chart-data.ts";

interface PricesChartProps extends ChartOptions {
  readonly layout: LayoutInput;
  /** Called each time React renders the chart. */
  readonly onRender?: () => void;
}

/** A chart of the prices, as an app's page shows one: the page loads the data, the chart below it views it. */
function PricesChart({ layout, onRender, ...options }: PricesChartProps): ReactNode {
  const prices = useDataset("prices", pricesBytes);
  return (
    <Profiler id="chart" onRender={() => onRender?.()}>
      <Chart {...options} className="h-80 w-160" dataset={prices} layout={layout} />
    </Profiler>
  );
}

export { PricesChart };
