# @basis/parallax

parallax is a data grid, pivot table and charting stack for portfolio managers
and quant researchers. It is a Rust engine, compiled to WebAssembly and run in a
Web Worker in the page, built to pivot and chart tables on GPU-less Citrix
desktops without showing a wrong number. The app loads the data, as Arrow from
its own API; one table holds at most 150,000 rows and 70 MB of Arrow.

This package, `@basis/parallax`, is the engine with its worker built in, the
framework-free client, and its React layer. App developers install it and never
build Rust. basis-ui's [roadmap](../../docs/roadmap.md), phase 2, builds it:
step 2.5 built the provider, the worker connection and the hooks below, step
2.6 ported the grid, pivot and chart components from the Angular layer, and
step 2.7 rebuilt the demo in React and deleted that layer. Nothing is published
yet; it releases with basis-ui. parallax's own [roadmap](docs/roadmap.md)
records the milestones it was built in. [Contributing](CONTRIBUTING.md) shows
how to build it and run the tests.

## Show a view in a React app

The app is a basis-ui app, on `@basis/ui`'s preset, which this package depends
on at its own version.

1. Add parallax's stylesheet to the app's `src/styles.css`, after
   `@basis/ui`'s, so that Tailwind generates the classes its components use:

   ```css
   @import "@basis/ui/styles.css";
   @import "@basis/parallax/styles.css";
   ```

2. Start the engine in a provider around the part of the app that shows
   parallax. The provider starts the package's own worker, which an app's
   bundler finds beside the package's code and bundles with the engine, so an
   app imports no worker itself; `basisPlugins()` keeps Vite's dependency
   optimizer away from the package so that `vp dev` finds it too:

   ```tsx
   import { ParallaxProvider } from "@basis/parallax";

   function App(): ReactNode {
     return (
       <ParallaxProvider prewarm>
         <Positions />
       </ParallaxProvider>
     );
   }
   ```

   A test that runs the package's source, or a page that serves the worker
   itself, passes `worker`: a function that starts one, or the URL that serves
   `@basis/parallax/worker`.

   `prewarm` starts the worker at once, so the first rows show sooner; every
   page under the provider then downloads the engine, about 1 MB compressed.
   Unmounting the provider ends the worker and frees its memory.

   Each column shows by the display format the API declares in its Arrow
   field's metadata under `basis.format`, such as a price at 4 decimals or a
   rate in basis points, unless a layout's `formats` sets its own.

3. Load a dataset and open a view of it:

   ```tsx
   import { useDataset, useView } from "@basis/parallax";

   // The generated client's call for an Arrow endpoint answers with a Blob.
   const positionsBytes = async (): Promise<ArrayBuffer> =>
     (await listPositions()).data.arrayBuffer();

   function Positions(): ReactNode {
     const positions = useDataset("positions", positionsBytes, {
       primaryKey: "position_id",
     });
     const view = useView(positions, {
       group_by: ["fund"],
       measures: [{ aggregate: "sum", column: "market_value_usd" }],
     });
     return <p>{view.status}: {view.frame?.totalRows ?? 0} rows</p>;
   }
   ```

