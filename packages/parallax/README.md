# parallax

parallax is a data grid, pivot table and charting stack for portfolio managers
and quant researchers. It is a Rust engine, compiled to WebAssembly and run in a
Web Worker in the page, with an Angular front end, built to pivot and chart
tables on GPU-less Citrix desktops without showing a wrong number. The app
loads the data, as Arrow from its own API; one table holds at most 150,000
rows and 70 MB of Arrow.

parallax is moving into basis-ui as `@basis/parallax`; see basis-ui's
[roadmap](../../docs/roadmap.md), phase 2. Its own [roadmap](docs/roadmap.md)
records the milestones it was built in. Nothing is published to npm yet.
[Contributing](CONTRIBUTING.md) shows how to build it and run the tests.

## Run the demo

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
