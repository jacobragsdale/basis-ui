# Roadmap

This roadmap lists the milestones, the build order within milestone 1, and the
performance budgets that decide when a milestone is done. For the reasons
behind the design, see [How parallax is designed](design.md).

## Milestones

| Milestone | Scope |
|---|---|
| 1 | Engine, grid, pivot, Excel export, and connectors for SQL Server (including JSON columns), Oracle Database, Parquet, MongoDB and HTTP (existing REST GETs). Angular package and demo app. |
| 2 | Charts: line, area, bar (vertical or horizontal, grouped or stacked), scatter as density, heatmap, histogram, candlestick and OHLC. Crosshair with synced tooltips, wheel and drag zoom and pan, a range brush that filters linked views, legend toggling, two y-axes, log scale, and a trading-time axis driven by a per-dataset trading calendar. |
| 3 | Technical-analysis tools, described in [Milestone 3 tools](#milestone-3-tools). |
| 4 | Grids and pivots for everyday use: search, Excel-style column filters, hiding, reordering and pinning columns, a totals row, grouping from the grid, export from a toolbar, a reworked pivot field list, pie and donut charts, and tables of a few hundred rows that feel instant. |

Releases are semver 0.x until milestone 3. Each milestone publishes
`@jacobragsdale/parallax` to npm and the `parallax-*` crates to crates.io.

## Milestone 3 tools

- **Indicators:** SMA, EMA, WMA, Bollinger Bands, RSI, MACD, ATR, VWAP,
  stochastic and volume. Each is checked against TA-Lib.
- **Panes:** stacked price and indicator panes with synced zoom.
- **Drawing tools:** trend line, horizontal line, Fibonacci retracement,
  rectangle and text note, saved in the layout.
- **Other tools:** compare mode, which normalizes series to percentage change
  from the start; event markers; and a measure tool.

## Milestone 3 build order

1. Indicators in the engine: SMA, EMA, WMA, Bollinger Bands, RSI, MACD, ATR,
   VWAP and stochastic, computed per series over every row before the chart is
   reduced, compared with TA-Lib; volume summed exactly per candle.
2. Indicators in the layout, the protocol and the session, with chart frames
   that carry each indicator line with the engine's text.
3. Panes in `<px-chart>`: price and indicator panes stacked on one x axis, with
   shared zoom, pan and crosshair, bands, the MACD histogram, oscillator guides
   and volume bars.
4. Drawing tools: trend line, horizontal line, Fibonacci retracement, rectangle
   and text note, anchored to data values and saved in the layout.
5. Compare mode, event markers and the measure tool.
6. The demo's technical-analysis page, with screenshots, and the release,
   whose publishing the maintainer does by hand; see
   [Release](../CONTRIBUTING.md#release).

## Milestone 4 build order

Most tables hold a few hundred rows, so their speed is measured first and
checked at every step after.

1. Small tables: a baseline, measured in the demo; see
   [Small tables](#small-tables).
2. Small tables: fewer round trips. Every layout change is answered with the
   rows to draw, one change is in flight at a time, and small views are fetched
   whole.
3. Engine: search, and text filters that test each dictionary entry once.
4. Engine: totals, and column changes that don't recompute the rows.
5. Engine: detail groups, whose innermost groups show their rows.
6. Engine: totals on the group rows of detail groups.
7. Layout version 2, the protocol and the session.
8. Excel export of titles, pinned columns, totals and detail groups.
9. The grid's toolbar: search, filter chips and export.
10. Excel-style header menus.
11. Columns: the chooser, reordering, pinning, the totals row and fitted widths.
12. Grouping from the grid.
13. The pivot's field list, toolbar and header menus.
14. Pie and donut charts, small charts, and filtering a grid from a chart.
15. The demo, the documentation and the release.

## Milestone 1 build order

1. Repository, CI, licence checks and the synthetic data generator.
2. Engine core, with the DuckDB differential test suite.
3. Server, protocol and the WebAssembly build, with tests that the native and
   WebAssembly builds return identical results.
4. The grid experiment: canvas against virtualized DOM, measured, and the
   choice between them.
5. Grid features, pivot UI and layouts.
6. Excel export, with read-back tests.
7. Connectors:
   - SQL Server, including JSON columns
   - Oracle Database, through the same ODBC path
   - Parquet, with the NFS cache
   - MongoDB
   - HTTP, pulling from existing REST GETs as Arrow or JSON
8. The Angular package, the demo app and the Playwright suite.

Milestone 1 is done when all of the following hold:

- Every budget in [Performance budgets](#performance-budgets) is met on the
  benchmark host.
- Every test layer passes in CI.
- The demo has run on a real Citrix VDI.

## Milestone 2 build order

1. Chart reductions in the engine: M4 series, densities, histogram bins and
   OHLC buckets, the trading-time axis on the NYSE calendar, and x-axis ticks
   with their labels.
2. Charts in the layout, the protocol and the session, with chart frames that
   carry each value's exact text, and the native and WebAssembly transcripts.
3. `<px-chart>`: Canvas 2D renderers for line, area, bar (vertical or
   horizontal, grouped or stacked), scatter density, heatmap, histogram,
   candlestick and OHLC, with the legend, two y-axes and a log scale.
4. Interaction: the crosshair with tooltips synced across charts, wheel and
   drag zoom and pan, and the range brush that filters linked views.
5. Charts in the demo, with Playwright screenshots in Chromium without a GPU,
   compared pixel for pixel in the pinned Playwright Docker image.

Milestone 2 is done when every chart kind draws from reduced data in the demo
and every test layer passes in CI.

## Target data for milestone 1

The generator produces two datasets for milestone 1:

- **Positions:** 5 million lots by 40 columns, covering fund, strategy, PM,
  sector, country, currency, ticker, quantity, price, market value, cost,
  unrealized and daily P&L, weights and risk measures. The reference pivot is
  fund → strategy → sector → ticker by asset class, showing market value, P&L
  and weight.
- **Trades:** 20 million rows, which exercise the scroll and filter budgets.

The design envelope covers:

| Quantity | Design target |
|---|---|
| Largest table held on the server | 20 million rows × 60 columns |
| Largest table held in the browser | 5 million rows × 40 columns |
| Distinct values in a text column | about 10,000 |
| Concurrent users per server | 50 |

## Performance budgets

These are starting targets, revised after measurement. Benchmarks run nightly
on one fixed machine and are tracked over time. Shared CI runners are too noisy
for these numbers.

| Measure | Budget |
|---|---|
| Browser tab memory, server-held view | ≤ 300 MB |
| Main-thread time per frame | ≤ 8 ms |
| Redraw rate | ≤ 30 frames per second |
| First paint of a 20-million-row server view | ≤ 300 ms |
| Regroup or re-pivot of 20 million rows | ≤ 500 ms |
| Server memory | ≤ 1.5 × the raw Arrow size of loaded tables |
| Excel export, 1 million rows × 40 columns | ≤ 30 s |

On the build host, single-threaded, an Excel export of 1,000,000 generated
positions by 40 columns took 28.0 s and the same CSV 8.1 s (2026-11-02).

Grouped views build on 16 threads of the build host. Its timings vary about
twofold under load, so these are the best of three runs (2026-11-02):

| Grouped view of generated positions | 1M rows | 2.5M rows |
|---|---|---|
| Count by fund | 5 ms | 23 ms |
| Three sums by fund | 11 ms | 44 ms |
| Three sums by fund, strategy, sector and ticker | 121 ms | 261 ms |
| The reference pivot: those groups by asset class | 217 ms | 426 ms |

The reference pivot took 1,045 ms at 1M rows before the build went leaf-first and
parallel. Groupings with few groups are on course for the 500 ms budget at 20M
rows. The reference pivot, with about 150,000 leaf groups at 1M rows, is not:
its time now goes to building one tree node per group, which needs a more
compact tree to come down further. The build host has too little free memory to
load 20M rows, so the budget is still unmeasured at that size.

The demo's initial bundle is 657 kB, 186 kB with gzip (2026-11-03), so the
build, which warns above 600 kB, now warns. Zod's tree-shakable build had cut
it from 981 kB to 558 kB on 2026-11-02, when Apache Arrow's JavaScript was
204 kB of it and Angular 126 kB. The charts and technical-analysis tools of
milestones 2 and 3 have landed since.

### Small tables

Most tables hold a few hundred rows, and at that size every change should feel
instant. These budgets hold with the CPU throttled four times, as a stand-in for
a Citrix desktop:

| Measure | Budget |
|---|---|
| First rows of a table of a few hundred rows, after its grid opens the view | ≤ 150 ms |
| A sort, filter or search of such a table, from the input to the screen | ≤ 50 ms |

The demo's performance overlay shows both figures for every grid on the page.
The figures below were taken on the build host on 2026-11-03, in headless
Chromium without a GPU, with the server on the same machine. First rows are the
median of five loads with an empty cache and five reloads with a full one.
Sorts are 20 clicks on a header. Each table had the page to itself.

The baseline, before any change for small tables:

| Table | Held | First rows, empty cache | First rows, cached | Sort, median and p95 |
|---|---|---|---|---|
| `book`, 300 positions | in the browser | 233 ms | 115 ms | 30 ms, 32 ms |
| `blotter`, 500 trades | on the server | 133 ms | 84 ms | 33 ms, 36 ms |
| `trades`, 1,000,000 trades | on the server | 133 ms | 89 ms | 34 ms, 38 ms |

Unthrottled, the same figures were 151 ms, 49 ms and 19 ms for the book;
29 ms, 12 ms and 20 ms for the blotter; and 35 ms, 24 ms and 27 ms for the
trades. It showed three things:

- Sorts already met the budget at every size and in both places. They take
  about one frame unthrottled and two throttled, because the answer is drawn at
  the next animation frame.
- A table held in the browser opened slower than the same size on the server,
  because the worker, the WebAssembly engine and the copy all started first.
  With an empty cache it missed the budget.
- On the Small tables page, the book's start also slowed the blotter beside it:
  its cached first rows took 56 ms instead of 12 ms, unthrottled.

After step 2, with fewer round trips:

| Table | Held | First rows, empty cache | First rows, cached | Sort, median and p95 |
|---|---|---|---|---|
| `book`, 300 positions | in the browser | 135 ms | 101 ms | 31 ms, 34 ms |
| `blotter`, 500 trades | on the server | 122 ms | 83 ms | 39 ms, 45 ms |
| `trades`, 1,000,000 trades | on the server | 138 ms | 92 ms | 33 ms, 39 ms |

Unthrottled, the figures were 59 ms, 49 ms and 20 ms for the book; 28 ms,
14 ms and 21 ms for the blotter; and 36 ms, 24 ms and 27 ms for the trades.
Every figure for a table on a page of its own now meets its budget. Side by
side on the Small tables page, with an empty cache, each table's first rows
took 153 ms and 155 ms.

- **Prewarming.** With the CPU throttled and an empty cache, the book's first
  rows had waited 57 ms for the socket's welcome before the worker even
  started. Then they waited 67 ms for the worker to start and 54 ms for the
  engine to download. The demo now starts the worker when the application
  starts (`prewarm: true`), so the engine loads while the socket connects. The
  book's first rows came 372 ms after the page began loading instead of 510 ms.
- **Cache headers on the engine** weren't added. Compiling it took at most
  15 ms, and with a full cache it loaded without any transfer.
- **The book and the blotter** were slowed by Nagle's algorithm, not by each
  other. The blotter's first frame waited 44 ms for the browser to acknowledge
  the ViewOpened sent just before it. The server now turns Nagle's algorithm
  off on every connection, and the blotter's cached first rows take 14 ms
  beside the book, as alone. Windows, which Citrix desktops run, can delay an
  acknowledgement by up to 200 ms.
- **Fetching small views whole** lets them scroll, and lets a search that left
  them small be cleared, with no request. It makes each change's answer
  larger: the blotter's is about 360 kB, where its rows in view were about
  27 kB. Decoding every text cell of such a frame made the blotter's sorts
  take 49 ms, p95 55 ms. The grid now decodes text only when it draws it,
  which saved about 14 ms a sort. Reading the larger frame still costs the
  blotter about 6 ms a sort, throttled, against the baseline.
- **Every change is answered with the rows to draw.** A change carries the
  grid's window, so no grid asks twice, and a filter or search that leaves
  fewer rows than were scrolled past is answered from the top. Only one change
  is in flight at a time, and only the newest waits, so the value picker
  searches on every keystroke instead of after a 200 ms pause.

A budget for live updates, 10,000 row updates per second with a p99 of
≤ 250 ms from update to screen, waits until a streaming source exists. See
[Deferred work](future.md).

## Verification on a VDI

The demo app has a performance overlay, opened by its **Performance** button.
It shows frame time and the main-thread time blocked by long frames. For each
grid on the page, it shows the drawing time per frame, the time to the first
rows, the time from an input such as a click or a keystroke to drawing the
change it made, and the time from asking for rows to drawing them. It also shows
tab memory. A **Copy report** button copies those figures with the browser and
window they were taken on. Tab memory covers the whole tab, worker included,
only when the server sends `cross_origin_isolated` headers and the page is a
secure context (HTTPS or localhost); otherwise it is Chromium's JavaScript heap
for the page, and the report says which. At each milestone the demo runs on a Citrix VDI
against a test deployment, and the copied report joins the benchmark history
next to the benchmark host's figures. The Excel verification workbook is opened
on the same VDI.