4. Or give the dataset to a component that opens its own view and draws its
   frames: [a grid](#show-a-grid), [a pivot](#pivot-a-table) or
   [a chart](#draw-a-chart).

## Show a grid

`<Grid>` is the data grid and pivot table of the firm's apps. Give it a dataset
that `useDataset` loads and a layout, and it opens its own view:

```tsx
import { Grid, useDataset } from "@basis/parallax";
import type { LayoutInput } from "@basis/parallax";

function Positions(): ReactNode {
  const positions = useDataset("positions", positionsBytes, {
    primaryKey: "position_id",
  });
  const [layout, setLayout] = useState<LayoutInput>({ pinned: ["ticker"] });
  return <Grid dataset={positions} layout={layout} onLayoutChange={setLayout} />;
}
```

Every change the user makes, a sort, a width, a filter, a group, is a new
layout, handed to `onLayoutChange`; keep it in state, the URL or a saved view.
Without `onLayoutChange`, the grid keeps the user's changes itself until
`layout` changes.

`<Grid>` draws on a Canvas 2D surface, which a desktop without a GPU draws on
its CPU. It opens its view with `useView` and takes the view's frames outside
React's state, so a scroll asks the view's handle for rows and draws the rows in
view without a React render. Only the visible rows and columns are drawn, and a
frame for rows already on screen redraws only the cells whose text changed.

| Prop             | What it is                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `dataset`        | The dataset, from `useDataset`                                                                                                              |
| `layout`         | The view: columns, sorts, filters, groups and pivots, formats, widths, pinned columns, titles and totals; a layout the engine refuses shows its reason in place of the grid |
| `onLayoutChange` | Takes each layout the user makes                                                                                                            |
| `toolbar`        | `true` (the default) shows the toolbar, `false` hides it, and an object turns parts off: `search`, `chips`, `columns`, `totals`, `export`, `group`, `expand` and `maximize` |
| `height`         | `fill`, the default, takes the container's height; `auto` sizes the grid to its rows up to `maxHeight` pixels (480 by default)               |
| `onDrill`        | Takes a double click on a pivot's value: the group's path, the column's pivot values and a label, for the rows behind it                     |
| `label`          | What screen readers call the grid; the dataset's name by default                                                                            |
| `asOf`           | The date the data is for, as `YYYY-MM-DD`: the status bar shows `as of 2026-11-06`, with no age. Without it, the bar shows when the source was read and how long ago, when `useDataset`'s `sourceAsOfMicros` or the stream's `parallax.load` gives the time, and no "as of" otherwise, never the time the browser loaded the table. A string that is not a calendar date shows an `ERROR` line there, with the fix, in place of the date |
| `measureMenu`    | The menu a pivot's measure header opens, which the pivot gives the grid; without it, a measure's header has none                            |
| `onFieldsChange` | Takes the dataset's columns when the view opens, as the pivot's field list reads them                                                       |
| `ref`            | `drawStats()`, the drawing counters; `export(format)`, `xlsx` or `csv`; and `distinctValues(column, search, limit)`                         |
| `selectable`     | `true` adds a checkbox column for choosing rows, any number of them; `"single"` makes the focused cell's row the one chosen               |
| `rowKey`         | With `selectable`, the column whose value names a row, such as a trade id or a CUSIP: one of the view's columns, different on every row   |
| `selected`       | The keys of the rows chosen, when the app holds them; without it, the grid keeps the choice itself                                         |
| `onSelectionChange` | Takes the keys of the rows chosen, in the order they were chosen, whenever the user changes them                                        |

The user sorts by clicking a header, Shift adding a sort; resizes a column by
dragging its header's edge, or fits it with a double click there; moves a column
by dragging its header, and groups by it by dropping it on the group panel; and
opens a column's menu from its header's funnel or with Alt+Down, for sorting,
the column's filter of values or a condition, hiding, pinning, fitting,
grouping, a title and a total. The arrow keys, Page Up and Down, Home and End
move the focused cell, Ctrl to the edge and Shift extending the selection;
Ctrl+A selects everything, Enter or Space opens or closes a group, Ctrl+F
searches the grid, and Ctrl+C copies the selection as tab-separated text with
every digit, which pastes into Excel as cells. Rows the grid does not hold are
fetched first. Export writes an Excel workbook or a CSV file in the engine, of
the load the screen shows.

Rows are chosen by their key, the `rowKey` column's text as a copy writes it, every
digit of a number, so a choice stays with its rows as they sort, filter, group and
scroll, and the app can keep it in a URL or send it to its API:

```tsx
const [trades, setTrades] = useState<readonly string[]>([]);
<Grid dataset={blotter} selectable rowKey="trade_id" onSelectionChange={setTrades} />;
```

A checkbox checks its row, Shift checks every row from the last one checked, and
Space checks the focused row; the header's checkbox checks every row the view shows,
or clears the choice when there is one. Chosen rows are tinted as a selection is,
and the status bar and screen readers say how many there are. In a grouped grid the
table's rows can be chosen, not the groups' rows, and the header's checkbox checks
the rows of the groups that are open. A pivot's rows are groups, so it chooses none,
and a view that hides the key column says so in its status bar rather than choosing
rows it cannot name. Shift ranges and the header's checkbox fetch the keys of rows
off screen, up to 1,000,000 at once. With `selectable="single"` there are no
checkboxes: the row chosen is the focused cell's, so a click or an arrow key chooses
another, as a master list beside its detail does.

While more than one cell is selected, the status bar reads the numbers among
them as Excel's does: `Avg`, `Min`, `Max`, `Sum` and `Count`, the sum exact and
each written in the format the selected columns share, a yield's in percent, a
price's in 32nds. Rows the grid does not hold are fetched for a selection of up
to 100,000 cells. A narrower grid keeps the sum and drops the extremes, the
count and then the mean, which the reading's tooltip still lists. The toolbar's
Totals adds a totals row that counts the rows, and sums nothing on its own,
since most of a desk's numbers, its prices, yields, spreads and durations, do
not add; a column's menu picks its total, a sum among them.

Maximize, at the toolbar's end, or Alt+Enter, makes the grid fill the window
over the dimmed page, as a dialog, and Escape, Restore or a click on the page
around puts it back. The grid moves rather than opening again, so its rows,
scroll position, selection and changes stay as they were, and a placeholder
keeps its place in the page. Escape does one thing at a time: it clears a
selection or a search before it restores the grid. A grid of `height` `auto`
fills the window too.

A canvas is invisible to screen readers, so the grid is a `grid` whose name is
`label`, whose description says how many rows and columns it holds and how to
move about it, and whose active descendant is the focused cell, read as its
column's title and its text. A live region says the selection's size, and the
totals row is said as text. The canvas draws in the theme's tokens, which
`basisTheme` takes from `@basis/ui`'s, in either mode, its rows, header and
padding the size of `@basis/ui`'s controls in the page's density, and reads them
again when the theme, the mode, the density or the fonts change. Its toolbar, menus and status bar are
`@basis/ui`'s components, in `@basis/ui`'s theme.

## Pivot a table

`<Pivot>` is a pivot table with its settings beside it, as Excel's PivotTable
and its field list. The table is a `<Grid>`; the settings edit the same layout:

```tsx
import { Pivot, useDataset } from "@basis/parallax";
import type { LayoutInput } from "@basis/parallax";

function Exposure(): ReactNode {
  const positions = useDataset("positions", positionsBytes, {
    primaryKey: "position_id",
  });
  const [layout, setLayout] = useState<LayoutInput>({
    group_by: ["fund", "strategy"],
    split_by: ["asset_class"],
    measures: [{ aggregate: "sum", column: "market_value_usd" }],
  });
  return <Pivot dataset={positions} layout={layout} onLayoutChange={setLayout} />;
}
```

| Prop                  | What it is                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `dataset`, `layout`   | The dataset, from `useDataset`, and the pivot: its row and column groups, values, filters and more |
| `layout.titles`       | Header text by column, or by a measure's header as the pivot shows it: `{ "sum(par)": "Par", "wmean(ytm by market_value)": "Yield" }`. A key that names neither fails the view with a reason that lists both |
| `onLayoutChange`      | Takes each layout the user makes; without it, the pivot keeps its changes until `layout` changes   |
| `toolbar`             | The table's toolbar, as `<Grid>` takes it                                                          |
| `defaultSettingsOpen` | Whether the settings start open; they do by default, and the user hides and shows them             |
| `label`               | What screen readers call the table; the dataset's name by default                                  |
| `asOf`                | The date the data is for, as `YYYY-MM-DD`, under the table and the rows behind a value, as `<Grid>` takes it |
| `ref`                 | The table's `GridHandle`: `drawStats()`, `export(format)` and `distinctValues(column, search, limit)` |

The settings list the dataset's fields, searchable, ticked when the pivot uses
them: ticking puts a number in Values, as its mean, and anything else in Rows,
and unticking takes a field out of every area; a value's menu makes a mean a sum
where the numbers add. A field or a chip is dragged into Filters,
Columns, Rows or Values, or moved with its menu, so dragging is never needed;
Alt+Up and Alt+Down move a chip a place, and a screen reader hears where it
went. A row or column chip's menu moves it, filters by it or removes it; a
value's menu sets its aggregate, column, weight or percentile, how it shows (a
value or a share of a total) and its number format. A measure's header opens
the same menu with sorting the groups by it. A filter's chip opens the grid's
filter editor, a list of the column's values with their counts, `(blank)` among
them, or a condition; a field put in Filters shows `(All)` until a value is
picked. The options set how many levels open and top-N.

Double-clicking a value opens the rows behind it in a grid below the pivot,
filtered to its group and pivot values, which its toolbar searches and
exports; it closes when the pivot's groups or filters change. `drillLayout`
gives that view for an app that shows the rows elsewhere. Maximize, in the
table's toolbar, or Alt+Enter, makes the whole pivot fill the window, its
settings and the rows behind a value with it. Every change is a
layout, so a pivot round-trips through a link with `encodeLayout` and
`decodeLayout`.

## Draw a chart

`<Chart>` draws every chart of the firm's apps on a Canvas 2D surface: line,
area, bar (across, stacked, or on two axes), scatter (a dot per row up to 5,000
rows in the range shown, a density past that), heatmap,
histogram, candlestick, OHLC, pie, donut and waterfall, on a value, trading-time or tenor axis,
with technical-analysis indicators and panes, drawings, a compare mode and
events. Give it a dataset that `useDataset` loads and a layout whose `chart`
section says what to draw. A chart takes its parent's height, in a block or a
flex column alike, and is at least 120 pixels tall, so give its parent a
height, such as a card's `h-80`:

```tsx
import { Chart } from "@basis/parallax";

<Chart
  dataset={prices}
  layout={{
    filters: [{ column: "ticker", op: "eq", value: "UST10Y" }],
    chart: {
      kind: "candlestick",
      x: "date",
      axis: "trading",
      ohlc: { open: "open", high: "high", low: "low", close: "close" },
      indicators: [{ kind: "sma", period: 50 }, { kind: "rsi" }],
    },
  }}
  onBrush={(filters) => setDays(filters)}
/>;
```

A scatter's dots draw a relative-value view: `series` colours them, `size`
sets each dot's area by a column's magnitude, `id` names each in its tooltip
and is what a click on it selects, `tooltip` lists more columns, and `fit`
draws the API's fitted curve, a column holding the curve's value at each row's
x, as a dashed line through each series:

```tsx
<Chart
  dataset={bonds}
  layout={{
    chart: {
      kind: "scatter",
      x: "duration",
      y: ["spread"],
      series: "sector",
      size: "dv01_usd",
      id: "cusip",
      tooltip: ["issuer", "rating"],
      fit: "fitted_spread",
    },
    formats: { spread: { bps: true, decimals: 1 }, fitted_spread: { bps: true, decimals: 1 } },
  }}
  onSelect={(bond) => setBond(bond)} // { column: "cusip", value, label }, or null
/>
```

Text sorts alphabetically unless the layout's `orders` say otherwise, which a
grid's groups and sorts, a pivot's columns, a filter menu's values and a
chart's series and categories all follow: `"tenor"` by length, `"rating"` best
first, `{ values: [...] }` as listed, or `{ by: "column" }` by another
column's smallest value. A DV01 ladder that reads short to long, over a tenor
axis for curves:

```tsx
<Chart
  dataset={bonds}
  layout={{
    group_by: ["tenor_bucket"],
    measures: [{ aggregate: "sum", column: "dv01_usd" }],
    orders: { tenor_bucket: "tenor" },
    chart: { kind: "bar" },
  }}
/>;

<Chart
  dataset={curves}
  layout={{
    chart: { kind: "line", x: "tenor", y: ["yield"], series: "curve_date", axis: "tenor" },
  }}
/>;
```

A tenor axis puts the standard tenors one step apart, 1M, 3M, 6M, 1Y and so on
to 30Y, and labels them; `tenor_spacing: "length"` spaces them by years.

A line or area chart's `panes` draw more columns under the plot, on its x axis,
sharing its crosshair and zoom: each lists its `columns`, draws them as lines
or `kind: "bar"`, and has a `title`. A pane's series take the colours of the
plot's series of the same key, its axis reads in its first column's format, and
a series with no values is left out, so curves on three dates read with their
change in basis points below:

```tsx
<Chart
  dataset={curves}
  layout={{
    filters: [{ column: "curve_date", op: "in", values: ["2026-10-30", "2026-11-23", "2026-11-30"] }],
    formats: { yield: { percent: true, decimals: 3 }, change: { bps: true, decimals: 1 } },
    chart: {
      kind: "line",
      x: "tenor",
      y: ["yield"],
      series: "curve_date",
      axis: "tenor",
      panes: [{ columns: ["change"], kind: "bar", title: "Change on the day" }],
    },
  }}
/>
```

A yield reads better upside down, where a rise is a loss to a holder:
`reverse_y` turns the left value axis of a line, area, scatter, candlestick or
OHLC chart, `reverse_y_right` the right one, and a pane's `reverse` its own,
and `rising: "loss"` gives a rise the down colour, for candles, OHLC bars,
volume, MACD's histogram, a pane's bars and a waterfall's steps.

A trading-time axis follows the NYSE's calendar and its 09:30 to 16:00 session
unless the chart names another. `calendar: "sifma"` takes the bond market's:
its closes, such as Columbus Day and Veterans Day, take no space, and its 2 p.m.
early closes shorten their days. A `session` in New York time replaces the
calendar's 08:00 to 17:00, and one that closes before it opens, as electronic
Treasury trading's does, opens the evening before for the next day:

```tsx
<Chart
  dataset={yields}
  layout={{
    chart: {
      kind: "line",
      x: "time",
      y: ["yield"],
      series: "tenor",
      axis: "trading",
      calendar: "sifma",
      session: { opens: "18:00", closes: "17:00" },
    },
  }}
/>
```

A waterfall draws attribution and P&L explain from the layout's grouped view:
each group's step floats from the running total before it to its own, rising
steps in the up colour and falling ones in the down colour, and a total bar
ends them. The running totals are the engine's, from exact sums, so the last
step ends on the total, and a click on a step selects its group. A measure's
`show_as: "running_total"` gives a grid or pivot the same running totals,
Excel's "Running Total In", for sums and counts:

```tsx
<Chart
  dataset={attribution}
  layout={{
    group_by: ["factor"],
    measures: [{ aggregate: "sum", column: "pnl_usd" }],
    orders: { factor: { values: ["Carry", "Roll-down", "Curve 2Y", "Curve 10Y", "Spread IG"] } },
    chart: { kind: "waterfall" },
  }}
  onSelect={(factor) => setFactor(factor)}
/>
```

A layout's `formats` write a column's values in the grid, tooltips, labels and
value axes alike, as `@basis/ui`'s number components do. A rate or spread is a
fraction, as an API sends it, so `{ bps: true }` writes 0.0025 as `25 bp`,
`{ percent: true }` writes 0.0525 as `5.25%`, `{ thirty_seconds: "halves" }` writes 99.515625 as `99-16+`, and
`{ abbreviate: "millions", suffixes: "par" }` writes $5 million of par as
`5.0MM`.

A bar chart, heatmap, pie or waterfall draws the layout's grouped view: give
the layout `group_by` and `measures`, or give the chart `x` and `y`, which
group by `x` and sum each `y`, split by `series`, as the small-data form does.
One given neither says so in place of the plot.

A layout's `titles` name columns in a chart's legend as in a grid's headers,
and a series split from one plotted column is named by its value alone: a line
of `cumulative_pnl` split by portfolio reads `Core Plus`, not
`cumulative_pnl Core Plus`. A small overview chart that should carry no
drawing tools turns them off with `drawing_tools: false`; they are on by
default, the small-data form's included, and the layout's drawings still show:

```tsx
<Chart
  dataset={pnl}
  layout={{
    titles: { cumulative_pnl: "Cumulative P&L" },
    chart: { kind: "line", x: "date", y: ["cumulative_pnl"], series: "portfolio", drawing_tools: false },
  }}
/>
```

A small chart takes the rows the page already holds, and loads them as a table
of its own, in their order:

```tsx
<Chart rows={exposures} kind="bar" x="sector" y="exposure" />
```

| Prop                     | What it does                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dataset`, `layout`      | The data and the view of it; the layout's `chart` section says what to draw, its `titles` name columns in the legend, and `chart.drawing_tools: false` hides the drawing tools |
| `rows`, `kind`, `x`, `y` | The small-data form: the rows, a value per column, and what to draw of them; `series` splits them, `settings` adds chart settings and `formats` formats the values |
| `onLayoutChange`         | The layout the chart changed: a series hidden from the legend, a zoom, a drawing. Without it, the chart keeps its own changes until its `layout` changes           |
| `onBrush`                | The filters a Shift-drag selects, for a linked view; null once Escape clears it                                                                                    |
| `onSelect`               | The group of a bar, slice or waterfall step clicked, or a scatter's dot by its `id` column, for a linked view; null once the selection is cleared                  |
| `sync`                   | The group whose crosshairs move together: charts of the same dataset, x column and axis by default; null keeps the crosshair to this chart                        |
| `status`                 | The status line under the chart: what it draws, and when the source was read. On by default                                                                       |
| `maximize`               | Maximize, and Alt+Enter, which make the chart fill the window until Escape or Restore: at the end of its legend row, or at its top right corner, shown on hover, where it has none. On by default |
| `label`                  | The chart's name for a screen reader, in place of what it says it draws                                                                                            |

The wheel and `+` and `-` zoom, a drag and the arrows pan, a double-click and
`0` show everything, Delete removes the selected drawing, and Escape drops a
drawing in progress, then the brush, then restores a maximized chart. The pointer, the wheel and the engine's
frames redraw the canvas without a React render: the chart draws outside
React, through its view's handle, and renders again only when its chrome
changes. The plot carries the chart's text alternative: its name says what the
chart draws, and its description the values it shows, as the engine wrote
them.

## The React API

| Export                           | What it does                                                                                                                                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<ParallaxProvider>`             | Starts the engine's worker for the tree inside it (`worker`, `prewarm`), and gives parallax its theme (`theme`, `basisTheme` by default) and scheme (`scheme`, the page's mode by default)                                                         |
| `useDataset(name, source, opts)` | Loads Arrow IPC stream bytes, or a function that returns them or the response itself, as `name`, and returns the load's `status` (`idle`, `loading`, `loaded` or `failed`), `rows`, `error`, `progress` and `reload()`. `opts` are the load's primary key and times |
| `useView(dataset, layout, opts)` | Opens a view of the dataset as the layout describes it, and returns its `status` (`waiting`, `opening`, `open` or `failed`), its latest `frame` and `chart`, its table's status, its `error`, and its `handle`. `opts` are the viewport (null for a chart the engine reduces, which has no rows), the chart window, `onFrame`, which takes each frame in place of `frame`, and `onChart`, which takes each reduction in place of `chart`, so a canvas can paint them without a React render |
| `<Grid>` | A data grid and pivot table of a dataset as a layout describes it; see [Show a grid](#show-a-grid) |
| `<Pivot>` | A pivot table with its settings beside it, and the rows behind a value; see [Pivot a table](#pivot-a-table) |
| `<Chart>` | A chart of a dataset as a layout describes it, or of rows the page holds; see [Draw a chart](#draw-a-chart) |
| `useParallaxTheme()`             | The theme a component draws in, the `attributes` its element carries, and `read(element)`, which reads the tokens in effect and changes whenever they may have                                                                                     |

A changed layout updates the open view in place, and a changed viewport or chart
window asks for that window; neither reopens it. Bytes given to `useDataset`
are copied before they move to the worker, so the app's copy, such as a query
cache's, stays readable; a function's bytes or response move without a copy.

### A large table, as it arrives

A source that returns the response itself, such as `() => fetch(url)`, streams
it: the engine reads each record batch as soon as it has arrived, and a first
load's rows show batch by batch, the first long before the last has come.
On the build host, 1,000,000 trades show their first rows in about a third of
the time the whole table takes. A source that returns bytes shows them once they have all
come. The generated client's Arrow calls answer with a `Blob`, which has
already arrived whole, so a page that wants the first rows sooner fetches the
route itself for now.

```tsx
const trades = useDataset("trades", async () => fetch("/api/trades"), {
  primaryKey: "trade_id",
});
```

While a load is under way, `progress` says where it stands:

| Field          | What it says                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `rows`         | The rows read so far                                                                                                                 |
| `expectedRows` | The rows the load brings: counted when its bytes came whole, estimated from the response's `Content-Length` while it streams, or null |
| `estimated`    | Whether `expectedRows` is an estimate                                                                                                |
| `shown`        | Whether the rows so far show: a first load's do; a reload's views keep the rows before it until it has all arrived and applies whole |

`progress` is null before the first rows and once the load is done. While a
first load arrives, a grid's or pivot's sorts, filters and groups apply to the
rows so far and update as more arrive, and its status bar says how many rows
are still to come, so a total never reads as the whole table's until it is. A
chart waits for the whole load, and an export is refused until it is done. A
reload is checked whole before anything changes, as before: its views show the
rows before it, the status bar says how far it has read, and a refused reload
leaves the rows as they were. A first load refused part of the way, such as by
a key that repeats one in an earlier batch, fails its views with the reason and
leaves no table.

The theme follows `@basis/ui`'s: `basisTheme` gives every token one of
`@basis/ui`'s, and charts take `chart-1` to `chart-8`, the sequential scale and
the diverging scale's red arm. When the page's theme, mode or density changes,
on the root or on any element around a component, or `@basis/ui`'s
`themeChangeEvent` reaches the document, `useParallaxTheme()`'s `read` changes,
and the canvases read their tokens again and draw whole.

### When the engine runs out of memory

A load, pivot or export past the engine's memory traps it. The engine then
starts again, empty, and every view fails with the reason. Each dataset that
was loaded loads again from its source, and its views reopen. A dataset whose
load was under way, most likely the one that ran the engine out of memory,
stays failed with the reason until the app calls `reload` or gives it other
data. If the engine stops a third time within a minute, parallax stops
recovering, and everything stays failed with a reason that says to reload the
page.

## Run the demo

The demo, in [`packages/parallax-demo`](../parallax-demo), is a React app on
`@basis/ui` that runs this package's build as an app does. Its sidebar opens
the positions' pivot, grids of trades and prices, the small tables, data the app
makes itself, a dashboard, the breakdowns, every chart kind, the
technical-analysis page, small charts and the fixed-income page, in the user's
mode and density, with the performance overlay and the theme studio. It needs
the Rust toolchain that `rust-toolchain.toml` names and the `wasm-bindgen`
command-line tool at the version in `Cargo.lock`, as the package's build does.

1. Write its datasets and build it, from anywhere in the repository:

   ```sh
   vp run @basis/parallax-demo#data
   vp run @basis/parallax-demo#build
   ```

   The data task writes the datasets with `parallax-datagen` as Arrow streams
   in `packages/parallax-demo/public/data`: 150,000 positions and 150,000
   trades, at the browser's row limit, daily prices for 50 tickers, the small
   tables' 300 positions and 500 trades, 600 bonds, and October's P&L
   explained by factor for four bond portfolios. The build copies them
   into `dist/` beside the app, and builds `@basis/parallax` first.

2. Serve `packages/parallax-demo/dist` as static files. Its addresses are
   relative and its routes live in the address's hash, so any static file
   server serves it, from any folder, with no rewrites. From
   `packages/parallax-demo`, `vp preview --port 8791` serves it cross-origin
   isolated, which lets the performance overlay measure the whole tab, the
   engine's worker included.

3. Open <http://127.0.0.1:8791>.

Each page fetches the datasets it shows and loads them into the page's engine,
as an app loads its API's answers, and they stay loaded while the demo is open.
`vp run @basis/parallax-demo#e2e` runs its end-to-end specs and compares every
page, in light and dark, pixel for pixel with its screenshots, in Docker, as
[Contributing](CONTRIBUTING.md) says.

## Documentation

- [How parallax is designed](docs/design.md) explains the architecture and
  the correctness rules, and why each choice was made.
- [Roadmap](docs/roadmap.md) lists the milestones, the build order and the
  performance budgets.
- [Themes](docs/theming.md) shows how to apply your own theme, and lists
  every design token.
- [Deferred work](docs/future.md) records what was left out, and why.
- [The grid experiment](docs/grid-experiment.md) records why the grid draws on
  a canvas, with the measurements.

## License

Apache License 2.0. See [LICENSE](LICENSE).
