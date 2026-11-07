/* `<Chart>`: every chart of the firm's apps, drawn by parallax on a Canvas 2D surface. It takes a dataset that
 * `useDataset` loads and a layout whose `chart` section says what to draw:
 *
 *   <Chart dataset={prices} layout={{ filters, chart: { kind: "candlestick", x: "date", ohlc } }} />
 *
 * or, for a small chart, the rows themselves, which it makes into an Arrow table and loads:
 *
 *   <Chart rows={rows} kind="bar" x="sector" y="exposure" />
 *
 * The engine, in its worker, reduces line, area, scatter, histogram, candlestick and OHLC charts to the plot's pixels;
 * bar charts, heatmaps and pies draw the layout's grouped view. The legend hides and shows series, drawings and their
 * tools sit on charts along an x axis, the wheel zooms, a drag pans, Shift and drag brushes, a click selects a bar or
 * slice, and crosshairs of the same dataset and x move together. The canvas carries a text alternative: what the chart
 * draws, and the values it shows. */

import { useId } from "react";
import type { ReactNode } from "react";

import type { LayoutInput } from "#layout/layout.ts";
import { useDataset } from "#react/use-dataset.ts";

import { ChartView } from "./chart-view.tsx";
import type { ChartOptions, ChartViewProps } from "./chart-view.tsx";
import { groupedKinds, rowOrder, smallBytes, smallLayout } from "./small-data.ts";
import type { ChartRow, ChartSettings, SmallChart } from "./small-data.ts";

/** `<Chart>` over a dataset that `useDataset` loads. */
type DatasetChartProps = Omit<ChartViewProps, "order" | "source">;

/** `<Chart>` over rows the page holds. */
interface RowsChartProps extends ChartOptions, SmallChart {
  /** The rows, a value per column; the chart reads its x, y and series columns. */
  readonly rows: readonly ChartRow[];
  /** More of the chart's settings, such as `stacked` bars or a `donut: false` pie. */
  readonly settings?: ChartSettings;
  /** How the engine formats the columns' values, as a layout's `formats` say. */
  readonly formats?: LayoutInput["formats"];
  /** What the rows are, for the status line and the text alternative: "rows" by default. */
  readonly name?: string;
}

type ChartProps = DatasetChartProps | RowsChartProps;

/** A small chart: the rows made into a table of its own, loaded under a name no other chart takes. */
function RowsChart(props: RowsChartProps): ReactNode {
  const { rows, kind, x, y, series, settings, formats, name, ...options } = props;
  const small = { kind, x, y, ...(series === undefined ? {} : { series }) };
  const id = useId().replaceAll(/[^\w-]/gu, "");
  const dataset = useDataset(`rows-${id}`, smallBytes(rows, small));
  const layout = {
    ...smallLayout(small, settings),
    ...(formats === undefined ? {} : { formats }),
  };
  return (
    <ChartView
      {...options}
      dataset={dataset}
      layout={layout}
      order={groupedKinds.has(kind) ? rowOrder(rows, x) : null}
      source={name ?? "rows"}
    />
  );
}

/** A chart of a dataset, as a layout describes it, or of rows the page holds. */
function Chart(props: ChartProps): ReactNode {
  return "rows" in props ? <RowsChart {...props} /> : <ChartView {...props} />;
}

export { Chart };
export type { ChartProps, DatasetChartProps, RowsChartProps };
