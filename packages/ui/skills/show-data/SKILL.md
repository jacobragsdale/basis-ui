---
name: show-data
description: Show a large table, a pivot or a chart with @basis/parallax: the grid for thousands to a million rows, the pivot for grouped totals, and every chart kind. Use when a page holds more rows than DataTable's cap, needs grouping, totals or a pivot, or draws a chart.
---

# Showing data with parallax

`@basis/parallax` draws grids, pivots and charts on a canvas from an engine in a Web Worker, so a million rows scroll,
sort and filter at once. `DataTable` is for a few hundred rows whose cells hold links and buttons; past its cap of
2,000, or for grouping, use the grid. `vp run docs Grid`, `vp run docs Pivot`, `vp run docs Chart` and `vp run docs
LayoutInput` print each one's props and fields.

```tsx
import { Grid, ParallaxProvider, useDataset } from "@basis/parallax";
import { arrowResponse } from "@basis/ui";

// Once, around the pages that use it: it starts the engine's worker.
<ParallaxProvider prewarm>{children}</ParallaxProvider>;

// In the page: the dataset, typed by its rows' type, streamed from an Arrow route whose URL the generated client gives.
const positions = useDataset<Position>("positions", async () => arrowResponse(getPositionsUrl()), {
  primaryKey: "position_id",
});
<Grid
  dataset={positions}
  layout={{ sort: [{ column: "market_value_usd", descending: true }] }}
  asOf="2026-11-06"
/>;
```

- **The layout** is the view: columns, sorts, filters, groups, pivots, formats, widths, pinned columns, `titles` and
  totals. Its column names are the row type's, so a typo is a type error. It is plain JSON: keep it in state, the
  address, or a `SavedViews` store.
- **Cells**: `cells` draws a column as a `bar`, `heat`, `badge`, `sparkline` or `link`, and `rules` formats cells by the
  filters' conditions. Exports write what Excel can express.
- **Events and menu**: `onCellClick`, `onRowActivate`, `onContextMenu`, and `contextMenuItems` for the app's own items
  in the right-click menu; the `ref`'s `scrollTo`, `getSelection`, `copy` and `export("xlsx" | "csv")`.
- **Pivot**: `<Pivot>` groups rows and columns with measures; a double click shows the rows behind a value.
- **Charts**: `<Chart>` takes the same dataset and a layout whose `chart` section says what to draw: line, area, bar,
  scatter, heatmap, histogram, candlestick, OHLC, pie, donut or waterfall, with indicators and panes. It takes its
  parent's height, so give the parent one, such as a card's `h-80`; a tile-sized chart names its marks in a legend.
- **As of**: pass `asOf`, the date the data is for, so the status bar never shows the browser's load time.

The canvases follow the user's theme, mode and density from `@basis/ui`. Look at the page with `vp run shot` after
the first rows load (`--wait 2000`), and run `vp run verify`.
