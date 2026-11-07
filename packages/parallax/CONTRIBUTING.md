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
```

`wasm` builds `parallax-wasm` for `wasm32-unknown-unknown` in release and runs
`wasm-bindgen --remove-name-section` on it, which needs the Rust toolchain and
the `wasm-bindgen` command as above. It builds with one rustc job unless
`CARGO_BUILD_JOBS` says otherwise, and honours `CARGO_TARGET_DIR`. Vite+
replays it from its cache until the Rust changes. `build` runs it first, and
`test` runs `build` first, since the browser tests run the built worker as an
app gets it. The browser tests need the Chromium that `@basis/ui`'s preset
pins: `vp exec --filter @basis/ui playwright install chromium`.

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
equities from 2016-01-04 to 2026-10-30. Add `--hostile` for nulls, NaN,
infinities, negative zero, extreme magnitudes, Unicode and blank tickers, and
wall-clock times that daylight-saving changes make ambiguous or impossible. Add
`--duplicate-key-rate 0.01` for repeated primary keys, and `--stream` for the
Arrow IPC stream format, which the browser's engine loads, rather than the file
format. Run `parallax-datagen <dataset> --help` for every option. `data/` is
ignored by git. The demo's datasets come from the same generator:
`pnpm build:data`, run from `web`, writes them.

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
package with the WebAssembly engine and its worker built into it; its roadmap's
step 2.7 sets that up. The Rust crates stay inside this repository and are not
published. Until then, check what npm would receive:

```sh
vp run @basis/parallax#build
cd packages/parallax && vp pm pack -- --dry-run
```

## Dependencies

Only permissive licences are allowed. The list is in `deny.toml`, and
`cargo deny check` enforces it in CI. Add a licence to that list only if it is
permissive, and explain the addition in the pull request.
