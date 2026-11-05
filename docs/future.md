# Deferred work

Each item here was considered during design on 2026-11-02 and deliberately left
out of the current milestones. Each one lists the reason it waits and any
research already done.

## Data sources

- **Data lake connector.** Which lake is in use (ADLS Gen2, S3, Databricks or
  Delta, Fabric OneLake) is unknown. The `object_store` crate covers the object
  stores once the lake is known.
- **Snowflake.** The planned move to Snowflake hasn't happened yet. Its ADBC
  driver moved from Apache Arrow to the ADBC Driver Foundry in ADBC 24
  (2026-07-28). `adbc_core` 0.25 is the Rust entry point.
- **Live sources and RabbitMQ.** No streaming source exists, although RabbitMQ
  has been used before. When one arrives, it gets an adapter on the ingest
  interface, along with the live-update budget of 10,000 row updates per second
  with a p99 of ≤ 250 ms from update to screen.
- **Converting JSON inside SQL Server.** `OPENJSON ... WITH` could move JSON
  conversion onto the database server. The first milestone converts JSON in
  Rust, with the same code that handles MongoDB documents.
- **Arrays in documents.** All arrays are rejected for now, because the engine
  has no list columns. Arrays of scalars need list columns in the engine and the
  grid; arrays of objects also need a choice between exploding them into child
  rows and using Arrow struct lists.

## Engine

- **Computed columns.** A small expression language compiled into column
  operations. Planned for v2.
- **Running views as SQL in another engine.** View configurations would be
  translated to SQL for DuckDB or ClickHouse, as Perspective's virtual servers
  do.
- **Refreshing copies in the browser.** A copy is fetched once per page, so a
  reload on the server reaches a browser-held view only when the page reloads.
  Pushing reloads to copies, as a diff, waits until pages stay open long enough
  for it to matter. Copies are also never evicted from the worker during a page's
  life.
- **Browser threads and 64-bit WebAssembly memory.** Rust's
  `wasm64-unknown-unknown` target is Tier 3. Threads need nightly Rust,
  `-Z build-std` and cross-origin isolation headers. Revisit if a
  browser-resident dataset outgrows 4 GB or one thread.

## Interface

- **Cell editing and writeback.**
- **Native Excel pivot tables.** `rust_xlsxwriter` 0.102 doesn't write them.
  Supporting them means writing the pivot cache and pivot table parts of the
  file format directly.
- **Screen-reader accessibility.** Not required for the first milestone. The
  grid experiment's choice between canvas and DOM affects the cost.

## Grids, pivots and charts

Left out of milestone 4 (2026-11-03 to 2026-11-04), for the reasons given.

- **Searching the display text of number columns.** Search tests each
  dictionary entry of a text column once, which is what keeps it fast; number
  columns have no dictionary, and their text depends on the format. A search
  for "1.5M" would have to format every value first.
- **A date tree in the filter list.** Excel groups dates by year, month and
  day. The list shows each date as a value for now.
- **Exporting only the selected cells.** Export writes the whole view, which is
  what the screen's filters, search and totals describe; copying covers a
  selection.
- **Running sessions concurrently on one socket.** One socket runs one message
  at a time, so a small grid can wait behind a heavy rebuild on the same page.
  The overlay's report hasn't shown it mattering.
- **Opening a browser-held view on the server while its copy loads.** The first
  rows of a browser-held table wait for the worker and the copy. Prewarming made
  the wait small enough to meet the budget.
- **Hiding a grouped column.** DevExtreme hides a column from the data area
  when the grid is grouped by it (`showWhenGrouped`); parallax keeps it shown,
  so the export and the clipboard keep every column. Whether to follow
  DevExtreme is a choice for the users.
- **Selecting a chart's group from the keyboard.** A bar or slice is selected
  by clicking it. The legend's buttons, which the keyboard reaches, hide and
  show groups rather than select them.
- **A chart's selection following its linked grid.** The dashboard turns a
  selection into a grid filter; removing that filter's chip in the grid leaves
  the chart's selection showing until it is clicked again.

Left out of milestone 5 (2026-11-04), for the reasons given.

- **Two-tier pivot column headers.** A split pivot's headers read
  `Bond | sum(market_value_usd)`; a row of split values over a row of measures
  would read better. The engine makes the titles, and the export shares them,
  so the change belongs in both.
- **Friendlier default measure titles.** The field list says "Sum of
  market_value_usd" where the header says `sum(market_value_usd)`. Making them
  agree is also an engine and export change.
- **Animation on the canvas.** Transitions would redraw every frame, and on a
  Citrix desktop every frame crosses the network.
- **Bundled fonts.** The components use the system's fonts, which are Segoe UI
  on the Windows desktops parallax targets; any other font is a one-line token.
  Bundling one would make every application serve the files.
- **Light and dark values in the theme studio.** The demo's studio sets one
  value for both schemes; `light-dark()` in CSS, or `light` and `dark` in
  `defineTheme`, give each its own.
- **Startup cost of the new look.** With the refined look, a small table's
  first rows came about 5 to 8 ms later at a 4× CPU throttle, about 2 ms
  unthrottled, in an interleaved comparison with the previous build. Switching
  off the toolbar's container query, the `color-mix()` derivations or the
  themed scrollbars one at a time didn't single out a cause; the budgets are
  still met.

## Clients

- **Python package with Streamlit and Dash components.** Python is dropped for
  now, but these findings from 2026-11-02 still apply:
  - PyO3 0.30.1, maturin 1.16.0 and `pyo3-arrow` 0.20.0 can expose the engine,
    server and export without copying data from polars or pyarrow.
  - Streamlit 1.66 Components v2 render inside the page without an iframe and
    pass Streamlit's theme through CSS custom properties. A custom-element
    build of the Angular components could mount there directly.
  - Dash 4.5 components must be React, so Dash needs a thin React wrapper
    around the same custom element.
  - The components must talk to the engine over their own WebSocket. Routing
    scroll and pivot traffic through Python would rerun Streamlit scripts and
    fire Dash callbacks.
  - Dash under gunicorn runs several workers, so it needs a client mode that
    connects to a separate server. Single-process Streamlit can run the server
    inside Python.
  - A server started from Python needs at least localhost binding and
    unguessable per-view tokens, because the library has no auth.
- **Jupyter widget.** Not wanted.
