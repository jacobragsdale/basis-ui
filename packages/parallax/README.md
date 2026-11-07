# @basis/parallax

parallax is a data grid, pivot table and charting stack for portfolio managers
and quant researchers. It is a Rust engine, compiled to WebAssembly and run in a
Web Worker in the page, built to pivot and chart tables on GPU-less Citrix
desktops without showing a wrong number. The app loads the data, as Arrow from
its own API; one table holds at most 150,000 rows and 70 MB of Arrow.

This package, `@basis/parallax`, is the engine with its worker built in, the
framework-free client, and its React layer. App developers install it and never
build Rust. basis-ui's [roadmap](../../docs/roadmap.md), phase 2, builds it:
step 2.5 built the provider, the worker connection and the hooks below, and
step 2.6 ports the grid, pivot and chart components from the Angular layer in
`web/`, which it then deletes. Nothing is published yet; step 2.7 releases it
with basis-ui. parallax's own [roadmap](docs/roadmap.md) records the milestones
it was built in. [Contributing](CONTRIBUTING.md) shows how to build it and run
the tests.

## Show a view in a React app

The app is a basis-ui app, on `@basis/ui`'s preset, which this package depends
on at its own version.

1. Add parallax's stylesheet to the app's `src/styles.css`, after
   `@basis/ui`'s, so that Tailwind generates the classes its components use:

   ```css
   @import "@basis/ui/styles.css";
   @import "@basis/parallax/styles.css";
   ```

2. Start the engine's worker in a provider around the part of the app that
   shows parallax. Vite bundles the worker and the engine beside it from the
   `?worker` import:

   ```tsx
   import { ParallaxProvider } from "@basis/parallax";
   import ParallaxWorker from "@basis/parallax/worker?worker";

   const startParallax = (): Worker => new ParallaxWorker();

   function App(): ReactNode {
     return (
       <ParallaxProvider worker={startParallax} prewarm>
         <Positions />
       </ParallaxProvider>
     );
   }
   ```

   `prewarm` starts the worker at once, so the first rows show sooner; every
   page under the provider then downloads the engine, about 1 MB compressed.
   Unmounting the provider ends the worker and frees its memory.

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

   Step 2.6's grid, pivot and chart components take the dataset and a layout,
   and draw the view's frames.

## Draw a chart

`<Chart>` draws every chart of the firm's apps on a Canvas 2D surface: line,
area, bar (across, stacked, or on two axes), scatter as a density, heatmap,
histogram, candlestick, OHLC, pie and donut, on a value or trading-time axis,
with technical-analysis indicators and panes, drawings, a compare mode and
events. Give it a dataset that `useDataset` loads and a layout whose `chart`
section says what to draw:

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

A small chart takes the rows the page already holds, and loads them as a table
of its own, in their order:

```tsx
<Chart rows={exposures} kind="bar" x="sector" y="exposure" />
```

