No release blocker in these four crates, but 13 findings: one trap on spec-valid Arrow, two load-path defects that hit every large basis-fed table, and an undiagnosable trap path. Nothing was compiled or run (per the rules); "confirmed" means confirmed by reading the cited lines.

## Findings

**1. An all-null dictionary-encoded text column traps the engine** — fix before release (blocker if any app loads Arrow not written by basis)

- Where: `packages/parallax/crates/parallax-engine/src/column.rs:741-743`, reached from `packages/parallax/crates/parallax-wasm/src/lib.rs:655,665,678`. Engine code, but the input crosses my boundary.
- Defect: `extend_text` calls `normalized_keys()` on every dictionary array, and arrow-array asserts the dictionary is non-empty.
- Scenario: a stream has a `dictionary<int32, utf8>` column that is entirely null (pandas all-NaN categorical, `dictionary_encode()` of nulls, or a zero-row batch). arrow-ipc 60.1 `reader.rs:179-190` deliberately synthesises an empty values array for this case. `types.rs:68` accepts the type, then `assert_ne!(v_len, 0)` (arrow-array 60.1 `dictionary_array.rs:1057`) panics. Every dataset on the page is lost and the message blames memory.
- Confidence: confirmed. basis itself writes plain `utf8`, so only other sources trigger it.

- Done in Engine: an empty dictionary, a null column and a repeated name load or refuse, never trap: as `engine.md` 1. The worker's test loads a stream whose dictionary column is null in every row, and reloads it.

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

- Done in Engine: a panic says what and where, and a stream with no length grows its columns a few times: the rows expected are estimated from the rows the batches' headers announce, the rest of a batch being sliced included, so one batch makes room for its rows once, with or without the stream's length; room that is outgrown grows by half again at least, so a stream with no length copies its columns about ten times from its first batch to 300,000 rows rather than once a batch; and a first load gives back the room it did not use once it ends, each vector shrunk where it lies. Test: `a_stream_with_no_length_grows_its_columns_a_few_times`, which counted 19 reallocations for one batch of 300,000 rows before.

**3. basis writes each table as one record batch, so the whole stream is copied into wasm and pinned for the whole load** — fix before release

- Where: `packages/parallax/crates/parallax-protocol/src/ipc.rs:304-309, 486-503` and `crates/parallax-wasm/src/lib.rs:596-618`.
- Defect: a message is read only once its whole body has arrived, copied into one buffer, and held by `pending` until the last slice.
- Scenario: `basis: packages/api/src/basis/api/arrow.py:68-70,188-189` calls `write_table` with no `max_chunksize`. A 460 MB table shows no rows until all of it is downloaded, so progressive display does nothing. Wasm high-water is stream plus table, about 910 MB against the 449 MB the design budgets, and never returns. A reload adds a staged copy, which passes the 1 GiB threshold and arms a planned restart on the next unload (`src/engine/memory.ts:45`).
- The budgets were measured on 65,536-row batches (`crates/parallax-datagen/src/main.rs:41`). `write_table(table, max_chunksize=65_536)` in basis fixes it.
- Confidence: the copy and pin are confirmed; one-batch-per-chunk is pyarrow's documented behaviour, not run; the memory figures are arithmetic.

- Done in Engine: a panic says what and where, and a stream with no length grows its columns a few times, as far as parallax can: one batch now makes room for its rows once (finding 2), and its copy is freed with its last slice, as before.
- Not done: the copy itself. Arrow's reader decodes a message from one buffer holding its whole body, and every array of the batch slices that buffer, so the body stays in WebAssembly's memory until the batch's last slice is read. A table sent as one batch therefore costs its stream and its table at once, about 910 MB at 1,000,000 rows against the 449 MB the design budgets, and since WebAssembly's memory never shrinks, that high-water stays until the worker is replaced, which `src/engine/memory.ts` does once it passes 1 GiB and is idle; a reload adds its staging. Freeing the body column by column would need a decoder of parallax's own, with a buffer per column. The fix is basis's: `write_table(table, max_chunksize=65_536)`, which the orchestrator has asked basis for.

**4. No panic hook, so every Rust panic is reported as "most likely out of memory"** — fix before release

- Where: `packages/parallax/crates/parallax-wasm/src/lib.rs:202-212` (no `set_hook` anywhere in the crate).
- Scenario: any panic (finding 1, an `expect`, an index) surfaces as `RuntimeError: unreachable`. `src/engine/serve.ts:48-50` forwards only name and message, drops `error.stack`, and logs nothing; `src/engine/limits.ts:113-114` adds the memory guess. The name section is removed (`scripts/build-wasm.ts:115`, a recorded decision).
- The built wasm already contains the panic file paths in its data section, so a hook that passes the message to the worker costs almost nothing.
- Confidence: confirmed.

