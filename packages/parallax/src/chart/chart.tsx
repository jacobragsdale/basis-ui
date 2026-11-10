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
 * bar charts, heatmaps, pies and waterfalls draw the layout's grouped view. The legend hides and shows series, drawings and their
 * tools sit on charts along an x axis, the wheel zooms, a drag pans, Shift and drag brushes, a click selects a bar, a
 * slice or a scatter's dot, and crosshairs of the same dataset and x move together. The canvas carries a text
 * alternative: what the chart draws, and the values it shows. */

import { useId } from "react";
import type { ReactNode } from "react";

import type { LayoutInput } from "#layout/layout.ts";
import { useDataset } from "#react/use-dataset.ts";

import { ChartView } from "./chart-view.tsx";
import type { ChartOptions, ChartViewProps } from "./chart-view.tsx";
import { reorderedKinds, rowOrder, smallBytes, smallLayout } from "./small-data.ts";
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
  const dataset = useDataset(`rows-${id}`, smallBytes(rows, small, settings));
  const layout = {
    ...smallLayout(small, settings, rows),
    ...(formats === undefined ? {} : { formats }),
  };
  return (
    <ChartView
      {...options}
      dataset={dataset}
      layout={layout}
      order={reorderedKinds.has(kind) ? rowOrder(rows, x) : null}
      source={name ?? "rows"}
    />
  );
}

/** A chart of a dataset, as a layout describes it, or of rows the page holds.
 *
 * @use For every chart of a dataset, or of rows the page holds, from a line to a candlestick or a waterfall. For a
 * series too small to load parallax for, use `@basis/ui`'s Sparkline; for a bar behind a table cell's text, CellBar.
 * @see ParallaxProvider, useDataset, Grid, LayoutInput, LayoutChart, Sparkline, CellBar
 *
 * @example
 * ```tsx
 * import { Chart } from "@basis/parallax";
 *
 * const curve = [
 *   { tenor: "2Y", yield: 0.0412 },
 *   { tenor: "10Y", yield: 0.0438 },
 * ];
 *
 * <div className="h-80">
 *   <Chart rows={curve} kind="line" x="tenor" y="yield" name="Treasury yields" />
 * </div>;
 * ```
 */
function Chart(props: ChartProps): ReactNode {
  return "rows" in props ? <RowsChart {...props} /> : <ChartView {...props} />;
}

export { Chart };
export type { ChartProps, DatasetChartProps, RowsChartProps };
