# Contributing to parallax

## Build and test

Prerequisites:

- [rustup](https://rustup.rs). `rust-toolchain.toml` pins Rust 1.99 with
  `clippy`, `rustfmt` and the `wasm32-unknown-unknown` target. rustup installs
  them on the first `cargo` command, or when you run `rustup toolchain install`.
- [cargo-deny](https://github.com/EmbarkStudios/cargo-deny), for the dependency
  checks.

Run the same checks as CI:

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo deny check licenses bans sources advisories
```

On a machine with little free memory, set `CARGO_BUILD_JOBS=1`. Parallel
`rustc` processes can exhaust memory and get killed by an out-of-memory guard
such as earlyoom.

The WebAssembly tests run in Node. They need `wasm-bindgen-test-runner` from
[wasm-bindgen's releases](https://github.com/wasm-bindgen/wasm-bindgen/releases),
at the same version as `wasm-bindgen` in `Cargo.lock`. `.cargo/config.toml`
makes it the runner for the `wasm32-unknown-unknown` target:

```sh
cargo test -p parallax-wasm --target wasm32-unknown-unknown
```

That test replays the protocol conversation in `parallax-session`'s `testing`
module and checks its fingerprint against the native build's: the browser
engine must answer byte for byte like the native build, which the other tests
check. The other WebAssembly tests load an app's Arrow bytes and export them,
through the methods the browser's worker calls: the row limit, the Excel cell
cap, and CSV in chunks.

## The @basis/parallax package

The TypeScript package beside the crates, in `src/` and `tests/`, is a member of
basis-ui's workspace, and the root `vp check` checks it as it does `@basis/ui`.
Its tasks, run from anywhere in the repository:

```sh
vp run @basis/ui#build        # first: the package type-checks against it
vp run @basis/parallax#wasm   # the engine for the browser, into wasm/
vp run @basis/parallax#build  # vp pack: dist/, the engine and its worker included
vp run @basis/parallax#test   # unit tests in Node, browser tests in Chromium
vp run @basis/parallax#charts-e2e  # the charts' end-to-end specs and screenshots, in Docker
vp run @basis/parallax#grid-e2e    # the grid's
vp run @basis/parallax#pivot-e2e   # the pivot's
vp run @basis/parallax#proto  # buf generate: the protocol's TypeScript, src/proto
```

`wasm` builds `parallax-wasm` for `wasm32-unknown-unknown` in release and runs
`wasm-bindgen --remove-name-section` on it, which needs the Rust toolchain and
the `wasm-bindgen` command as above. It builds with one rustc job unless
`CARGO_BUILD_JOBS` says otherwise, and honours `CARGO_TARGET_DIR`. Vite+
replays it from its cache until the Rust changes. `build` runs it first, and
`test` runs `build` first, since the browser tests run the built worker as an
app gets it. The browser tests need the Chromium that `@basis/ui`'s preset
pins: `vp exec --filter @basis/ui playwright install chromium`.

`proto` regenerates `src/proto/parallax_pb.ts` with `buf generate` and
protoc-gen-es, from `crates/parallax-protocol/proto/parallax.proto`, the file
the Rust compiles, as `buf.gen.yaml` says. The generated file is committed; run
the task after changing the `.proto`, and commit its output with the change. CI
fails when the committed file differs from what the task writes.

`charts-e2e` runs the React charts' Playwright specs in `tests/e2e/charts`
against a small React app, the harness in `tests/e2e/charts/harness`, over the
demo's datasets and the fixed-income page's bonds, which it writes with
`parallax-datagen` into `tests/e2e/charts/data` when they are missing. Text
renders differently from one machine to the next, so it runs Playwright in the
Docker image `mcr.microsoft.com/playwright` of the installed `@playwright/test`
version, against the harness it builds and serves from this machine, and
compares screenshots at threshold 0. Its parity spec compares each chart's
canvas pixel for pixel with the Angular layer's screenshots, recorded in the
same image and kept in `tests/e2e/charts/angular` since step 2.7 deleted that
layer. After an intended change to how charts look, run
`node tests/e2e/charts/run.ts --update-snapshots`, look at the new screenshots,
and commit them.

`grid-e2e` runs the React grid's Playwright specs in `tests/e2e/grid` the same
way, in the same image, against a harness of its own in
`tests/e2e/grid/harness`, over the demo's datasets, which
`tests/e2e/grid/data.sh` writes with `parallax-datagen`:

```sh
vp run @basis/parallax#grid-e2e        # every spec, the screenshots at threshold 0
bash tests/e2e/grid/in-image.sh screenshots --update-snapshots   # from packages/parallax: new screenshots
PARALLAX_PERFORMANCE=1 bash tests/e2e/grid/in-image.sh grid-performance
```

The task runs `tests/e2e/grid/in-image.sh`, which writes the data, builds the
harness, serves it on port 8793 and runs `playwright test` in the image, passing
its arguments on; with `PARALLAX_PREBUILT=1` it takes the data and the harness
as built. Its parity spec compares the grid's canvas pixel for pixel with the
Angular layer's screenshots, kept in `tests/e2e/grid/angular`. Its performance
spec measures scrolling as the Angular layer's did, and runs only when asked. Look
at new screenshots before committing them.

`pivot-e2e` runs the React pivot's Playwright specs in `tests/e2e/pivot` the
same way, in the same image, against its own harness in
`tests/e2e/pivot/harness` on port 8794, over the demo's 150,000 positions,
which `tests/e2e/pivot/data.sh` writes:

```sh
vp run @basis/parallax#pivot-e2e        # every spec, the screenshots at threshold 0
bash tests/e2e/pivot/in-image.sh screenshots --update-snapshots   # from packages/parallax: new screenshots
```

Its parity spec compares the pivot's canvas pixel for pixel with the Angular
pivot's, recorded from the Angular demo in the same image before step 2.7
deleted it, and kept in `tests/e2e/pivot/angular/`.

## The demo

The demo, `@basis/parallax-demo` in `packages/parallax-demo`, is a React app on
`@basis/ui` that runs this package's build, as an app does. Its tasks, run from
anywhere in the repository:

```sh
vp run @basis/parallax-demo#data   # its datasets, with parallax-datagen, into public/data
vp run @basis/parallax-demo#build  # this package's build, then the demo's, into dist/
vp run @basis/parallax-demo#test   # its browser tests, with the engine's real worker
vp run @basis/parallax-demo#e2e    # its end-to-end specs and screenshots, in Docker
```

`e2e` runs `tests/e2e/in-image.sh` in `packages/parallax-demo`, which writes
the data, builds the demo, serves it on port 8791 and runs `playwright test` in
the same image as the harnesses, passing its arguments on; with
`PARALLAX_PREBUILT=1` it takes the data and the build as they are. Its specs
drive the demo's frame and pages, the app's own data with the browser's limits
and an engine that runs out of memory, and compare every page, in light and
dark at the comfortable density, with the screenshots in
`tests/e2e/screenshots` at threshold 0:

```sh
bash tests/e2e/in-image.sh screenshots --update-snapshots   # from packages/parallax-demo: new screenshots
```

Look at new screenshots before committing them.

wasm-bindgen's output in `wasm/` is ignored by git, except its declaration of
the glue, `wasm/parallax_wasm.d.ts`, which is committed so that the package
type-checks before the engine is built. CI fails when a build changes it;
commit the new one with the Rust change that caused it.

## Generate test data

`parallax-datagen` writes reproducible synthetic finance data as Arrow IPC
files. The same seed and options always produce the same values, whatever the
batch size or thread count. To write the milestone 1 datasets:

```sh
cargo build --release -p parallax-datagen
./target/release/parallax-datagen positions --out data/positions.arrow
./target/release/parallax-datagen trades --out data/trades.arrow
./target/release/parallax-datagen prices --out data/prices.arrow
```

The defaults give 5 million positions, 20 million trades, and daily bars for 500
equities from 2016-01-04 to 2026-10-30. `parallax-datagen bonds` writes a book
of 600 investment-grade corporate bonds for the fixed-income charts: each
bond's CUSIP, issuer, sector, rating, coupon, maturity and tenor bucket, its
price, yield, duration and DV01, its spread, its sector's fitted spread curve at
its duration, and how rich or cheap it is to that curve. Add `--hostile` for nulls, NaN,
infinities, negative zero, extreme magnitudes, Unicode and blank tickers, and
wall-clock times that daylight-saving changes make ambiguous or impossible. Add
`--duplicate-key-rate 0.01` for repeated primary keys, and `--stream` for the
Arrow IPC stream format, which the browser's engine loads, rather than the file
format. Run `parallax-datagen <dataset> --help` for every option. `data/` is
ignored by git. The demo's datasets come from the same generator:
`vp run @basis/parallax-demo#data` writes them.

The `golden_rows_are_stable` tests lock the generator's output with hashes. If a
change alters generated values on purpose, update the hashes in the same pull
request and say so in its description. Any stored expectation built from
generated data becomes invalid at that point.

### TA-Lib fixtures

The indicator tests compare the engine with TA-Lib's output, stored in
`crates/parallax-engine/tests/fixtures/talib.json`. The script beside it writes
that file from generated bars with TA-Lib's Python wheel, which bundles the C
library; Python is used for nothing else. To regenerate it after changing the
bars or the parameters it covers, run from that directory:

```sh
uv run generate_talib.py
```

The script pins TA-Lib and NumPy, and the test checks the TA-Lib version
recorded in the file.

## How changes land

1. Work on a branch named for the milestone step, for example
   `m1/engine-core`.
2. For engine behaviour, write the test first. Prefer a differential test against
   DuckDB over hand-written expected values. See
   [How the guarantees are tested](docs/design.md#how-the-guarantees-are-tested).
3. Open a pull request. CI must pass, and the change gets a code review before
   it merges.
4. A change is finished when it is merged to `main`.

## Release

Basis-ui releases parallax with its own version as `@basis/parallax`, one npm
package with the WebAssembly engine and its worker built into it, through its
releases (its roadmap's step 1.8). The Rust crates stay inside this repository
and are not published. Until then, check what npm would receive:

```sh
vp run @basis/parallax#build
cd packages/parallax && vp pm pack -- --dry-run
```

## Dependencies

Only permissive licences are allowed. The list is in `deny.toml`, and
`cargo deny check` enforces it in CI. Add a licence to that list only if it is
permissive, and explain the addition in the pull request.
