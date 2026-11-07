# Spike 0.3: parallax alone

Parallax works with no server. An app's Arrow bytes move into the engine's worker, pivot there with replies identical
byte for byte to the native engine's, and export to xlsx and CSV files that read back cell for cell. The proposed row
limit is **150,000 positions-shaped rows** (40 columns, about 69 MB of Arrow), set by the pivot budget under a rough
4x CPU proxy. The Citrix repeat sets the final figure. A page with one small chart draws it 89 ms after navigation with
an empty cache and 57 ms with a full one on this host, and about 0.5 s and 0.3 s under the proxy. Run on 2026-11-07.

## Versions

- Parallax `main` at `63f4331`, with the spike's changes on branch `0.3-parallax-alone` at `3d25dd4`: the code in
  `b77a8c0`, the built pages in `2a889f9`, and the page's report kept across a crashed tab in `3d25dd4`.
- Rust 1.99.1 (parallax's `rust-toolchain.toml`), wasm-bindgen 0.2.130, arrow-rs 60.1.0, rust_xlsxwriter 0.102.0
  with zip 9.2.2.
- Node 26.13.0, pnpm 12.11.2, esbuild 0.28.2, apache-arrow 21.2.0, @bufbuild/protobuf 2.16.0 and zod 4.6.7.
- Playwright 1.64.1 with Chrome for Testing 156.0.8078.4, headless shell, launched with parallax's end-to-end flags:
  `--disable-gpu --disable-gpu-compositing --disable-software-rasterizer`. WebGL is unavailable in it, as on the
  desktops.
- twiggy 0.8.0, and binaryen 131.0.0 from npm, installed in a scratch folder.
- uv 0.13.6 with Python 3.14.7, openpyxl 3.1.5, DuckDB 2.0.0 and pyarrow 26.0.1.
- The build host: Debian 13.7 on an AMD Ryzen 7 8745HS (8 cores, 16 threads), about 9 GB of free memory, with about
  20 containers running.

## Setup

The spike's code is in parallax's `web/spike/` and in two crates:

| Path                                                                                                                             | What it is                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crates/parallax-export`                                                                                                         | Builds for wasm32: target-specific rust_xlsxwriter features, and in WebAssembly every sheet held in memory                                              |
| `crates/parallax-wasm`                                                                                                           | `exportXlsx` and `exportCsv`; `loadTableInPlace`, an experiment; `generatePositions` behind a `datagen` feature that the published engine never enables |
| `crates/parallax-wasm/examples/spike_native.rs`                                                                                  | The native half of the comparison: the same rows, loaded the same way, replaying the page's recorded messages                                           |
| `web/projects/parallax/worker/worker.ts`, `src/lib/browser-engine.ts`                                                            | The worker's `load` and `export` messages, and `BrowserEngine.load()` and `.export()`                                                                   |
| `web/spike/harness.ts`, `index.html`                                                                                             | The measurement page: generate, load, pivot and export, with a Run button that reports every size                                                       |
| `web/spike/chart.ts`, `chart.html`                                                                                               | A page whose only parallax content is one 100-point line chart                                                                                          |
| `web/spike/server.mjs`                                                                                                           | A static server for `web/spike/dist`, with brotli 11 or gzip 9 and an hour's caching                                                                    |
| `web/spike/measure-rows.mjs`, `measure-chart.mjs`, `compare.mjs`, `oom.mjs`, `throttle-check.mjs`, `run-page.mjs`, `readback.py` | The Playwright and Python drivers behind every table here                                                                                               |
| `web/spike/build.sh`                                                                                                             | Builds the engine, the generator and the pages into `web/spike/dist`, which is committed for the Citrix repeat                                          |

The data are parallax-datagen's positions: seed 42, 10,000 securities, 40 columns, about 460 bytes a row as Arrow. The
page generates them in a worker of its own, from a WebAssembly build of the generator, and moves the bytes to the
page as an `ArrayBuffer`, as an API response would arrive. The same function, run natively, writes the same bytes.
Every page is served from 127.0.0.1, so downloads take no network time. Timings are the fewest milliseconds of several
runs, since this host's timings vary up to twofold under load.

Every command below runs from parallax's `web/`, after `bash spike/build.sh` and with
`node spike/server.mjs` running (port 8797, brotli). `spike_native` is
`cargo run --release -p parallax-wasm --features datagen --example spike_native --`.

**CDP throttling does not reach the worker.** `Emulation.setCPUThrottlingRate` at 4x slowed a busy loop on the page
from 27 ms to 94 ms but left the worker's pivot at 157 to 161 ms (173 ms unthrottled), and the worker's own DevTools
target refuses it: "Operation is only supported for pages, not workers" (`node spike/throttle-check.mjs`). So the
engine's 4x proxy is a CPU quota on the whole browser instead: `systemd-run --user --scope -p CPUQuota=40%
-p CPUQuotaPeriodSec=10ms`. It made the engine's loads and pivots 3.6 to 4.1 times slower than unthrottled. It is a
rough proxy for a Citrix desktop, not a measurement of one. Parallax's own 4x figures for tables held in the browser
were throttled through DevTools, so only the page's main thread was slowed.

## Answers

| Question                                                                                              | Answer                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Can Arrow bytes reach the worker with no server, load, pivot, and match the native engine?         | **Yes.** The bytes move with the message, and five pivots' 126,697 bytes of replies are identical to the native session's.                                                                                       |
| 2. Does `parallax-export` build for wasm32 in memory, and does a Blob download of its xlsx read back? | **Yes.** Every cell, number format, outline level, frozen pane and width matches the native file. It adds 288 kB brotli (40%) to the wasm.                                                                       |
| 3. What is the largest positions table within the budgets, without a GPU?                             | **150,000 rows** under the 4x proxy, and 500,000 unthrottled, by the 500 ms re-pivot budget. **No** for the roadmap's 5,000,000-row browser target, and **no** for the 300 MB tab budget past about 80,000 rows. |
| 4. How long does a page with one small chart take, and is it too slow, so that Recharts is needed?    | Drawn **89 ms** after navigation cold and **57 ms** warm, unthrottled; **506 ms** and **320 ms** under the proxy. **No**, it is not too slow.                                                                    |
| 5. What is the wasm made of, and is there an obvious cut?                                             | A quarter is function names, a fifth Arrow, an eighth the export. **Yes:** removing the name section cuts 25% raw and 8% brotli at no cost in speed.                                                             |

### 1. Arrow bytes into the worker

What existed: the wasm `Worker.loadTable(name, bytes, primaryKey, nowMicros, sourceAsOfMicros)` already loads an Arrow
IPC stream, and the worker's `Connection` already says hello to the wasm session with no server.
Nothing called `loadTable`: the worker took only `copy`, which fetched `/copy/{dataset}`, and `message`. And
`placeView` asks the server's `Connection` whether a dataset belongs in the browser before it uses the worker.

What was added: a `load` message carrying an `ArrayBuffer` in its transfer list, so the buffer moves to the worker
instead of being copied; `BrowserEngine.load(dataset, bytes, options)`, which answers with the rows, the engine's
time and its memory; and a transfer option on `WorkerPort.postMessage`. Posting 460 MB took at most 0.5 ms of the
page's time.

The check, from `web/`, with `spike/server.mjs` running:

```sh
node spike/compare.mjs --rows 100000 --out DIR
spike_native 100000 DIR --messages DIR/browser-outbound.bin --export "outlined=$OUTLINED" --export "flat=$FLAT"
sha256sum DIR/positions.arrows
cmp DIR/browser-replies.bin DIR/native-replies.bin && echo "REPLIES BYTE-IDENTICAL: $(stat -c %s DIR/native-replies.bin) bytes"
```

`$OUTLINED` and `$FLAT` are the layouts of those names in `spike/harness.ts`.

The page generated bytes with SHA-256 `dc42d4994837fd92…`, and the native run wrote a file with the same hash. The
page opened the reference pivot, a three-level pivot, a regroup and a three-sum pivot, and changed one pivot in
place, while recording every message. Replayed natively against the same rows, the session's replies were
identical: `REPLIES BYTE-IDENTICAL: 126697 bytes`. The same held at 25,000 rows. As a check outside parallax, DuckDB's
sum of `market_value_usd` by fund equals the browser's xlsx totals for all 8 funds, largest difference 0.

### 2. Export in wasm

rust_xlsxwriter's `constant_memory` feature writes rows to a temporary file, which wasm32-unknown-unknown cannot
create. The fix is two lines of Cargo features and one function:

```toml
[target.'cfg(not(target_arch = "wasm32"))'.dependencies]
rust_xlsxwriter = { version = "0.102", default-features = false, features = [
  "constant_memory",
  "ryu",
] }

[target.'cfg(target_arch = "wasm32")'.dependencies]
rust_xlsxwriter = { version = "0.102", default-features = false, features = ["ryu", "wasm"] }
```

The `wasm` feature takes the workbook's timestamps from JavaScript's clock; without it, `SystemTime::now()` panics on
wasm32. In WebAssembly, the one call to `add_worksheet_with_constant_memory()` becomes `add_worksheet()`.

The page saves the worker's bytes as a `Blob` through an `<a download>` link, and Playwright caught the download
(`compare.mjs`, above). `readback.py` compared each file with the native export of the same rows and layout:

```sh
uv run --no-build --with openpyxl==3.1.5 --with duckdb==2.0.0 --with pyarrow==26.0.1 python -I spike/readback.py DIR
```

```text
browser-flat.xlsx: sheets ['View', 'Notes']
  View: 3436510 cells, A1:AN100001, outline rows 0, frozen at A2: identical to native
browser-outlined.xlsx: sheets ['View', 'Notes']
  View: 7059 cells, A1:M543, outline rows 541, frozen at B2: identical to native
browser-flat.csv: sha256 b8fdad74c3d2550d browser, b8fdad74c3d2550d native: identical
ALL MATCH
```

The browser's flat xlsx is smaller than the native one (24.1 MB against 26.8 MB) with the same cells: held in memory,
rust_xlsxwriter writes a shared string table, and streamed it writes strings inline.

Held in memory, an xlsx costs about 190 bytes of WebAssembly memory a cell, and that memory never shrinks:

| Export, in the worker         | Cells       | File    | Time   | Native | Wasm memory   |
| ----------------------------- | ----------- | ------- | ------ | ------ | ------------- |
| Flat xlsx, 25,000 rows        | 1.0 million | 6.0 MB  | 1.09 s | 0.71 s | 52 to 247 MB  |
| Flat xlsx, 100,000 rows       | 4.0 million | 24.1 MB | 4.10 s | 2.90 s | 200 to 938 MB |
| Flat CSV, 100,000 rows        | 4.0 million | 41.6 MB | 1.20 s |        | no growth     |
| Outlined pivot xlsx, 542 rows | 7,059       | 73 kB   | 54 ms  | 20 ms  | no growth     |

So the roadmap's export budget, 1,000,000 rows by 40 columns, cannot be written as xlsx in the browser: it would need
about 7.6 GB, and 32-bit WebAssembly has 4 GB.

Export adds this much to the wasm, measured by building parallax's `main` with and without it:

| Build             | Raw             | gzip -9       | brotli 11     |
| ----------------- | --------------- | ------------- | ------------- |
| `main`, no export | 5,001,494       | 1,080,774     | 720,825       |
| With export       | 6,334,818       | 1,548,601     | 1,008,899     |
| Added             | 1,333,324 (27%) | 467,827 (43%) | 288,074 (40%) |

### 3. The row limit

`measure-rows.mjs` loads each size into a fresh headless Chromium. The page generates the rows, then the script times
the load into the worker and each pivot, best of three, and reads the engine's memory and the renderer process's
resident memory after garbage collection. The pivots are three sums by fund; the roadmap's reference pivot (fund,
strategy, sector and ticker by asset class, three sums); a regroup (sector and country by currency); and the reference
pivot reached in place from the fund pivot, through `ViewHandle.update`. Each answers a 60-row, 15-column window.

```sh
node spike/measure-rows.mjs --sizes 1000,50000,100000,250000,500000,1000000 --runs 3 --out unthrottled.json
node spike/measure-rows.mjs --sizes 150000,200000 --runs 3 --out unthrottled-2.json
node spike/measure-rows.mjs --sizes 1000,50000,100000,250000,500000,1000000 --runs 3 --throttle cdp4 --out cdp4.json
systemd-run --user --scope -q -p CPUQuota=40% -p CPUQuotaPeriodSec=10ms -- \
  node spike/measure-rows.mjs --sizes 1000,50000,100000,150000,200000,250000,500000,1000000 --runs 3 --out quota40.json
```

The quota was calibrated first: a single-threaded loop ran 3.9 times slower at 30% (534 to 2,099 ms), but the engine
ran about 5 times slower there, since Chromium's other threads share the quota; at 40% the engine ran 3.6 to 4.1
times slower.

The budgets that apply, from parallax's roadmap:

- **Regroup or re-pivot, ≤ 500 ms.** The reference pivot, opened and reached in place. This budget sets the limit.
- **Main-thread time per frame, ≤ 8 ms.** No frame was late at any size. The longest gap between animation frames
  during loads and pivots was 16.8 ms, one frame at 60 Hz, unthrottled and with CDP's 4x. A size's load and its 12
  pivots took 29 to 102 ms of main-thread time in all. Under the CPU quota, the page and the busy worker share 40% of
  one core, and one frame in a run came 33 ms late.
- **Browser tab memory, ≤ 300 MB.** Written for views held on the server. With the table in the tab, the renderer
  passes 300 MB at about 80,000 rows.
- Loads have no budget.

Unthrottled:

| Rows      | Arrow  | Load     | Fund   | Reference  | Regroup | Reference, in place | Wasm memory | Tab RSS  | Peak RSS |
| --------- | ------ | -------- | ------ | ---------- | ------- | ------------------- | ----------- | -------- | -------- |
| 1,000     | 0.5 MB | 10 ms    | 2 ms   | 4 ms       | 2 ms    | 2 ms                | 5 MB        | 144 MB   | 153 MB   |
| 50,000    | 23 MB  | 143 ms   | 7 ms   | 45 ms      | 9 ms    | 37 ms               | 102 MB      | 237 MB   | 260 MB   |
| 100,000   | 46 MB  | 274 ms   | 12 ms  | 85 ms      | 15 ms   | 71 ms               | 200 MB      | 334 MB   | 379 MB   |
| 150,000   | 69 MB  | 431 ms   | 17 ms  | 108 ms     | 20 ms   | 101 ms              | 350 MB      | 475 MB   | 543 MB   |
| 200,000   | 92 MB  | 540 ms   | 22 ms  | 142 ms     | 27 ms   | 125 ms              | 396 MB      | 525 MB   | 616 MB   |
| 250,000   | 115 MB | 720 ms   | 29 ms  | 170 ms     | 33 ms   | 159 ms              | 471 MB      | 608 MB   | 723 MB   |
| 500,000   | 230 MB | 1,395 ms | 53 ms  | 332 ms     | 63 ms   | 306 ms              | 935 MB      | 1,071 MB | 1,302 MB |
| 1,000,000 | 460 MB | 2,884 ms | 104 ms | **634 ms** | 124 ms  | **589 ms**          | 1,872 MB    | 1,996 MB | 2,457 MB |

Under the 4x proxy, a 40% CPU quota on the whole browser:

| Rows      | Load      | Fund   | Reference    | Regroup | Reference, in place |
| --------- | --------- | ------ | ------------ | ------- | ------------------- |
| 50,000    | 667 ms    | 20 ms  | 180 ms       | 36 ms   | 150 ms              |
| 100,000   | 1,227 ms  | 43 ms  | 309 ms       | 46 ms   | 289 ms              |
| 150,000   | 1,607 ms  | 53 ms  | 421 ms       | 76 ms   | 399 ms              |
| 200,000   | 2,061 ms  | 70 ms  | **576 ms**   | 84 ms   | 441 ms              |
| 250,000   | 2,500 ms  | 102 ms | **732 ms**   | 111 ms  | **638 ms**          |
| 500,000   | 4,740 ms  | 171 ms | **1,151 ms** | 205 ms  | **1,002 ms**        |
| 1,000,000 | 10,159 ms | 332 ms | **2,121 ms** | 400 ms  | **1,780 ms**        |

Memory is the same under the proxy. With CDP's 4x on the page, every engine figure stayed within noise of the
unthrottled one (1,000,000 rows: load 2,776 ms, reference 572 ms, in place 548 ms), as the setup explains.

"Tab RSS" is the renderer process's resident memory after the load and garbage collection, and "peak RSS" its high
point from the load through the pivots. Dedicated workers run in the page's renderer process, so both include the
engine. The page's and the worker's JavaScript heaps stayed under 3 MB at every size; the rest is WebAssembly memory
and Chromium. The engine's memory is about 1.87 kB a row, 4.1 times the Arrow, because the bytes are copied into
WebAssembly, decoded into a second copy, and loaded into the table, all at once, and WebAssembly memory never
shrinks. During a load, the tab also holds the page's own bytes until garbage collection.

Two changes cut that memory, each measured at 250,000 and 1,000,000 rows:

| Load                                           | Wasm memory, 250,000 | Tab RSS, 250,000 | Wasm memory, 1,000,000 | Load time, 1,000,000 |
| ---------------------------------------------- | -------------------- | ---------------- | ---------------------- | -------------------- |
| Copied and decoded, with a primary key (today) | 471 MB               | 608 MB           | 1,872 MB               | 2,884 ms             |
| The same without a primary key                 | 430 MB               | 569 MB           | 1,712 MB               | 2,403 ms             |
| Decoded in place, with a primary key           | 353 MB               | 491 MB           | 1,416 MB               | 2,708 ms             |

They ran with `--key none` and `--decode inplace`, two runs each. `loadTableInPlace` hands arrow-ipc's
`StreamDecoder` the bytes as one `Buffer`, so the decoded arrays point into them instead of copying, and the pivots ran
at the same speed. At 1,000,000 rows it saved 456 MB, almost exactly the Arrow's 460 MB, which confirms the second
copy. Loading batch by batch, so that each batch's bytes are freed
as it is loaded, would cut further, but `Table::load` takes a whole load at once, so it needs an engine change.

The roadmap's design target, 5,000,000 rows by 40 columns held in the browser, cannot be met: at 1.87 kB a row it
needs 9.4 GB, and 32-bit WebAssembly holds 4 GB. At most about 2,000,000 rows could fit under 4 GB; this host has too
little free memory to try it safely.

**Running out of memory breaks the engine.** With the engine linked at 256 MB (`-C link-arg=--max-memory=268435456`),
`oom.mjs` loaded 250,000 rows. The load failed with only `unreachable`, a WebAssembly trap. The next message threw
"recursive use of an object detected which would lead to unsafe aliasing in rust" inside the worker, because the
trap left the engine borrowed, and the pivot that sent it never got an answer. A new worker loaded 50,000 rows and
pivoted normally.

### 4. One small chart

`chart.html` builds a 100-point table in the page with apache-arrow, as the small-data `<Chart rows>` API would, loads
it into a new worker, asks for the line chart's reduction, and draws it with parallax's own `chartModel` and
`paintChart` on a canvas. `measure-chart.mjs` opens it in 5 fresh Chromium profiles (cold: nothing cached), reloads each
5 times (warm), and relaunches each profile once (warm from disk). Each column is the run that drew soonest.
Milliseconds are from the start of navigation:

```sh
node spike/measure-chart.mjs --profiles 5 --reloads 5 --out br-none.json
node spike/measure-chart.mjs --profiles 5 --reloads 5 --throttle cdp4 --out br-cdp4.json
systemd-run --user --scope -q -p CPUQuota=40% -p CPUQuotaPeriodSec=10ms -- \
  node spike/measure-chart.mjs --profiles 5 --reloads 5 --out br-quota40.json
node spike/server.mjs --port 8801 --encoding gzip   # and --port 8802 --encoding identity, then
node spike/measure-chart.mjs --url http://127.0.0.1:8801/chart.html --profiles 3 --reloads 3
```

| Step                                         | Cold   | Warm   | Cold, CDP 4x | Warm, CDP 4x | Cold, 4x proxy | Warm, 4x proxy |
| -------------------------------------------- | ------ | ------ | ------------ | ------------ | -------------- | -------------- |
| Page script starts                           | 40     | 13     | 101          | 36           | 198            | 80             |
| Worker created                               | 41     | 13     | 104          | 38           | 199            | 81             |
| Worker script starts                         | 49     | 19     | 121          | 48           | 279            | 139            |
| Wasm downloaded, from 127.0.0.1 or the cache | 63     | 34     | 135          | 61           | 339            | 221            |
| Wasm compiled                                | 71     | 42     | 143          | 69           | 407            | 261            |
| Engine ready                                 | 72     | 43     | 144          | 70           | 417            | 269            |
| Table loaded                                 | 76     | 47     | 149          | 74           | 436            | 273            |
| Chart frame decoded                          | 85     | 55     | 166          | 83           | 467            | 303            |
| Painted                                      | 88     | 56     | 177          | 88           | 498            | 305            |
| **Chart drawn** (the next frame)             | **89** | **57** | **182**      | **92**       | **506**        | **320**        |

The medians of the same runs were 105 and 64 ms unthrottled, 191 and 100 ms with CDP's 4x, and 639 and 487 ms
under the proxy. A relaunch on a warm profile drew in 87, 184 and 469 ms: the browser's own start costs what the cache
saves. Gzip and uncompressed wasm drew in the same times here, since 127.0.0.1 has no network to save.

Compilation streams with the download: the module was compiled 8 ms after its last byte unthrottled, and 40 to 68 ms
after it under the proxy. Unthrottled, warm loads compiled no sooner than cold ones.

What the page downloads:

| File                                                                                    | Raw       | gzip -9   | brotli 11 |
| --------------------------------------------------------------------------------------- | --------- | --------- | --------- |
| The engine as served here (export, and the spike's in-place loader)                     | 6,428,644 | 1,557,209 | 1,013,800 |
| The chart page's script: apache-arrow 210 kB, protobuf 67 kB, zod 34 kB, parallax 76 kB | 401,602   | 105,761   | 90,630    |
| `worker.js` and wasm-bindgen's glue                                                     | 24,873    | 6,560     | 5,724     |

On a real network the engine's download comes first, computed rather than measured: 81 ms brotli and 125 ms gzip at
100 Mbit/s, or 8 ms and 12 ms at 1 Gbit/s. With the CPU proxy, the engine's start (worker created to engine ready)
took 218 ms cold and 189 ms warm, and the page's own script, mostly apache-arrow, took 198 ms to start. Recharts would
save the engine's start but not the script, and a chart-only page drew in 0.5 s cold under the proxy (0.64 s at the
median), so Recharts is not needed on this evidence. Starting the worker when the app starts (`prewarm`) hides most
of the engine's start behind the app's.

### 5. What the wasm is made of

`twiggy top -n 100000 -f json` on the export build (6,334,818 bytes), summed by the crate each item names first, so
generic code counts against the crate that defines it rather than the one that uses it:

| Part                                                                                                                                                                 | Bytes     | Share |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----- |
| Function names (the `name` section, used only for stack traces)                                                                                                      | 1,579,350 | 24.9% |
| Arrow: `arrow_select` 465,198, `arrow_array` 335,843, `arrow_data` 178,049, `arrow_ipc` 108,185, `arrow_buffer` 101,609, `arrow_schema` 85,239, `flatbuffers` 66,491 | 1,340,614 | 21.2% |
| Rust's `core` and `alloc`, mostly generic code instantiated for the engine                                                                                           | 984,447   | 15.5% |
| Export: `rust_xlsxwriter` 398,236, `zip` 239,742, `zopfli` 63,148, `zlib_rs` 47,899, `parallax_export` 33,321                                                        | 782,346   | 12.4% |
| Constant data (`.rodata`), a third of it jiff's bundled time-zone database (712 zones, 206,788 bytes)                                                                | 613,554   | 9.7%  |
| Parallax: engine 247,309, protocol 94,069, session 67,609, wasm 4,850                                                                                                | 413,837   | 6.5%  |
| `serde_json` and `serde`                                                                                                                                             | 228,267   | 3.6%  |
| `jiff` and `jiff_core`                                                                                                                                               | 175,120   | 2.8%  |
| `hashbrown`                                                                                                                                                          | 105,151   | 1.7%  |
| Everything else                                                                                                                                                      | 112,132   | 1.8%  |

Each build below is the same code (export and the in-place loader). Sizes are Node's zlib at gzip level 9 and brotli
quality 11. The builds set `CARGO_PROFILE_RELEASE_LTO=fat`, `CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1` and
`CARGO_PROFILE_RELEASE_OPT_LEVEL`, ran `wasm-bindgen --remove-name-section --remove-producers-section`, and were swapped
into `spike/dist/wasm` for `measure-rows.mjs --sizes 250000 --runs 5` and `measure-chart.mjs --profiles 3 --reloads
3`. Speeds are the best of five at 250,000 rows, unthrottled:

| Build                                    | Raw       | gzip -9   | brotli 11 | Load     | Reference | In place | Cold chart drawn |
| ---------------------------------------- | --------- | --------- | --------- | -------- | --------- | -------- | ---------------- |
| Default release, as today                | 6,428,644 | 1,557,209 | 1,013,800 | 689 ms   | 181 ms    | 164 ms   | 97 ms            |
| **Name section removed**                 | 4,835,193 | 1,415,026 | 932,955   | 681 ms   | 177 ms    | 163 ms   | 84 ms            |
| Fat LTO, one codegen unit, names removed | 4,359,680 | 1,352,515 | 909,135   | 818 ms   | 169 ms    | 167 ms   | 87 ms            |
| The same at `opt-level = "s"`            | 3,547,797 | 1,051,418 | 758,362   | 971 ms   | 205 ms    | 192 ms   | 83 ms            |
| The same at `opt-level = "z"`            | 2,984,766 | 913,202   | 687,411   | 1,047 ms | 248 ms    | 229 ms   | 79 ms            |
| `"z"`, then `wasm-opt -Oz`               | 2,582,806 | 949,414   | 719,284   |          |           |          |                  |
| Default, then `wasm-opt -Oz`             | 4,134,723 | 1,432,584 | 985,952   |          |           |          |                  |

The obvious cut is `wasm-bindgen --remove-name-section`: 1.6 MB raw and 81 kB brotli, at no cost in speed. Size
optimization is a trade, not a cut: `"z"` saves another 245 kB brotli but makes pivots about 40% slower and loads
about 50% slower, which would lower the row limit by over a quarter. `wasm-opt` shrinks the raw module but makes it
compress worse. Smaller candidates: the export's zip pulls in two deflate encoders, zopfli and zlib-rs (111 kB
together); the bundled time-zone database could hold only the zones parallax shows; and `arrow_select` holds kernels
for every type.

## The row limit

**Document 150,000 rows of a positions-shaped table, 40 columns and about 69 MB of Arrow, as the most one table can
hold.** It is the largest size tried at which the reference pivot met the 500 ms budget, opened (421 ms) and in place
(399 ms), under the 4x proxy; at 200,000 rows it opened in 576 ms. Unthrottled, this host would allow 500,000. At
150,000 rows the engine holds 350 MB, and the tab 475 MB after the load and 543 MB at its peak.

Enforce it on two measures, since time follows rows and memory follows bytes: rows at most 150,000, and Arrow bytes at
most 70 MB, so that a narrow table may hold more rows and a wide one fewer. The byte check runs before the bytes reach
the engine; the row check runs when the stream's batch headers are read.

If the 300 MB tab budget is to hold for tables in the browser, the limit falls to about 80,000 rows today, and to
about 110,000 with in-place decoding. That budget was written for views held on the server, so it should be restated
for the browser, from the Citrix repeat's memory figures.

The Citrix repeat adjusts the limit to the largest size at which the reference pivot, opened and in place, takes at
most 500 ms in the desktop's browser, provided the tab's memory at that size leaves the desktop room. If 150,000 rows
take over 500 ms there, the limit drops to the largest size that passes; if 250,000 pass, it rises.

## The Citrix repeat (work)

These run in the desktop's own Chrome or Edge, with no Playwright and no throttling: the desktop is the measurement.
They need Node and git (or a zip of the branch from GitHub). Nothing builds: `web/spike/dist` holds the built pages.

1. In PowerShell:

   ```powershell
   git clone --depth 1 --branch 0.3-parallax-alone https://github.com/jacobragsdale/parallax.git
   cd parallax\web
   node spike\server.mjs
   ```

   It prints `{"url":"http://127.0.0.1:8797/",...}`. Leave it running.

2. Rows: open `http://127.0.0.1:8797/` in a normal window. Leave the sizes as they are (`50000 100000 150000 200000
   250000 500000`) and press **Run**. It takes a few minutes and stops at the first failure. When it finishes, the
   500,000 rows are still loaded: open the browser's Task Manager (Shift+Esc) and write down the tab's **Memory
   footprint**. Press **Copy report** and paste it into a file. If the tab crashes, reload it: the page shows the
   report as far as it got.
3. Exports: on the same page, press **Save exports**. It saves `positions-outlined.xlsx` and `positions-flat.csv`.
   Open the xlsx in Excel and check that the outline buttons collapse and expand the groups, and that the numbers show
   as numbers. If the browser asks whether the page may download several files, allow it.
4. One chart: open a new InPrivate (Edge) or Incognito (Chrome) window, so that nothing is cached, and open
   `http://127.0.0.1:8797/chart.html`. Reload it five times. Press **Copy report** and paste it into a second file.
5. Stop the server with Ctrl+C.

Send back the two reports (they name the browser, its version and the desktop's core count), the Task Manager
figure, the desktop's memory from Windows Task Manager's Performance tab, and whether the xlsx opened in Excel with
working outlines.

## Fallbacks

| No                                             | Fallback                                                                                                                                                                                                                                                                              |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The 5,000,000-row browser target               | The documented limit, with the data narrowed by the API: a basis endpoint that filters or aggregates to fit, as the design already expects of the firm's tables. In-place decoding cuts the memory a quarter, and batch-wise loading would cut more; pivot time still sets the limit. |
| The 300 MB tab budget past 80,000 rows         | Restate the budget for tables in the browser from the Citrix figures, or document 80,000 rows.                                                                                                                                                                                        |
| xlsx past about a million cells in the browser | CSV, which wrote 4 million cells in 1.2 s with no memory growth; or the export as a basis API endpoint for very large views.                                                                                                                                                          |
| CDP throttling of the worker                   | A CPU quota on this host, and the real desktop for the measurement that counts.                                                                                                                                                                                                       |
| A chart-only page that is too slow on Citrix   | Recharts behind a cap on its points, as the design says; this host gives no reason to expect it.                                                                                                                                                                                      |

## What steps 2.3 and 2.4 must do

Step 2.3, the browser source:

- Take the spike's `load` message and `BrowserEngine.load()`: the app's `ArrayBuffer` moves to the worker in the
  message's transfer list, and is never copied between threads.
- Check the limit before loading, and say so plainly: Arrow bytes against 70 MB from `byteLength` before posting, and
  rows against 150,000 from the stream's batch headers. A load past the engine's memory ends in a trap that says only
  `unreachable`.
- Treat a trap as fatal. After one, the engine object stays borrowed and every later message fails inside the worker,
  so views wait forever. Catch it, end the worker (ending it frees all its memory), fail every view with the reason,
  and start a new worker.
- Decode in place, as `loadTableInPlace` does: a quarter less memory at the same speed. Consider a batch-wise load,
  which needs `Table::load` to take a load in parts.
- Place views by the load's answer, not the welcome. The worker's welcome is sent when it starts, before any load, so
  `Connection.dataset()` never lists a dataset the app loaded.
- Remember that WebAssembly memory never shrinks: a reload or a large pivot leaves its high-water mark until the worker
  ends. Reloads were not measured here.
- Take the load's status (when it was read, NaNs turned blank) from the app, as the design says. The spike passed
  fixed times; an API could send them in the Arrow schema's metadata, as `/copy` did.
- Build with `wasm-bindgen --remove-name-section`.
- Measure throttled budgets with a CPU quota or on a desktop. CDP's 4x never reaches the worker.

Step 2.4, export in wasm:

- Take the spike's Cargo features and `streamed_sheet`, and `exportXlsx` and `exportCsv` on the wasm `Worker`, run in
  the engine's worker, which already holds the table; the bytes move to the page with the message.
- Cap xlsx exports by cells, since each costs about 190 bytes of memory that never shrinks, and offer CSV past the cap.
  About 1,000,000 cells (190 MB) fits beside a table at the row limit.
- Stream large CSVs: today `exportCsv` returns one buffer. Writing chunks to the page, into a `Blob` built from parts
  or a file from the File System Access API, keeps the export from holding the whole file three times (wasm, the page's
  copy, the Blob).
- Restate the export budget for the browser: 100,000 rows by 40 columns took 4.1 s as xlsx, against 2.9 s natively,
  and the budget's 1,000,000 rows cannot fit.
- Accept the 288 kB brotli the export adds to every page that uses parallax, a chart-only page included. Splitting it
  into a second module is not simple, because the export reads the engine's table.
