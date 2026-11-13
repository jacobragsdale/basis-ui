No release blocker in these four crates, but 13 findings: one trap on spec-valid Arrow, two load-path defects that hit every large basis-fed table, and an undiagnosable trap path. Nothing was compiled or run (per the rules); "confirmed" means confirmed by reading the cited lines.

## Findings

**1. An all-null dictionary-encoded text column traps the engine** — fix before release (blocker if any app loads Arrow not written by basis)

- Where: `packages/parallax/crates/parallax-engine/src/column.rs:741-743`, reached from `packages/parallax/crates/parallax-wasm/src/lib.rs:655,665,678`. Engine code, but the input crosses my boundary.
- Defect: `extend_text` calls `normalized_keys()` on every dictionary array, and arrow-array asserts the dictionary is non-empty.
- Scenario: a stream has a `dictionary<int32, utf8>` column that is entirely null (pandas all-NaN categorical, `dictionary_encode()` of nulls, or a zero-row batch). arrow-ipc 60.1 `reader.rs:179-190` deliberately synthesises an empty values array for this case. `types.rs:68` accepts the type, then `assert_ne!(v_len, 0)` (arrow-array 60.1 `dictionary_array.rs:1057`) panics. Every dataset on the page is lost and the message blames memory.
- Confidence: confirmed. basis itself writes plain `utf8`, so only other sources trigger it.

**2. A streamed first load with no usable length reallocates every column on every 16,384-row step** — fix before release

- Where: `packages/parallax/crates/parallax-wasm/src/lib.rs:162-174, 640-644, 664, 883-892`.
- Defect: with no estimate `room_for` returns rows-so-far, and `Table::reserve` is `reserve_exact` (`crates/parallax-engine/src/table.rs:468-473`, `column.rs:460-470`), which defeats `Vec`'s amortised growth.
- Scenario: basis gzips Arrow (`basis: packages/api/src/basis/api/app.py:99-102,175`), so `contentLength()` returns null (`packages/parallax/src/engine/stream.ts:19-20`). Simulating the room logic for 1,000,000 rows gives:

  | Stream shape                                | Full reallocations | Rows copied, as multiples of the table |
  | ------------------------------------------- | ------------------ | -------------------------------------- |
  | Bench: 65,536-row batches, `Content-Length` | 2                  | 0.25×                                  |
  | One batch, `Content-Length`                 | 47                 | 19×                                    |
  | No length (gzip or chunked)                 | 62                 | 31×                                    |

  For a 449 MB table the last row is about 14 GB of memcpy plus heap churn, on the path the README recommends for large tables (`arrowResponse`).

- Confidence: mechanism confirmed; the time cost is arithmetic, not measured.

**3. basis writes each table as one record batch, so the whole stream is copied into wasm and pinned for the whole load** — fix before release

- Where: `packages/parallax/crates/parallax-protocol/src/ipc.rs:304-309, 486-503` and `crates/parallax-wasm/src/lib.rs:596-618`.
- Defect: a message is read only once its whole body has arrived, copied into one buffer, and held by `pending` until the last slice.
- Scenario: `basis: packages/api/src/basis/api/arrow.py:68-70,188-189` calls `write_table` with no `max_chunksize`. A 460 MB table shows no rows until all of it is downloaded, so progressive display does nothing. Wasm high-water is stream plus table, about 910 MB against the 449 MB the design budgets, and never returns. A reload adds a staged copy, which passes the 1 GiB threshold and arms a planned restart on the next unload (`src/engine/memory.ts:45`).
- The budgets were measured on 65,536-row batches (`crates/parallax-datagen/src/main.rs:41`). `write_table(table, max_chunksize=65_536)` in basis fixes it.
- Confidence: the copy and pin are confirmed; one-batch-per-chunk is pyarrow's documented behaviour, not run; the memory figures are arithmetic.

**4. No panic hook, so every Rust panic is reported as "most likely out of memory"** — fix before release

- Where: `packages/parallax/crates/parallax-wasm/src/lib.rs:202-212` (no `set_hook` anywhere in the crate).
- Scenario: any panic (finding 1, an `expect`, an index) surfaces as `RuntimeError: unreachable`. `src/engine/serve.ts:48-50` forwards only name and message, drops `error.stack`, and logs nothing; `src/engine/limits.ts:113-114` adds the memory guess. The name section is removed (`scripts/build-wasm.ts:115`, a recorded decision).
- The built wasm already contains the panic file paths in its data section, so a hook that passes the message to the worker costs almost nothing.
- Confidence: confirmed.

**5. `catch_up` applies several missed change sets against the newest table, which `View::apply` does not support for pivots** — latent today; blocker for live updates or any batching of refreshes

- Where: `packages/parallax/crates/parallax-session/src/lib.rs:629-639`.
- Scenario: `apply` adds each change's slots with their current values (`crates/parallax-engine/src/view.rs:1443-1457`). A row updated a→b→c across two missed keyed loads nets `S − a + 2c − b` instead of `S − a + c`: a silently wrong sum.
- Not reachable today: the worker calls `refresh()` after every publish and finish (`src/engine/worker-loads.ts:233,243`).
- The test that claims to cover it, `crates/parallax-session/tests/reloads.rs:209-223`, uses a flat layout (line 19), and flat views simply rebuild (`view.rs:1431-1434`).
- Confidence: confirmed.

**6. Duplicate column names silently load the first column's data into every duplicate** — fix before release (cheap: refuse in `Table::new`)

