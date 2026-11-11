# Spike 6.2b: parallax at 1,000,000 rows

The scale harness, `vp run @basis/parallax#bench`, reproduces the review's figures from the package's build: within
the shared host's noise for loads, sorts, pivots and memory, with two differences of method, the search and the
drawing time, explained below. Memory grows in a straight line with rows, 3.0 to 3.3 times the Arrow in WebAssembly
and 1.25 GB of browser at its peak for each 1,000,000 trades. 2,000,000 positions load too, in 2.8 GB of WebAssembly.
The engine's phase profile says where 6.3 should start: a load spends about 60% of its time appending and 37%
staging, and decoding the stream costs 1.5%; the reference pivot spends about 70% aggregating rows into leaf cells,
and the tree, the leaf sort and the merge share the rest. Run on 2026-11-09 in three full runs on a shared host, the
last at a load average of 1.4 to 5.2. Step 6.3.1 then made the load of 1,000,000 trades 2.4 times as fast throttled,
3.2 s, and its WebAssembly memory a quarter, 0.8 times the Arrow, as [its section](#step-631-a-load-that-copies-once)
says. Step 6.4.3 found the throttled drawing at 1.25 and 1.5 to be mostly the harness's emulated ratio, and measures
at real ones, as [its section](#step-643-one-draw-per-frame) says. Step 6.3.2 made the load progressive: 1,000,000 trades show their first rows in 0.24 s plain, from 0.97 s, and
1.7 s throttled, from 3.5 s, missing its 1 s target, while the whole table takes longer throttled, 4.1 s, as [its
section](#step-632-a-progressive-load) says. Step 6.3.3 sorted on integer keys and kept each order: a first sort of
a text or decimal column of 1,000,000 trades takes 73 to 130 ms throttled, from 2.1 to 2.2 s, and its toggle 39 to 49 ms, from 1.3 to 2.1 s, while a
filter under a sort, 98 to 119 ms, misses its 50 ms target by the filter's own cost, as [its
section](#step-633-sorts-on-keys) says. Step 6.4.4 made a scroll copy the pixels that stay, so scrolling 1,000,000 trades repaints 9 % of the
canvas a frame, from all of it, as [its section](#step-644-a-scroll-that-moves-pixels) says.

## Versions

- basis-ui `main` at `4588ea0`, with this step's change on it.
- Rust 1.99.1 (parallax's `rust-toolchain.toml`), wasm-bindgen 0.2.130, arrow-rs 60.1.0, built in release with
  `CARGO_BUILD_JOBS=1`.
- Node 26.13.0, Vite+ 1.5.0, React 19.3.1, apache-arrow 21.2.0.
- Playwright 1.64.1 with Chrome for Testing 156.0.8078.4, headless shell, launched with parallax's end-to-end flags,
  `--disable-gpu --disable-gpu-compositing --disable-software-rasterizer`, and `--js-flags=--expose-gc`, so that the
  bench collects garbage before it reads memory at rest.
- "Throttled" is spike 0.3's proxy for a Citrix desktop, a CPU quota on the whole browser:
  `systemd-run --user --scope -p CPUQuota=40% -p CPUQuotaPeriodSec=10ms`. The bench checks that the browser's control
  group is the scope's.
- Data: `parallax-datagen`'s trades and positions, seed 42, 10,000 securities, as Arrow IPC streams: 46, 304 and 608
  MB of trades and 69, 460 and 921 MB of positions at 150,000, 1,000,000 and 2,000,000 rows, the review's sizes to the
  megabyte.
- The build host: an AMD Ryzen 7 8745HS, 8 cores and 16 threads, 27 GB, shared with other agents' builds and tests
  throughout.

## Setup

| Path                                                           | What it is                                                                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/parallax/tests/perf/bench.ts`                        | The bench: writes the data, builds and serves the page, runs each dataset, size and mode in a fresh browser, writes `test-results/perf/bench.json`           |
| `tests/perf/flags.ts`                                          | Its flags: `--sizes`, `--datasets`, `--modes`, `--ratios`, `--rounds`, `--budgets`, `--out`, `--check FILE`, `--prebuilt`                                    |
| `tests/perf/measure.ts`, `browser.ts`                          | One run: a page at each device pixel ratio, its load, its rest, its rounds of changes and its scroll                                                         |
| `tests/perf/harness/`                                          | The page, on the package's `dist/`: a `Grid` of the trades or a `Pivot` of the positions, filling a 1400 by 900 window, with `window.parallaxBench`          |
| `tests/perf/harness/protocol.ts`                               | The rounds of changes: three sorts and their toggles, a filter under a sort, a filter and a search; two pivots, the reference pivot, expand and collapse all |
| `tests/perf/processes.ts`                                      | The browser's resident memory from `/proc`: RSS and PSS summed over its process tree, at rest and sampled every 250 ms for the peak                          |
| `tests/perf/budgets.json`, `budgets.ts`                        | The budgets, `host` and `nightly`, and the check, one `ERROR` line for each figure over its budget                                                           |
| `src/engine/limits.ts`                                         | `loadLimits()`: the documented limits, unless the page set others at `Symbol.for("@basis/parallax/load-limits")`, which `src/index.ts` does not export       |
| `crates/parallax-engine/src/profile.rs`, `examples/measure.rs` | The phase profile, behind the engine's `profile` feature, which no app's build and no WebAssembly build has                                                  |
| `.github/workflows/bench.yml`                                  | The nightly job: plain, one round, against the `nightly` budgets                                                                                             |

How each figure is taken:

- **First rows** is the grid's own counter, `drawStats().firstRows.drawnAtMs`, on `performance.now()`'s clock, which
  starts at navigation. **Fully loaded** is the later of that and the moment `useDataset` reports the load done. The
  load is not progressive yet, so today they are the same.
- **A change** sets the layout, as an app's `onLayoutChange` does, and ends when the grid draws the frame that answers
  it: the first entry in `drawStats().changes` sent after the call. The review timed a click to the canvas changing.
- **WebAssembly memory** is the engine's linear memory, read in the worker through a wrapper that keeps the memory of
  each module instantiated. It only grows, so it is the engine's high-water mark: after the load, and after the rounds.
- **Browser memory** is RSS summed over every process the bench started, as the review measured it, read 3 s after the
  load with the page's and the worker's garbage collected, and its peak over the run. PSS, which counts a shared page
  once, is kept beside it and is about 250 MB less.
- **Drawing per frame** is the grid's own drawing time, `drawStats().drawMs`, over the frames it drew while the bench
  scrolled 240 animation frames of 3 rows, as the grid's performance spec scrolls. The page loads again in a context of
  its own at each ratio, which adds two samples of the load. Since step 6.4.3 each ratio has a browser started at it,
  as [its section](#step-643-one-draw-per-frame) says; before, a context emulated it.
- **Area repainted per frame**, since step 6.4.4, is the grid's own count of the device pixels it repainted,
  `drawStats().paintedPx`, over the frames it drew in the same scroll; for a build without the count, each full
  redraw's whole canvas. **Main thread per frame** is DevTools' `TaskDuration` over the scroll, through a CDP
  session, for the frames drawn: it counts the canvas's raster, which a canvas without a GPU does on the main thread
  after the painter's calls, and which the drawing counter does not.
- Each figure is the median of its samples: three rounds of changes, three loads, one at each ratio, and three scrolls
  at each ratio. A single scroll proved too noisy to budget: one throttled scroll of 150,000 positions drew at 6.0 ms
  a frame at ratio 1, and the next at 1.9 ms.

## Answers

| Question                                                     | Answer                                                                                                                                                                                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Do today's figures agree with the review's?               | **Yes**, for loads, sorts, pivots and memory, within the host's noise, once the host was quiet. **No** for two, by method: the search is 2.5 to 3.5 times faster throttled, and the drawing per frame unthrottled is 1.2 to 1.4 ms, not 0.5. |
| 2. Is memory linear in rows?                                 | **Yes.** WebAssembly holds 0.98 GB for each 1,000,000 trades and 1.39 GB for each 1,000,000 positions, 3.2 and 3.0 times the Arrow; the browser holds 1.25 GB more at its peak for each 1,000,000 trades, over about 0.57 GB of its own.     |
| 3. Where does the load's time go?                            | **Appending, 60%, and staging, 37%.** Decoding the stream is 1.5% and counting its rows nothing. The peak is 3.1 times the Arrow natively, and the table at rest 1.2 times.                                                                  |
| 4. Where does the reference pivot's time go?                 | **Aggregating rows into leaf cells, 70%.** Building the tree is 13.5%, sorting the leaves 9%, merging upwards 4%, the rest 3%. Showing the first window adds 3% more, or 8% when siblings sort by a measure.                                 |
| 5. Can the limits be lifted for the harness outside the API? | **Yes**: a page sets them at a registered symbol before it loads, which `loadLimits()` reads and `src/index.ts` does not export. `limits.ts`'s values are unchanged.                                                                         |
| 6. Does 2,000,000 of each load in the browser?               | **Yes**: 2,000,000 positions, 921 MB of Arrow, take 2.8 GB of WebAssembly and 4.3 GB of browser at peak. At 3 times the Arrow, wasm32's 4 GB ends at about 2,900,000 positions or 4,100,000 trades.                                          |
| 7. Can the harness read WebAssembly memory at rest?          | **No.** Linear memory never shrinks, so the browser shows only the high-water mark, which a load sets and today's rounds never raise.                                                                                                        |

## Today's figures beside the review's

The final run's medians, with the review's from [PLAN.md's measurements](../../PLAN.md#measurements). Memory is the
browser's resident memory, the review's measure: the peak over the run, and at rest 3 s after the load once the
garbage is collected. The review's figure sits with the peak; until the worker's copy of the Arrow bytes is collected,
the browser holds 0.1 to 1 GB more than at rest. The load average was between 1.4 and 5.2 through the final run, on
16 threads.

| Table                     | First rows, review | First rows | Sort a text column, review | Sort a text column | Search, review | Search | Memory, review | Memory, peak and at rest |
| ------------------------- | ------------------ | ---------- | -------------------------- | ------------------ | -------------- | ------ | -------------- | ------------------------ |
| 150,000 trades            | 0.55 s             | 0.49 s     | 78 ms                      | 65 ms              | 27 ms          | 19 ms  | n/a            | 0.76 and 0.69 GB         |
| 1,000,000 trades          | 2.5 s              | 2.27 s     | 540 ms                     | 495 ms             | 111 ms         | 101 ms | 1.9 GB         | 1.83 and 1.49 GB         |
| 2,000,000 trades          | 5.0 s              | 5.12 s     | 1,150 ms                   | 1,407 ms           | 180 ms         | 183 ms | 3.1 GB         | 3.08 and 2.46 GB         |
| 150,000 trades, throttled | 2.9 s              | 2.49 s     | 350 to 460 ms              | 323 ms             | 212 ms         | 60 ms  | 0.7 GB         | 0.78 and 0.69 GB         |
| 1M trades, throttled      | 9.9 s              | 7.97 s     | 2.4 to 2.7 s               | 2,072 ms           | 722 ms         | 293 ms | 1.7 GB         | 1.83 and 1.49 GB         |
| 150,000 positions, pivot  | 0.8 s              | 0.74 s     | n/a                        | n/a                | n/a            | n/a    | 0.85 GB        | 0.89 and 0.79 GB         |
| 1M positions, pivot       | 4.0 s              | 4.11 s     | n/a                        | n/a                | n/a            | n/a    | 2.3 GB         | 2.42 and 1.92 GB         |

The host's load explains what differs between runs. Plain runs share the host's cores, where the throttled browser is
held to its quota either way, so they are the noisy ones. Two earlier full runs, at load averages of 4 to 10 while
other agents built and tested, sorted a text column of 1,000,000 trades in 609 and 898 ms, with samples up to 1,450
ms; the final run, at 1.4 to 3.7, in 495 ms, against the review's 540. Only the sort of 2,000,000 trades, 1.2 times
the review's, stays above it, and its run began as the load rose to 5. The throttled times are at or below the
review's in every run.

The rest of the review's figures:

| Measure                                                       | Review         | Today                                                   |
| ------------------------------------------------------------- | -------------- | ------------------------------------------------------- |
| Collapse all and expand all, 150,000 positions                | 146 and 162 ms | 100 and 116 ms                                          |
| Collapse all and expand all, 1,000,000 positions              | 578 and 630 ms | 566 and 605 ms                                          |
| Reference pivot, 1,000,000 positions, throttled               | about 2.1 s    | 1,702 ms                                                |
| Drawing per frame while scrolling, at every size, unthrottled | 0.5 ms         | 1.2 to 1.4 ms, at every ratio                           |
| Drawing per frame while scrolling, throttled                  | 4.4 ms         | 1.6 to 2.0 ms at ratio 1; 3.1 to 5.9 ms at 1.25 and 1.5 |
| A 16.7 ms frame while scrolling                               | at every size  | unthrottled, yes; throttled at 1.25 and 1.5, no         |

And what the review did not measure, at 1,000,000 rows, plain and throttled: sorting a number column 547 and 2,155
ms, and its toggle as long; sorting the trade date 32 and 128 ms, since the trades arrive in date order, and its toggle
442 and 1,391 ms; a filter 27 and 113 ms, and the same filter under the date sort 204 and 658 ms; the two other pivots
106 to 172 and 360 to 543 ms. At 2,000,000 positions the first rows take 7.7 s plain and 23.8 s throttled, and the
reference pivot 980 ms and 2.9 s. `test-results/perf/bench.json` holds every sample.

WebAssembly memory after the load, which no later step of the rounds raised, the same in every run:

| Rows      | Trades   | Times the Arrow | Positions | Times the Arrow |
| --------- | -------- | --------------- | --------- | --------------- |
| 150,000   | 191 MB   | 4.2             | 280 MB    | 4.1             |
| 1,000,000 | 995 MB   | 3.3             | 1,416 MB  | 3.1             |
| 2,000,000 | 1,974 MB | 3.2             | 2,803 MB  | 3.0             |

From 1,000,000 to 2,000,000 rows it grows by 979 MB of trades and 1,387 MB of positions, as from 150,000 to 1,000,000
it grew by 0.95 and 1.34 GB for each 1,000,000: a straight line, with the vectors' doubling as the only step. The
browser at rest grows by 0.95 GB for each 1,000,000 trades once the garbage is collected, and by 1.25 GB at its peak.

## The phase profile

`cargo run --release -p parallax-engine --features profile --example measure -- FILE`, on one thread, each dataset in
a process of its own, three times; the medians. The native build on one thread takes the partitioned path that
WebAssembly does not, so its seconds are not the browser's: read the shares.

| Load of 1,000,000 rows | Trades, 304 MB of Arrow | Share | Positions, 460 MB | Share |
| ---------------------- | ----------------------- | ----- | ----------------- | ----- |
| Count the rows         | 0.000 s                 | 0%    | 0.000 s           | 0%    |
| Decode the stream      | 0.028 s                 | 1.5%  | 0.032 s           | 1.3%  |
| Stage the columns      | 0.723 s                 | 37%   | 0.974 s           | 39%   |
| Append to the table    | 1.160 s                 | 61%   | 1.520 s           | 60%   |
| Total                  | 1.91 s                  |       | 2.47 s            |       |
| Peak memory            | 940 MB, 3.1 times       |       | 1,370 MB, 3.0     |       |
| The table, at rest     | 369 MB, 1.2 times       |       | 534 MB, 1.16      |       |

| Reference pivot, 1,000,000 positions | Time    | Share |
| ------------------------------------ | ------- | ----- |
| Aggregate the rows into leaf cells   | 0.470 s | 70%   |
| Sort the leaves                      | 0.060 s | 9%    |
| Build the tree                       | 0.091 s | 13.5% |
| Merge it upwards                     | 0.028 s | 4%    |
| The rest of the view's build         | 0.02 s  | 3%    |
| Total build                          | 0.672 s |       |
| First window                         | 0.022 s |       |
| First window, siblings by a measure  | 0.056 s |       |

The flat sorts of 1,000,000 trades build in 0.63 s for the ticker and the quantity, and 0.017 s for the trade date,
which is already in order. The browser's sort of the ticker, 0.5 s on a quiet host, is the same work.

## Fallbacks

- **The search (1).** The review's throttled 722 ms at 1,000,000 trades was most likely typed: before 6.1c each
  keystroke queued a rebuild. The harness sets the whole search at once, as a layout or a link does, and so measures
  one rebuild.
- **Drawing per frame (1).** The harness reads the grid's own drawing counter, which times the painter's calls; the
  review's 0.5 ms came from elsewhere, not recorded. The counter is the figure 6.4's target is stated in, so it stays.
- **Memory at rest in WebAssembly (7).** The native profile reports the table at rest instead, from the process's
  resident set once the stream is dropped: 370 MB for 1,000,000 trades and 534 MB for 1,000,000 positions. Step 6.3.7,
  which restarts the worker past a high-water mark, needs only the mark, which the harness reads.

## What steps 6.3 and 6.4 take from it

- **6.3.1 A load that copies once.** Decoding costs nothing; staging and appending are 97% of the load, and the peak
  is three times the Arrow, natively and in WebAssembly, where it stays as the high-water mark: 995 MB for 304 MB of
  trades. The table itself is 1.2 times the Arrow, which is where a single copy would leave the peak.
- **6.3.3 Sorts on keys.** A toggle costs what the first sort does (492 against 495 ms plain, 2,031 against 2,072 ms
  throttled), so nothing is cached; a column already in order sorts in a tenth of the time of its reverse, so the
  comparisons are the cost.
- **6.3.4 Filters as kernels.** A filter alone is 27 ms plain and 113 ms throttled, a search 101 and 293 ms; under a
  sort, the filter re-sorts, 204 and 658 ms. The search and the filter under a sort are what miss 100 ms.
- **6.3.5 A typed group-by.** Aggregating into leaf cells is 70% of the reference pivot; the tree, the leaf sort and the
  merge share the other 30%. The group-by is the step that moves the pivot's figure.
- **6.3.6 No rebuild where the order alone changes.** Expand all and collapse all cost as much as building the pivot
  anew: 605 and 566 ms against 516 ms at 1,000,000 positions, plain.
- **6.3.7 Memory that comes back.** The harness reads the high-water mark the worker would restart on: 3.0 to 3.3
  times the Arrow after one load.
- **6.4, the canvas.** Unthrottled, the grid draws a frame in 1.2 to 1.4 ms at every ratio. Throttled it draws in 2 ms
  at most at ratio 1 but in 3.1 to 5.9 ms at 1.25 and 1.5, with its 95th-percentile frame at 33 to 50 ms, so a frame is
  dropped at the ratios a Citrix desktop is likely to use. The cause is not measured here: the quota is the whole
  browser's, so the software compositor's larger area at those ratios may be taking the painter's share. Step 6.4.2's
  whole device pixels, and 6.4.4's scroll that moves pixels, are judged by these three columns.

## The budgets

`tests/perf/budgets.json` holds a budget for each run and figure, in milliseconds or megabytes as its name says.
The `host` budgets are about twice the slowest time of this spike's three full runs, and at least 20 ms more; the
drawing's at least 4 ms plain and 8 ms throttled, step 6.4's target; and 1.25 times the final run's memory. Today's
figures pass with that headroom, the noisy first two runs' included. Steps 6.3 and 6.4 tighten them toward their
targets, and say so in their pull requests. The `nightly` budgets are for a shared runner, plain only: five times the
times and 1.5 times the memory. A figure over its budget fails with its run and the budget named:

```text
ERROR positions at 2,000,000 rows, plain: rssAtRestMB is 4,215 MB, over its budget of 4,200 MB in tests/perf/budgets.json (host): find what made it worse, or raise the budget in the same commit and say why.
```

That line is the first full run checked against today's budgets: it read memory at rest before the bench collected
garbage, with the worker's 921 MB of Arrow still held.

## Step 6.3.1: a load that copies once

Step 6.3.1 changed the load and measured it with this harness before and after, on trades at 150,000 and 1,000,000
rows, plain and throttled, one round, on 2026-11-09 (`--datasets trades --sizes 150000,1000000 --rounds 1`). What
changed:

- The worker hands the engine the page's `Uint8Array` instead of copying the stream into WebAssembly. The engine counts
  the rows from the headers, copying only them, then copies one message at a time into a buffer of its own, decodes it
  in place there, stages its batch, and frees it before the next: WebAssembly never holds the stream.
- Each staged column reserves the counted rows at once, so no vector grows by doubling. Values arrive as typed
  slices, text is interned from the array's own `&str`, and a dictionary-encoded column interns each of its values
  once, the first time a row uses it, so codes keep the order rows first use their text.
- A first load keeps the staged columns as the table's own, so each row is copied once; a reload still stages whole
  and is checked before the table changes, so a refused one keeps the table, as before.
- A first load whose keys only rise, such as the trades' ids, or whose text keys are each new, cannot repeat a key,
  so it builds no index: the next load that looks a key up builds it. Other keys are checked and indexed in one pass,
  one hash insert for each row rather than three.

| Trades, fully loaded and memory | Before, load average 3.8 to 6.0 | After, load average 4.0 to 7.8 |
| ------------------------------- | ------------------------------- | ------------------------------ |
| 150,000, plain                  | 626 ms                          | 347 ms                         |
| 150,000, throttled              | 2,319 ms                        | 1,364 ms                       |
| 1,000,000, plain                | 2,765 ms                        | 873 ms                         |
| 1,000,000, throttled            | 7,858 ms                        | 3,214 and 3,370 ms             |
| WebAssembly, 150,000            | 191 MB, 4.2 times the Arrow     | 53 MB, 1.2 times               |
| WebAssembly, 1,000,000          | 995 MB, 3.3 times the Arrow     | 242 MB, 0.8 times              |
| Browser at rest, 1,000,000      | 1,488 MB                        | 756 to 760 MB                  |
| Browser at its peak, 1,000,000  | 1,825 MB                        | 1,064 to 1,134 MB              |

The second throttled figure at 1,000,000 is a repeat of that run alone, at a load average of 3.3. WebAssembly's peak is
its memory after the load, as before: nothing in the rounds raises it.

The phase profile of 1,000,000 trades, three runs each, before at a load average of 3.2 and after at 2.9; the
example now loads as the worker does, a message at a time, with the stream held whole beside the table, as the page
holds it:

| Load of 1,000,000 trades | Before  | Share | After   | Share |
| ------------------------ | ------- | ----- | ------- | ----- |
| Count the rows           | 0.000 s | 0%    | 0.000 s | 0%    |
| Decode the stream        | 0.026 s | 1.7%  | 0.062 s | 28%   |
| Stage the columns        | 0.587 s | 38%   | 0.154 s | 70%   |
| Append to the table      | 0.921 s | 60%   | 0.004 s | 2%    |
| Total                    | 1.55 s  |       | 0.22 s  |       |
| Peak memory              | 940 MB  |       | 549 MB  |       |
| The table, at rest       | 370 MB  |       | 245 MB  |       |

Decoding now copies each message out of the stream, which is what keeps the stream out of WebAssembly; staging is the
conversion into the engine's types, most of it the interning of the twelve text columns, a hash lookup for each
cell. Natively the peak is the stream's 304 MB and the table's 245 MB.

**The 3 s target for 1,000,000 trades fully loaded, throttled, is missed: 3.2 to 3.4 s.** The engine's own load of
them takes 0.22 s natively. Throttled, the page shows 150,000 rows in 1.4 s, most of it starting the page and the
worker; this harness does not split the rest of the 3.2 s between moving 304 MB to the worker, the load in
WebAssembly and the first view. Step 6.3.2's progressive load, whose target is the first rows in 1 s, and step
6.3.8's narrower storage are the next to act on it. The memory target, 700 MB of browser at rest, is 6.3.7's and
6.3.8's; at 756 MB it is within 60 MB of it. The host budgets for these runs' loads and memory are now set as above:
twice the slowest time and 1.25 times the memory.

## Step 6.4.3: one draw per frame

Step 6.4.3 moved the grid's drawing from a microtask after each event to the next animation frame, and gave the grid
the wheel over its body, and measured trades at 1,000,000 rows with this harness before and after, on 2026-11-09
(`--datasets trades --sizes 1000000`, three rounds). What changed:

- Every event, frame from the engine and change that arrives before an animation frame marks the canvas stale, and the
  frame draws it once. Six pointer moves in six tasks of one frame drew six times, and now draw once; a hidden tab
  draws in its first frame what changed while it ran none.
- A mouse's notch, 100 pixels with a legacy delta of 120 in Chromium, moves the rows three at once, a row for each of
  Chromium's lines, and paints once; the browser's own scroll moved 100 pixels, four rows and a sixth, animated over
  several frames where smooth scrolling is on. A trackpad's small deltas stay the browser's, smooth.
- The bench starts a browser at each ratio, with `--force-device-scale-factor`, rather than emulating the ratio in a
  context, for the reason below.

**Why the throttled drawing cost more at 1.25 and 1.5.** The quota is the whole browser's, 40% of a core, which is
6.7 ms of CPU in a 16.7 ms frame. Reading every browser thread's CPU from `/proc` over the bench's scrolls, before
this step's change, plain:

| CPU in a frame of scrolling, plain | Ratio 1 | 1.25, emulated | 1.5, emulated | 1.25, real | 1.5, real |
| ---------------------------------- | ------- | -------------- | ------------- | ---------- | --------- |
| The renderer's main thread         | 3.0 ms  | 3.9 ms         | 4.2 ms        | 3.5 ms     | 4.3 ms    |
| The display compositor             | 0.8 ms  | 2.7 ms         | 2.7 ms        | 0.9 ms     | 0.9 ms    |
| The whole browser                  | 5.1 ms  | 8.1 ms         | 8.3 ms        | 5.6 ms     | 6.5 ms    |
| The painter's own drawing          | 1.4 ms  | 1.4 ms         | 1.5 ms        | 1.4 ms     | 1.4 ms    |

The painter's work is the same at every ratio. A ratio that a context only emulates has Chromium's software
compositor scale every frame, which triples its CPU; the browser then needs 8 ms or more a frame, past the quota's 6.7,
so every thread waits for the next period and the painter's measured time stretches with it: 5.4 and 5.5 ms a frame,
its 95th-percentile frame 33 and 50 ms. At a real ratio, as a desktop scaled to 125 % starts Chromium, the compositor
costs what it does at 1, and only the canvas's larger raster on the main thread grows, by 0.5 and 1.3 ms. At 1.5 that
brings the browser to the quota, so a frame is still sometimes stretched there.

| Trades at 1,000,000 rows, throttled    | Before, emulated ratio | Before, real ratio | After, real ratio |
| -------------------------------------- | ---------------------- | ------------------ | ----------------- |
| Drawing per frame, ratio 1             | 2.3 ms                 | 1.8 ms             | 1.7 ms            |
| Drawing per frame, 1.25                | 5.4 ms                 | 2.5 ms             | 2.6 ms            |
| Drawing per frame, 1.5                 | 5.5 ms                 | 3.3 ms             | 3.8 ms            |
| 95th-percentile frame, 1, 1.25 and 1.5 | 17, 33 and 50 ms       | 17, 17 and 17 ms   | 17, 17 and 17 ms  |
| Draws in a scroll of 240 frames        | 257                    | 257                | 240               |

Each "real" figure is the median of nine scrolls, three in each of three runs, before and after alternating, at load
averages of 1.5 to 7.6; plain, the drawing is 1.4 to 1.5 ms a frame at every ratio, before and after. The harness
scrolls one step a frame, so this step changes little of its figure: the 17 draws it saves are the partial ones when
rows arrived between frames, which leaves each remaining draw's average a little higher. What it saves is a real
desktop's: several paints for a notch and for the events of one frame. Every ratio is within the throttled budget of
8 ms; the frame at 1.5 that waits for the quota is the main thread's raster of the canvas, which step 6.4.4, copying
the rows that stay, is meant to reduce.

## Step 6.3.2: a progressive load

Step 6.3.2 broke the 3.2 s of 6.3.1 down, made the load show its rows as they arrive, and measured it with this harness
before and after, on trades at 150,000 and 1,000,000 rows, plain and throttled, one round, on 2026-11-09 (`--datasets
trades --sizes 150000,1000000 --rounds 1`), each figure the median of three loads, one at each ratio. The final pair
of runs is on `main` at `1af39dc` and on this step rebased onto it, with step 6.4.3's browser started at each ratio,
one after the other at load averages of 5 to 15.

Where the throttled load of 1,000,000 trades went before, from marks in the page and the worker, three runs:

| From the navigation                     | Time           | What it is                                                            |
| --------------------------------------- | -------------- | --------------------------------------------------------------------- |
| To the fetch                            | 0.41 to 0.62 s | The page's script and its first render                                |
| The download and `arrayBuffer()`        | 1.26 to 1.79 s | 304 MB from the server to the page, whole, before the engine sees any |
| The worker's start, beside the download | 0.29 to 0.44 s | Its script, then compiling the WebAssembly; never the longest         |
| The engine's load                       | 1.14 to 1.19 s | One call, every batch                                                 |
| The view's opening and the first draw   | 0.23 to 0.29 s | Opening the view on the whole table, its first window, the canvas     |
| First rows, which were the whole table  | 3.07 to 3.89 s |                                                                       |

The transfer was the largest part and came before any row could show, so the step streams it. What changed:

- `useDataset`'s source may return the response itself, `() => fetch(url)`. The page checks its status and its
  `Content-Length` against the byte limit before reading the body, then posts each chunk to the worker as the network
  delivers it, the chunk's own buffer moved; a body without a length is refused as soon as it passes the limit.
- The engine reads a stream that is still arriving: the batches whose bytes have all come, a slice of at most 16,384
  rows a step, with the worker answering the page between steps. A first load's table joins the catalog with its first
  slice and publishes its rows to its views then, and again each time they have grown fourfold. Its key is checked as
  rows come, and indexed only once the keys stop rising. Its columns are sized from the response's length, with a 3%
  margin, once.
- `useDataset` reports `progress`, the rows read of the rows expected; the grid's status bar says how many are still
  to come. A reload is still staged whole and checked before the table changes.

| Trades, first rows and fully loaded | Before             | After                       |
| ----------------------------------- | ------------------ | --------------------------- |
| 150,000, plain                      | 330 and 330 ms     | 240 and 297 ms              |
| 150,000, throttled                  | 1,370 and 1,370 ms | 1,315 and 1,605 ms          |
| 1,000,000, plain                    | 973 and 973 ms     | 242 and 718 ms              |
| 1,000,000, throttled                | 3,520 and 3,520 ms | 1,657 and 4,107 ms          |
| WebAssembly, 150,000                | 53 MB              | 63 MB                       |
| WebAssembly, 1,000,000              | 242 MB             | 269 MB, 0.9 times the Arrow |
| Browser at rest, 1,000,000          | 760 MB             | 774 MB                      |

An earlier pair, before the rebase and with the ratios emulated, at load averages of 1 to 5, agrees: 291 and 291 ms
against 208 and 258 ms, 1,345 and 1,345 ms against 1,557 and 1,938 ms, 832 and 832 ms against 233 and 675 ms, and
3,382 and 3,382 ms against 1,785 and 4,519 ms. The same build with the harness's source reading the bytes whole,
`response.arrayBuffer()`, one run: 258 and 314 ms and 1,587 and 1,978 ms at 150,000 rows, 503 and 873 ms and 2,756 and
4,378 ms at 1,000,000, plain and throttled. Natively the progressive load of 1,000,000 trades takes 0.26 s with a view
open and refreshed at each publish, against 0.22 s for the engine's load alone.

**The 1 s target for the first rows of 1,000,000 trades, throttled, is missed: 1.7 s, from 3.5 s.** Under the CPU
quota the page reaches its fetch at about 0.55 s, and the worker, which starts with the load, has its engine ready at
about 0.95 s; the first slice is published at about 1.18 s and the view opens at about 1.29 s, but the page's thread,
which the quota shares with the download and the worker, draws the first rows 0.1 to 0.5 s later. The page's start and
the worker's are before any row can show; `ParallaxProvider`'s `prewarm` starts the worker no sooner on this page,
whose provider and load mount together.

**The 3 s target for 1,000,000 trades fully loaded, throttled, is missed further: 4.1 s, from 3.5 s, and 150,000 trades
fully loaded throttled take 1.6 s, from 1.4 s.** The quota is the whole browser's, so the download and the load that
now overlap share one budget and finish no sooner, and the grid that now shows rows during the load draws them each
time they are published: with the publishes only at the first slice and at the end, one load took 3.9 s, against 4.3
to 4.5 s publishing each time the rows doubled, which is why they now publish each time the rows grow fourfold. Plain,
where the download and the engine run on cores of their own, the whole table arrives sooner than before. Steps 6.3.8's
narrower storage, 6.4's cheaper drawing, and 6.10's measurement on a real desktop, whose cores the quota does not share
out, are the next to act on it.

Two designs were measured and dropped on the way. Moving the body's `ReadableStream` to the worker, so that the page's
thread did nothing for each chunk, took 5.4 s throttled to load 1,000,000 trades: a moved stream sends a chunk only when
the worker asks for it, and under the quota each of its 186 round trips is slow. Copying the chunks into pieces of
4 MiB on the page, to post fewer messages, moved them at about 110 MB/s throttled, against the network's 270, since the
copying is the page thread's. The page now posts each chunk as it came, its buffer moved, about 450 messages for
1,000,000 trades.

The generated client's Arrow calls answer with a `Blob`, which has already arrived whole, so an app that wants its first
rows sooner fetches the route itself until `@basis/ui`'s fetcher can hand back the response.

## Step 6.3.3: sorts on keys

Step 6.3.3 changed the flat sort and measured it with this harness before and after, on trades at 1,000,000 rows,
plain and throttled, three rounds, on 2026-11-09 and 2026-11-10 (`--datasets trades --sizes 1000000`): one run before,
at a load average of 0.8 to 1.8, and two after, at 0.6 to 2.9, the second with 150,000 trades too. What changed:

- Before, each comparison of the sort built two keys for each sort column and compared them through the column's
  order, and every rebuild sorted again: a toggle, a filter, a publish of more rows. Natively, one thread, the ticker
  sorted in 0.34 s, the quantity in 0.41 s, and the trade date in 0.015 s, the trades being in date order, but its
  toggle in 0.22 s; the filter under the sort spent 0.09 s of its 0.10 s sorting again.
- Each sort column's value is now an integer that sorts as it does: a text code's rank in the view's order or the
  dictionary's, an integer, date or timestamp with its sign flipped, a float's bits in `f64::total_cmp`'s order with
  negative zero as zero, a decimal less the column's least value, and on two words only when its range passes 2^64.
  The rows, in the tie order of the table's key or of insertion, are sorted stably by it a byte at a time, as `u32`s
  when the range fits, skipping the bytes all share, and not at all when they are already in order. Natively a radix
  sort of 1,000,000 such keys took 4 to 12 ms, a pattern-defeating sort of the keys packed with each row's place 20 ms,
  and a stable merge sort of pairs 14 to 23 ms, so the radix stays.
- The table keeps the tie order and the last four orders it sorted, each four bytes a row, and forgets them whenever
  its rows change: a batch added, a publish, a load or an upsert, and a kept order also carries the load version and
  slot count it was sorted at. An order on one column records where each run of equal values starts, so its toggle is
  its runs taken backwards, each run's rows in tie order and the nulls still last, as the comparison sort ordered them;
  a sort on several columns is a stable counting pass for each column, last first, on ranks read from each column's
  kept order. A filter walks the kept order, keeping the rows a mask of the passing rows holds.
- The comparison sort stays for a detail view's groups, which sort each the first time they show, and as the
  reference: a property test sorts random tables with nulls, ties, negative zero, infinities, decimals past a word,
  each type, the view's text orders and up to three columns, through a progressive load, a keyed reload and an upsert,
  and checks every order, kept or not, against it. `tests/oracle.rs`, `tests/incremental.rs`, the transcript's
  fingerprint and the WebAssembly tests pass unchanged.

| Trades at 1,000,000 rows   | Before, plain | After, plain | Before, throttled | After, throttled |
| -------------------------- | ------------- | ------------ | ----------------- | ---------------- |
| Sort the ticker, text      | 505 ms        | 31 ms        | 2,117 ms          | 73 and 90 ms     |
| Its toggle                 | 500 ms        | 11 and 14 ms | 2,089 ms          | 41 and 44 ms     |
| Sort the quantity, decimal | 525 ms        | 29 and 30 ms | 2,181 ms          | 123 and 130 ms   |
| Its toggle                 | 533 ms        | 11 and 15 ms | 2,149 ms          | 39 and 44 ms     |
| Sort the trade date        | 34 ms         | 14 and 24 ms | 127 ms            | 58 and 61 ms     |
| Its toggle                 | 440 ms        | 9 and 15 ms  | 1,319 ms          | 41 and 49 ms     |
| A filter under the date    | 203 ms        | 30 ms        | 682 ms            | 98 and 119 ms    |
| The filter alone           | 27 ms         | 28 and 29 ms | 112 ms            | 101 and 110 ms   |
| WebAssembly at its peak    | 269 MB        | 273, 277 MB  | 269 MB            | 273, 277 MB      |

At 150,000 trades, after, one run: the sorts take 12 to 16 ms plain and 40 to 60 ms throttled, the toggles 8.5 to 14
and 11 to 32 ms. Natively, one thread, the profile of `examples/measure.rs`, which now times each toggle and the filter
under the date's: the ticker sorts in 13 ms, 5 of them the tie order, the quantity in 15 ms, the trade date in 4 ms,
each toggle in 2 ms, and the filter under the date in 17 ms, all of it the filter. A no-op change, the harness's reset,
costs 27 to 32 ms throttled, the frame and its drawing, so a toggle is mostly that.

**The 250 ms target for a first sort is met, at 73 to 130 ms throttled, and the 50 ms target for a toggle, at 39 to
49 ms. The 50 ms target for a filter under a sort is missed: 98 to 119 ms throttled, from 682 ms.** Walking the kept
order costs a few milliseconds; the rest is the filter itself, which alone takes 101 to 110 ms throttled, a key built
for each row and tested, and which step 6.3.4's typed filters are for. WebAssembly's peak rises by 4 to 8 MB, the kept
orders and the sort's scratch. The host budgets for these runs' sorts, toggles and filter under a sort are now twice
the slowest time or 20 ms more, whichever is greater.

## Step 6.3.4: filters as kernels

Step 6.3.4 changed the flat filter and measured it with this harness before and after, on trades at 1,000,000 rows,
plain and throttled, and 150,000 after, on 2026-11-10: two runs before, at load averages of 0.4 to 5.6, and two after,
at 0.2 to 6.3. The harness's protocol gained a filter for each operator and type the filters take: "in" on text,
"contains", "not null", an integer, a date, a decimal, a date range, a filter added beside another, and its clearing.
What changed:

- Before, a filter built a key for each row and tested it through the column's order, and a search did so for each
  column of each row. Natively, one thread, a filter of 1,000,000 trades took 9 to 30 ms, all of it testing.
- A view now tests a column's rows all at once: a loop for each column type and operator writes a bit for each row, 64
  to a word, which the validity's words then mask. A text column decides each dictionary code once, then reads its
  codes. A list of several values is a search of the sorted list. The columns of a search are ORed and a view's
  filters ANDed a word at a time.
- The table keeps the last few filters' words, about 125 kB each at 1,000,000 rows, until its rows change, so a filter
  added beside others, or a sort changed under them, tests only what is new. A sort walks its kept order through the
  words.
- A property test checks, on random tables with nulls and every type, that each filter's words hold what testing each
  row with the old code says. `tests/oracle.rs`, `tests/incremental.rs`, the transcript's fingerprint and the
  WebAssembly tests pass unchanged.

| Trades at 1,000,000 rows    | Before, plain | After, plain | Before, throttled | After, throttled |
| --------------------------- | ------------- | ------------ | ----------------- | ---------------- |
| A filter, text equal        | 26 to 30 ms   | 13 ms        | 102 ms            | 31 and 51 ms     |
| "In", text                  | 27 to 30 ms   | 8 and 9 ms   | 72 ms             | 51 and 52 ms     |
| "Contains"                  | 28 to 30 ms   | 13 and 14 ms | 90 ms             | 32 and 42 ms     |
| An integer                  | 30 and 31 ms  | 9 and 18 ms  | 170 ms            | 38 and 61 ms     |
| A decimal                   | 29 and 30 ms  | 9 and 11 ms  | 110 ms            | 31 and 59 ms     |
| A date range                | 29 and 30 ms  | 12 and 13 ms | 112 ms            | 53 and 71 ms     |
| A filter added beside one   | 32 and 33 ms  | 7 and 14 ms  | 120 ms            | 30 and 46 ms     |
| A filter under a sort       | 30 and 31 ms  | 11 to 14 ms  | 108 ms            | 31 and 38 ms     |
| A search across the columns | 95 and 97 ms  | 14 ms        | 331 ms            | 32 and 40 ms     |

**The 100 ms target for a filter or a search is met, at 31 to 71 ms throttled, and the 50 ms target for a filter under
a sort, at 31 and 38 ms, the medians of three rounds; one round of each run took 130 and 150 ms, the first after the
load.** Natively the filters now take under a millisecond, so a throttled figure is mostly the frame, its drawing and
the reply's trip. The host budgets for the 1,000,000 trades' filter, filter under a sort and search are now about
twice the slowest median.

## Step 6.4.4: a scroll that moves pixels

Step 6.4.4 made a scroll by rows, or across, copy the pixels that stay and paint only the band or strip it exposed,
and measured trades at 1,000,000 rows with this harness before and after, on 2026-11-10 (`--datasets trades --sizes
1000000`, three rounds), three runs of each, before and after alternating, at load averages of 1.3 to 9.1; each
figure is the median of nine scrolls. Before is `main` at `2b75cab` with this step's harness. What changed:

- A scroll by rows copies the body's band, between the header and the totals row, by those rows; a scroll across
  copies the scrolling columns, header and totals with them, by the distance. The copy goes to a scratch canvas and
  back, in whole device pixels, then the rows or strip exposed are painted under a clip to them, and the cells beside
  it whose text or rows changed. Anything that is not a pure scroll, a distance that is not whole device pixels, one
  as large as the area, and a scroll to or from the left edge where the pinned columns' edge shows, paint everything.
- The grid counts the device pixels it repaints and the copies it makes, in `drawStats()`, and the bench reads them,
  and the main thread's busy time.

| Trades at 1,000,000 rows, 3 rows a frame | Before, 1, 1.25 and 1.5         | After, 1, 1.25 and 1.5   |
| ---------------------------------------- | ------------------------------- | ------------------------ |
| Area repainted per frame, device pixels  | 1,081,338, 1,691,245, 2,437,284 | 98,928, 153,886, 225,145 |
| The same, of the canvas                  | 100 %                           | 9.1 to 9.2 %             |
| Drawing per frame, throttled             | 1.80, 2.31 and 2.84 ms          | 1.81, 1.94 and 3.11 ms   |
| Main thread per frame, throttled         | 4.52, 6.15 and 8.52 ms          | 3.94, 5.24 and 7.93 ms   |
| Drawing per frame, plain                 | 1.47, 1.53 and 1.54 ms          | 1.15, 1.41 and 1.62 ms   |
| Main thread per frame, plain             | 3.11, 3.56 and 4.11 ms          | 2.39, 3.01 and 3.62 ms   |
| 95th-percentile frame, throttled         | 17 ms at each                   | 17 ms at each            |

The area falls elevenfold: three rows of the thirty-three in view. The time falls less, because copying is not free.
The drawing counter times the painter's calls, and a canvas drawn without a GPU is rasterized later, on the main thread,
so the main thread's busy time is the figure that counts the copy. A first build drew the canvas onto itself: its
drawing counter read 1.5, 1.3 and 1.8 ms throttled, but in a page of its own, at 1.5, a copy of the canvas onto itself
and three rows took 2.5 ms against 1.1 ms for painting a simple grid whole, since Chromium snapshots the whole canvas
and copies it again before the next drawing; through a scratch canvas the copy and three rows took 1.15 ms, so the
painter copies through one. What is left of the time is the copy, which moves every pixel that stays, out and back:
about 1 ms a frame at 1.5 on the build host. Every ratio is within the throttled drawing target of 8 ms, before and
after. Whether a remote desktop sends a copied scroll as less than a repainted one is step 6.10's to measure: every
pixel of the body changes on screen either way, and the area here is what the browser rasterizes.