- Done in Engine: a panic says what and where, and a stream with no length grows its columns a few times: the worker sets a panic hook when it starts that keeps the panic's message and place; after a trap, `serve.ts` asks the engine for it with `takePanic`, a free function, since the trapped worker stays borrowed, sends it as the trap's message and logs it to the console; `trapReason` in `limits.ts` names a panic an internal error, and keeps the out-of-memory wording for a trap with no panic, which is what a failed allocation is: it aborts without one. Tests: `a_panic_is_kept_with_its_place_for_the_page` natively, and `tests/unit/trap-reason.test.ts`.

**5. `catch_up` applies several missed change sets against the newest table, which `View::apply` does not support for pivots** — latent today; blocker for live updates or any batching of refreshes

- Where: `packages/parallax/crates/parallax-session/src/lib.rs:629-639`.
- Scenario: `apply` adds each change's slots with their current values (`crates/parallax-engine/src/view.rs:1443-1457`). A row updated a→b→c across two missed keyed loads nets `S − a + 2c − b` instead of `S − a + c`: a silently wrong sum.
- Not reachable today: the worker calls `refresh()` after every publish and finish (`src/engine/worker-loads.ts:233,243`).
- The test that claims to cover it, `crates/parallax-session/tests/reloads.rs:209-223`, uses a flat layout (line 19), and flat views simply rebuild (`view.rs:1431-1434`).
- Confidence: confirmed.

- Done in Engine: charts leave out dates past the calendar, and a view behind by two loads rebuilds: a view applies a missed change set only when it missed exactly one, and rebuilds after more; a view keeps at most one change set (`HISTORY` was 16), so a view two loads behind holds no old rows. Test: `a_pivot_that_missed_two_keyed_reloads_shows_the_sums_of_the_last` in `reloads.rs`, a pivot whose row goes 1, 10, 100 across two missed keyed loads, which showed a wrong sum before; the flat test that claimed it is now `a_keyed_view_keeps_the_diff_of_one_missed_reload_and_rebuilds_after_more`.

**6. Duplicate column names silently load the first column's data into every duplicate** — fix before release (cheap: refuse in `Table::new`)

- Where: `packages/parallax/crates/parallax-engine/src/table.rs:156-178, 250-291`. Engine code, boundary input.
- Scenario: a stream with fields `[id, id]` (a join result served straight from a driver) loads; `column_by_name` returns the first match for both, so the grid and exports show column 1 twice.
- Confidence: confirmed. basis's model-declared columns cannot produce duplicates.

- Done in Engine: an empty dictionary, a null column and a repeated name load or refuse, never trap: as `engine.md` 8.

**7. CI never builds or tests the binary configuration that ships** — polish

- Where: `.github/workflows/ci.yml:17-19` against `packages/parallax/scripts/build-wasm.ts:105-109`.
- Scenario: CI sets `RUSTFLAGS=-D warnings` globally. Cargo treats `RUSTFLAGS` and target rustflags as mutually exclusive, so `CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUSTFLAGS=+simd128` is ignored in every CI build. The shipped tarball is built on a dev machine by `/home/jacob/dev/basis-ui-dist/pack.sh` with SIMD.
- Confidence: config confirmed. The local wasm's `target_features` section does list `simd128`. The precedence is from Cargo's documentation.

- Not done here: CI's flags are step 7.13's, by the brief; `ci.yml` is left to it.

**8. Hostile IPC bytes can still panic inside arrow** — polish

- Where: arrow-ipc 60.1 `reader.rs:66`, reached from `packages/parallax/crates/parallax-protocol/src/ipc.rs:511`.
- Scenario: a verified header whose buffer offset or length exceeds the body hits `slice_with_length`'s assert (arrow-buffer `immutable.rs:299`).
- A dictionary-of-dictionary field would also reach `unreachable!` at `crates/parallax-engine/src/column.rs:693`, because `types.rs:68` recurses. I did not establish that arrow-ipc decodes such a field.
- Confidence: the first is confirmed; the second is plausible.

- Done in Engine: charts leave out dates past the calendar, and a view behind by two loads rebuilds: the stream's reader refuses a record or dictionary batch whose buffer has a negative offset or length, or reaches past the body, before arrow's `slice_with_length` can assert, both when it counts a whole stream's rows and when it decodes. Arrow validates the arrays it builds by default (no `skip_validation`), so the buffers were the gap. The dictionary of dictionaries is done in the first commit, as `engine.md` 1. Test: `a_buffer_past_its_body_is_refused_before_arrow_reads_it`, which patches a real stream's header.

**9. `addLoadBytes` after `endLoadBytes` panics** — polish

- Where: `packages/parallax/crates/parallax-protocol/src/ipc.rs:164-165`, via `crates/parallax-wasm/src/lib.rs:488-490`.
- Scenario: the exported API asserts instead of returning an error.
- Confidence: confirmed. The shipped worker cannot send that order (`src/engine/worker-loads.ts:100-103,142`).

- Done in Engine: charts leave out dates past the calendar, and a view behind by two loads rebuilds: `add_bytes` refuses a piece after the stream has ended, `app's stream has ended; it takes no more bytes`, and the load goes on as it was. Test: `bytes_after_the_stream_ended_are_refused`.