- Where: `packages/parallax/crates/parallax-engine/src/table.rs:156-178, 250-291`. Engine code, boundary input.
- Scenario: a stream with fields `[id, id]` (a join result served straight from a driver) loads; `column_by_name` returns the first match for both, so the grid and exports show column 1 twice.
- Confidence: confirmed. basis's model-declared columns cannot produce duplicates.

**7. CI never builds or tests the binary configuration that ships** — polish

- Where: `.github/workflows/ci.yml:17-19` against `packages/parallax/scripts/build-wasm.ts:105-109`.
- Scenario: CI sets `RUSTFLAGS=-D warnings` globally. Cargo treats `RUSTFLAGS` and target rustflags as mutually exclusive, so `CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUSTFLAGS=+simd128` is ignored in every CI build. The shipped tarball is built on a dev machine by `/home/jacob/dev/basis-ui-dist/pack.sh` with SIMD.
- Confidence: config confirmed. The local wasm's `target_features` section does list `simd128`. The precedence is from Cargo's documentation.

**8. Hostile IPC bytes can still panic inside arrow** — polish

- Where: arrow-ipc 60.1 `reader.rs:66`, reached from `packages/parallax/crates/parallax-protocol/src/ipc.rs:511`.
- Scenario: a verified header whose buffer offset or length exceeds the body hits `slice_with_length`'s assert (arrow-buffer `immutable.rs:299`).
- A dictionary-of-dictionary field would also reach `unreachable!` at `crates/parallax-engine/src/column.rs:693`, because `types.rs:68` recurses. I did not establish that arrow-ipc decodes such a field.
- Confidence: the first is confirmed; the second is plausible.

**9. `addLoadBytes` after `endLoadBytes` panics** — polish

- Where: `packages/parallax/crates/parallax-protocol/src/ipc.rs:164-165`, via `crates/parallax-wasm/src/lib.rs:488-490`.
- Scenario: the exported API asserts instead of returning an error.
- Confidence: confirmed. The shipped worker cannot send that order (`src/engine/worker-loads.ts:100-103,142`).

**10. `SetViewport` and `UpdateView.viewport` have no cell cap** — polish

- Where: `packages/parallax/crates/parallax-session/src/lib.rs:829-840, 1084-1104`.
- Scenario: `FetchWindow` is capped at 1,000,000 cells (lines 1089-1103). A viewport with a huge `row_count` formats the whole view, about 40M cells on a full table.
- Confidence: plausible. I did not establish that the grid can send one, or the memory it would take.

**11. Exports run to completion in one synchronous call** — polish

- Where: `packages/parallax/crates/parallax-wasm/src/lib.rs:346-385`.
- Scenario: a 1M×40 CSV formats 40M cells with no yield, so the worker answers no viewport for any dataset until it ends. Loads yield between slices; exports do not.
- Confidence: plausible; the duration is not measured.

**12. CSV protects formula-like text only** — polish

- Where: `packages/parallax/crates/parallax-export/src/lib.rs:809-811, 903-909`.
- Scenario: text that reads as a number is written raw. In Excel `037833100` loses its zero and `912828E72` becomes 9.12828E+77, and CSV is the mandated path above 1,000,000 cells.
- Confidence: confirmed that nothing guards or notes it; the Excel behaviour is from knowledge.

**13. Tests that do not test their claim** — polish

- `packages/parallax/crates/parallax-wasm/src/lib.rs:1141-1145`: the "refused by its headers alone" case is refused for truncation, and would pass with no row limit at all.
- `packages/parallax/crates/parallax-wasm/tests/load.rs`: every wasm test drives `loadTable`, which no TypeScript calls. `beginLoad`, `addLoadBytes`, `stepLoad` and `finishLoad` have no wasm-level test.
- `crates/parallax-export/tests/export.rs`: the cell-exactness tests run the native `constant_memory` writer. The in-memory writer the browser uses for flat sheets (`crates/parallax-export/src/lib.rs:565-569`) gets only a "starts with PK" check.
- The wasm transcript test runs the dev profile in Node, not the shipped fat-LTO SIMD build.

## Overall quality

These crates are in better shape than "written by agents" suggests. There is no `unsafe`, and no `forget` or `into_raw`. Arithmetic on page-supplied lengths is checked or saturating, and unknown and closed view ids all return errors. The proto has one removed field, properly reserved. The only page-reachable panic in the four crates themselves is finding 9.

The xlsx export is careful: cells hold the true doubles, strings never become formulas, the cell cap is exact and checked before writing, and the Notes sheet says where Excel differs. I found nothing wrong at CSV chunk boundaries.

The weak spot is that the load path was tuned and benchmarked on a stream shape (many batches, plain `Content-Length`) that basis does not produce. Session code inherited from the server era — multi-change catch-up, dataset parameters, lock poisoning — is still present; the catch-up is wrong for pivots (finding 5).

## What a user sees on a trap

The grid is replaced by "The engine in this page stopped after a fatal error (RuntimeError: unreachable), most likely because it ran out of memory… load the data again", and loaded datasets are refetched, up to two recoveries.

It is not diagnosable: there is no panic message, no stack and no console log, so a logic panic cannot be told from out-of-memory.

## Not reached

- `crates/parallax-session/tests/charts.rs` and `tests/points.rs` (test names only).
- `crates/parallax-session/src/testing.rs` past line 120.
- `crates/parallax-export/examples/`.
- The prost-generated code and `schema/layout.schema.json`.
- `Cargo.lock` advisories: versions listed only. cargo-deny runs in CI with no ignores.
- Engine and TypeScript were read only where my crates call them or are called.