| Prop                     | What it does                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dataset`, `layout`      | The data and the view of it; the layout's `chart` section says what to draw                                                                                       |
| `rows`, `kind`, `x`, `y` | The small-data form: the rows, a value per column, and what to draw of them; `series` splits them, `settings` adds chart settings and `formats` formats the values |
| `onLayoutChange`         | The layout the chart changed: a series hidden from the legend, a zoom, a drawing. Without it, the chart keeps its own changes until its `layout` changes           |
| `onBrush`                | The filters a Shift-drag selects, for a linked view; null once Escape clears it                                                                                    |
| `onSelect`               | The group of a bar or slice clicked, for a linked view; null once the selection is cleared                                                                        |
| `sync`                   | The group whose crosshairs move together: charts of the same dataset, x column and axis by default; null keeps the crosshair to this chart                        |
| `status`                 | The status line under the chart: what it draws, and when the source was read. On by default                                                                       |
| `label`                  | The chart's name for a screen reader, in place of what it says it draws                                                                                            |

The wheel and `+` and `-` zoom, a drag and the arrows pan, a double-click and
`0` show everything, Delete removes the selected drawing, and Escape drops a
drawing in progress, then the brush. The pointer, the wheel and the engine's
frames redraw the canvas without a React render: the chart draws outside
React, through its view's handle, and renders again only when its chrome
changes. The plot carries the chart's text alternative: its name says what the
chart draws, and its description the values it shows, as the engine wrote
them.

## The React API

| Export                           | What it does                                                                                                                                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<ParallaxProvider>`             | Starts the engine's worker for the tree inside it (`worker`, `prewarm`), and gives parallax its theme (`theme`, `basisTheme` by default) and scheme (`scheme`, the page's mode by default)                                                         |
| `useDataset(name, source, opts)` | Loads Arrow IPC stream bytes, or a function that returns them, as `name`, and returns the load's `status` (`idle`, `loading`, `loaded` or `failed`), `rows`, `error` and `reload()`. `opts` are the load's primary key and times                  |
| `useView(dataset, layout, opts)` | Opens a view of the dataset as the layout describes it, and returns its `status` (`waiting`, `opening`, `open` or `failed`), its latest `frame` and `chart`, its table's status, its `error`, and its `handle`. `opts` are the viewport (null for a chart the engine reduces, which has no rows), the chart window, and `onChart`, which takes each reduction in place of `chart`, so a canvas can paint it without a React render |
| `<Chart>`                        | A chart of a dataset as a layout describes it, or of rows the page holds; see [Draw a chart](#draw-a-chart)                                                                                                                                        |
| `useParallaxTheme()`             | The theme a component draws in, the `attributes` its element carries, and `read(element)`, which reads the tokens in effect and changes whenever they may have                                                                                     |

A changed layout updates the open view in place, and a changed viewport or chart
window asks for that window; neither reopens it. Bytes given to `useDataset`
are copied before they move to the worker, so the app's copy, such as a query
cache's, stays readable; a function's bytes move without a copy.

The theme follows `@basis/ui`'s: `basisTheme` gives every token one of
`@basis/ui`'s, and charts take `chart-1` to `chart-8`, the sequential scale and
the diverging scale's red arm. When the page's mode or density changes,
`useParallaxTheme()`'s `read` changes, and the canvases read their tokens again.

### When the engine runs out of memory

A load, pivot or export past the engine's memory traps it. The engine then
starts again, empty, and every view fails with the reason. Each dataset that
was loaded loads again from its source, and its views reopen. A dataset whose
load was under way, most likely the one that ran the engine out of memory,
stays failed with the reason until the app calls `reload` or gives it other
data. If the engine stops a third time within a minute, parallax stops
recovering, and everything stays failed with a reason that says to reload the
page.

## The Angular layer

Until step 2.6 deletes it, `web/` holds the Angular components and the demo,
with their own copies of the client, and their own checks.

### Run the demo

The demo shows the grid, pivot and charts over generated positions, trades and
prices, with a performance overlay. It needs the Rust toolchain that
`rust-toolchain.toml` names, the `wasm-bindgen` command-line tool at the version
in `Cargo.lock`, Node.js 24 and pnpm.

1. Build the browser engine, the demo's data and the demo, from `web`:

   ```sh
   pnpm install
   pnpm build:wasm
   pnpm build:data
   pnpm build:demo
   ```

   `pnpm build:data` generates the datasets with `parallax-datagen` as Arrow
   streams in `projects/demo/public/data`: 150,000 positions and 150,000
   trades, at the browser's row limit, daily prices for 50 tickers, and the
   small tables' 300 positions and 500 trades.

2. Serve the built demo as static files:

   ```sh
   pnpm serve:demo
   ```

3. Open <http://127.0.0.1:8791>.

Each page fetches the datasets it shows and loads them into the page's engine,
as an app loads its API's answers. `pnpm e2e`, run from `web`, tests the demo in
Chromium with the GPU off, serving the build from step 1 if nothing answers on
port 8791 yet.

`pnpm screenshots`, also run from `web`, compares every chart in the demo, in
both themes, pixel for pixel with the screenshots in `web/e2e/screenshots`.
Text renders differently from one machine to the next, so it runs Playwright in
the Docker image `mcr.microsoft.com/playwright` of the installed
`@playwright/test` version, against the demo it serves from this machine;
`pnpm e2e:image` runs every end-to-end spec that way, as CI does. Both need
Docker, build the wasm worker, the data and the demo first, and refuse to run
while something else answers on port 8791, which could be serving an older
build. After an intended change to how charts look, run
`pnpm screenshots --update-snapshots`, look at the new screenshots, and commit
them.

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