**10. `SetViewport` and `UpdateView.viewport` have no cell cap** — polish

- Where: `packages/parallax/crates/parallax-session/src/lib.rs:829-840, 1084-1104`.
- Scenario: `FetchWindow` is capped at 1,000,000 cells (lines 1089-1103). A viewport with a huge `row_count` formats the whole view, about 40M cells on a full table.
- Confidence: plausible. I did not establish that the grid can send one, or the memory it would take.

- Done in Engine: an empty dictionary, a null column and a repeated name load or refuse, never trap: a view's viewport is capped at the 1,000,000 cells a fetch is, refused with the same message. The grid asks for at most about 20,000 cells (`src/grid/window.ts`), so no grid meets it. Test: `a_viewport_is_capped_as_a_fetch_is`.

**11. Exports run to completion in one synchronous call** — polish

- Where: `packages/parallax/crates/parallax-wasm/src/lib.rs:346-385`.
- Scenario: a 1M×40 CSV formats 40M cells with no yield, so the worker answers no viewport for any dataset until it ends. Loads yield between slices; exports do not.
- Confidence: plausible; the duration is not measured.

- Not done: an export that yields needs an export the worker can step, chunk by chunk, between the page's other messages, as loads do: a resumable `exportCsv` in the wasm and a loop in `src/engine/serve.ts` and the worker's queue, which are the `parallax` lane's beyond a panic's message. The CSV already reaches the page in 1 MB chunks, so its memory is bounded; what it costs is that other datasets' viewports wait while it runs, unmeasured. Left for the `parallax` lane with this note.

**12. CSV protects formula-like text only** — polish

- Where: `packages/parallax/crates/parallax-export/src/lib.rs:809-811, 903-909`.
- Scenario: text that reads as a number is written raw. In Excel `037833100` loses its zero and `912828E72` becomes 9.12828E+77, and CSV is the mandated path above 1,000,000 cells.
- Confidence: confirmed that nothing guards or notes it; the Excel behaviour is from knowledge.

- Not done: each way to write such text trades one reader's wrong outcome for another's. `="037833100"` keeps the zero in Excel and gives every program that reads the CSV a formula; a leading apostrophe, as formula-like text gets, shows in Excel as part of the text and changes the value for programs. The CSV's promise is every digit as the screen has it, which it keeps; the Excel export, up to 1,000,000 cells, writes such text as text. A decision for the maintainer: whether CSV is written for Excel or for programs.

**13. Tests that do not test their claim** — polish

- `packages/parallax/crates/parallax-wasm/src/lib.rs:1141-1145`: the "refused by its headers alone" case is refused for truncation, and would pass with no row limit at all.
- `packages/parallax/crates/parallax-wasm/tests/load.rs`: every wasm test drives `loadTable`, which no TypeScript calls. `beginLoad`, `addLoadBytes`, `stepLoad` and `finishLoad` have no wasm-level test.
- `crates/parallax-export/tests/export.rs`: the cell-exactness tests run the native `constant_memory` writer. The in-memory writer the browser uses for flat sheets (`crates/parallax-export/src/lib.rs:565-569`) gets only a "starts with PK" check.
- The wasm transcript test runs the dev profile in Node, not the shipped fat-LTO SIMD build.

- Done in Engine: each named test tests what it says, the browser's Excel writer included: the headers-alone case now loads a stream whose batch bodies are garbage: past the limit it is refused with the row count, within it the same garbage is refused by decoding, so the count comes first. `a_stream_the_page_posts_in_pieces_loads_through_the_calls_its_worker_makes` drives `beginLoad`, `addLoadBytes`, `stepLoad`, `endLoadBytes` and `finishLoad` in wasm32, with the stream in pieces, and checks the table against a whole load's. The xlsx writer's sheet held in memory, as the browser writes it, is reachable natively as `write_xlsx_in_memory`, and every export test that writes a workbook checks its cells equal the streamed one's.
- Not done in CI: the transcript test in the shipped build, fat LTO with SIMD, is CI's, step 7.13, with finding 7. Run here once on 2026-11-13, it passed; the command is `RUSTFLAGS='-C target-feature=+simd128' cargo test --profile wasm -p parallax-wasm --target wasm32-unknown-unknown --locked --test transcript`.

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

## Changelog

- `@basis/parallax`: when the engine stops on a fault of its own, the reason every view shows names it as an internal
  error, with what the engine said and where, and the worker logs it to the console; "most likely because it ran out
  of memory" is kept for a trap with no such message, which is what running out of memory is. What to do: report
  such an error with the steps that led to it.
- `@basis/parallax`: a response with no length, as a gzipped or chunked one is, and a table sent as one record batch,
  load with their columns copied a few times rather than once a batch or slice. A table sent as one batch still holds
  its whole stream in the engine's memory beside the table until it has loaded. What to do: an API that serves large
  tables writes them in batches of about 65,536 rows, as `write_table(table, max_chunksize=65_536)` does in pyarrow.
