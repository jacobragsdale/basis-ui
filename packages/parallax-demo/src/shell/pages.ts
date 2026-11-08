/* The demo's pages, in the sidebar's order: each page's address, title, what it shows off, and its icon. */

import {
  ArrowDownWideNarrowIcon,
  CalendarIcon,
  ChartCandlestickIcon,
  ChartColumnIcon,
  ChartLineIcon,
  ChartPieIcon,
  ChartScatterIcon,
  Columns3Icon,
  GroupIcon,
  LayoutDashboardIcon,
  TableIcon,
  UploadIcon,
} from "@basis/ui";
import type { IconProps } from "@basis/ui";
import type { ReactElement } from "react";

/** The rows of the large generated datasets, positions and trades. */
const largeRows = "150,000";

/** The sidebar's groups. */
type PageGroup = "Tables" | "Charts";

interface DemoPage {
  /** The page's address, which its route matches. */
  readonly path: string;
  readonly title: string;
  readonly about: string;
  readonly group: PageGroup;
  readonly Icon: (props: IconProps) => ReactElement;
}

const tablePages = {
  pivot: {
    about: `${largeRows} generated positions, the most rows a table in the browser holds, loaded into this page and pivoted by the engine compiled to WebAssembly in a worker. The pivot groups fund, strategy, sector and ticker by asset class. Change it in the settings, double-click a value for the rows behind it, export it to Excel.`,
    group: "Tables",
    Icon: GroupIcon,
    path: "/",
    title: "Positions pivot",
  },
  trades: {
    about: `${largeRows} generated trades loaded into this page; the grid draws only the rows on screen. Sort by a header, select with the mouse or keyboard, copy with Ctrl+C.`,
    group: "Tables",
    Icon: TableIcon,
    path: "/trades",
    title: `${largeRows} trades`,
  },
  largestTrades: {
    about:
      "The trades sorted by gross amount, largest first, with amounts shown exactly. The trade's id and ticker stay pinned at the left, and the footer counts the trades and totals their quantities.",
    group: "Tables",
    Icon: ArrowDownWideNarrowIcon,
    path: "/largest-trades",
    title: "Largest trades",
  },
  prices: {
    about: "Daily prices for 50 tickers with fat-tailed returns, newest first.",
    group: "Tables",
    Icon: CalendarIcon,
    path: "/prices",
    title: "Daily prices",
  },
  smallTables: {
    about:
      "Two tables of a few hundred rows, the size most tables are: 300 positions and 500 trades, each loaded into this page and run by the WebAssembly engine. Every change should feel instant; open Performance to time each one from the click or keystroke to the screen.",
    group: "Tables",
    Icon: Columns3Icon,
    path: "/small-tables",
    title: "Small tables",
  },
  source: {
    about:
      "Data the app makes itself, as its own API would send it: the Arrow bytes move into this page's worker, and every view and export of them runs there. The API says when it read the data and which NaNs it blanked. Open an Arrow stream file to load your own, within the browser's limits.",
    group: "Tables",
    Icon: UploadIcon,
    path: "/data-from-the-app",
    title: "Data from the app",
  },
} as const satisfies Readonly<Record<string, DemoPage>>;

const chartPages = {
  dashboard: {
    about:
      "Small charts over the two small tables, with their grids below: click a slice or bar to filter its table's grid to that group, and again to show every row. Export writes what the grid shows.",
    group: "Charts",
    Icon: LayoutDashboardIcon,
    path: "/dashboard",
    title: "Dashboard",
  },
  breakdowns: {
    about: `Big pies, donuts and bars over the ${largeRows} positions and the ${largeRows} trades. Bars carry their values and slices their shares; hover a slice to see it in the donut's hole. Click a slice or bar to narrow every other chart of the same dataset to that group, and its chip to show them all again.`,
    group: "Charts",
    Icon: ChartPieIcon,
    path: "/breakdowns",
    title: "Breakdowns",
  },
  charts: {
    about:
      "Every chart kind, reduced by the engine to the pixels it fills: lines on trading days, candles bucketed to fit, stacked bars, a histogram, a density of 150,000 points and a heatmap that diverges around zero. Hover for values; the price charts share a crosshair. Drag to pan, scroll to zoom, double-click to show everything, and Shift-drag on the candles to list those days.",
    group: "Charts",
    Icon: ChartLineIcon,
    path: "/charts",
    title: "Charts",
  },
  technical: {
    about:
      "One ticker's prices with the indicators, chart kind and range the controls set. Indicators are computed by the engine over every row and checked against TA-Lib. Draw with the tools above the chart, measure with Measure, Shift-drag to list those days below, or compare three tickers as percentage changes.",
    group: "Charts",
    Icon: ChartCandlestickIcon,
    path: "/technical",
    title: "Technical analysis",
  },
  smallCharts: {
    about:
      "Charts of a few rows the page already holds, as a card or a summary would have them: each passes its rows to the chart, which makes them a table of its own in the engine, in their order.",
    group: "Charts",
    Icon: ChartColumnIcon,
    path: "/small-charts",
    title: "Small charts",
  },
  fixedIncome: {
    about:
      "600 generated bonds, as a desk reads them: each bond a dot of its spread against its duration, coloured by sector, sized by DV01, over each sector's fitted curve, which the API sends as a column; click a bond to list it below. Under them, four portfolios' P&L explained by factor as a waterfall, its steps the engine's running totals; click a factor to see it by portfolio.",
    group: "Charts",
    Icon: ChartScatterIcon,
    path: "/fixed-income",
    title: "Fixed income",
  },
} as const satisfies Readonly<Record<string, DemoPage>>;

const pages = { ...tablePages, ...chartPages };

type PageName = keyof typeof pages;

/** Every page, in the sidebar's order. */
const pageList: readonly DemoPage[] = [...Object.values(tablePages), ...Object.values(chartPages)];

export { pageList, pages };
export type { DemoPage, PageGroup, PageName };
