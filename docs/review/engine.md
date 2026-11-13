# parallax-engine pre-release review

Nothing was run; everything below is from reading. I found no wrong-result bug in sort, filter, grouping, exact sums or formatting. The defects are three reachable panics, three memory or cost problems, and four small edge cases.

Paths are relative to `packages/parallax/crates/`.

## Findings

**1. An empty dictionary panics the load — release blocker**

- **Where:** `parallax-engine/src/column.rs:743`
- **Defect:** `extend_text` calls arrow's `normalized_keys()`, which asserts the dictionary has at least one value.
- **Scenario:** a dictionary-encoded text column whose batch carries an empty dictionary. Example: `dictionary_encode()` on a chunk where a sparse column such as `comment` is entirely null, an all-null pandas categorical, or a zero-row batch. The load reaches `Staging::push_columns` (`table.rs:126-131`) or `extend_columns` (`table.rs:521-526`) and traps; there is no guard on row count or dictionary length anywhere in the engine or session.
- **Confidence:** confirmed. `arrow-array-60.1.0/src/array/dictionary_array.rs:1055-1057` reads `assert_ne!(v_len, 0)`, and no test loads an empty dictionary.
- **Related:** `Dictionary(_, Dictionary(_, Utf8))` passes `types.rs:68` and hits `unreachable!` at `column.rs:693`; that is exotic.

- Done in Engine: an empty dictionary, a null column and a repeated name load or refuse, never trap: a dictionary with no values loads as nulls, every row's key being null, before arrow's `normalized_keys` can assert; a dictionary of dictionaries is an unsupported type, refused by `Table::new` with its name. Tests: `tests/arrow_shapes.rs`, and `a_dictionary_column_of_nulls_loads_and_reloads` through a real IPC stream in `parallax-wasm`.

**2. Totals and domains windows panic on an empty column range — fix before release**

- **Where:** `parallax-engine/src/view.rs:1269-1305` (`totals_window`), `1312-1357` (`domains_window`), `1941-1944` (`finish`)
- **Defect:** when no column falls in the window, the builder has zero fields, `RecordBatch::try_new` returns an error, and `.expect("consistent window")` panics.
- **Scenario:** a flat or detail grid with a totals row, or a bar or heat cell, is asked for a window with `first_column >= column count` or `column_count == 0`. The session passes the stored viewport straight through (`parallax-session/src/lib.rs:1085-1123`) and keeps the old viewport when an `UpdateView` carries none (`lib.rs:812-824`). So a user scrolled right on a wide grid who applies a layout with fewer columns would trigger it.
- **Confidence:** engine panic confirmed (`arrow-array-60.1.0/src/record_batch.rs:338-345`). I did not establish whether the TypeScript grid ever leaves `first_column` stale. The main `window()` is safe because it always carries `__seq` or `__depth`.

- Done in Engine: an empty dictionary, a null column and a repeated name load or refuse, never trap: a totals or domains window builds its batch with an explicit row count, so a window past the last column, or of none, is one or two rows with no columns; every window clamps its column range, which also takes a range that ends before it starts. Tests: `frames.rs`, and the session's `a_grid_scrolled_right_takes_a_layout_with_fewer_columns`, the scenario the finding gives, which the session answers with a frame.

**3. Charts panic on dates and instants outside jiff's range — fix before release**

- **Where:** `parallax-engine/src/calendar.rs:54-58` (`from_epoch_days`), `calendar.rs:465` (`trading_date`), `chart.rs:1973-1976` (`truncate_date`)
- **Defect:** these use `Span::days(..)`, `.expect(..)` and `jiff::civil::date(..)`, all of which panic, on values taken from the data. The grid formats the same values as "out of range" (`format.rs:791-807`), so the table loads and the chart traps.
- **Scenarios:**
  - A trading-time axis over a timestamp column holding any value beyond year ±9999, such as an `i64::MAX` "infinity" or nanoseconds in a microsecond column. `Placement::position` (`chart.rs:565`) panics in `rebuild` (`chart.rs:990`) as the chart opens.
  - A candlestick or OHLC chart over a Date32 column with a value past 9999-12-31 or before -9999. `bucket_of` (`chart.rs:1538`, `1937-1940`) panics on first reduce.
  - Any chart with a Date32 x whose least value is below about -4,371,587 days, or zoomed past 9999-12-31. `time_ticks` panics at `chart.rs:2212`.
- **Confidence:** confirmed by those lines and `jiff-0.2.39/src/span.rs:787-789`. Such values are rare.

**4. Min, max and median totals keep every distinct value and recompute each frame — fix before release**

- **Where:** `parallax-engine/src/view.rs:916-934` (`compile_domains`), `view.rs:2718-2728` (`raw_value`), `aggregate.rs:878-941` (`finish_values`)
- **Defect:** a flat view's domains (one min and one max per bar or heat column) and its min, max, median, percentile or distinct totals are held as a count map of every distinct value. The root of a view with no levels is a leaf, so its value is never cached.
- **Scenario:** a 1,000,000-row grid with a data bar on a P&L column of about 1,000,000 distinct values. Each bar column holds two maps of 2^21 buckets, roughly 140 to 200 MB by my arithmetic. Each `window_frame` (`parallax-session/src/lib.rs:1109-1123`) scans both maps in full; a median total re-sorts a million keys per frame.
- **Confidence:** logic confirmed. Sizes are computed, not measured, and I did not time it.

**5. Dictionaries never forget a string — fix before release**

- **Where:** `parallax-engine/src/dictionary.rs:71-81`, `column.rs:349`, `table.rs:950-989`
- **Defect:** there is no removal path, and each string is stored three times (as written, folded, and as the lookup key). `view.rs:319-325` relies on strings never leaving.
- **Scenario:** a page that reloads a table with a text column whose values change each time, such as an ISO timestamp or quote id sent as text. A 50,000-row table refreshed every 30 seconds adds about 50,000 strings at roughly 150 bytes each per refresh, about 0.7 GB an hour, until the 4 GB trap.
- **Confidence:** confirmed that nothing shrinks a dictionary. Per-string bytes are an estimate.

**6. Nothing bounds the number of pivot cells, and a float sum costs about 400 bytes per cell — fix before release**

- **Where:** `parallax-engine/src/aggregate.rs:246-254`, `exact.rs:16-26`, `view.rs:341-363`, `view.rs:2439-2459`
- **Defect:** a float sum, mean or variance state is 96 bytes inline plus a boxed 304-byte accumulator, per measure, per node, per column-pivot key. Only column-pivot keys are capped (`view.rs:1114-1143`).
- **Scenario:** grouping a 1,000,000-row grid by a near-unique column (trade id, timestamp, 300,000 CUSIPs) with float totals or measures. One million leaves times three float sums is about 1.4 GB before splits; with a column pivot it passes 4 GB and traps.
- **Confidence:** sizes from the type definitions and the `size_of::<State>() <= 96` assert; not measured.

**7. An Arrow `Null` column refuses the whole table — polish, needs a decision**

- **Where:** `parallax-engine/src/types.rs:40-77`, `table.rs:253-259`
- **Defect:** `DataType::Null` maps to `UnsupportedType`, as does every other unsupported type.
- **Scenario:** an API that builds its table from pandas or polars sends an optional column that is all None today, which arrives as Arrow `null`. The grid shows nothing but "column x has unsupported type Null".
- **Confidence:** engine behaviour confirmed. I did not check whether basis always sends declared types, which would make this moot.

- Done in Engine: an empty dictionary, a null column and a repeated name load or refuse, never trap: decided as the brief says, an Arrow `null` column is a text column whose every value is blank, so the table loads, and a later load that fills it in, or empties it again, keeps the type. Test: `a_column_of_arrow_nulls_loads_as_blank_text`.

**8. Duplicate column names silently show the first column's values — polish**

- **Where:** `parallax-engine/src/table.rs:156-178`, `table.rs:253-274`
- **Defect:** `Table::new` keeps both same-named columns, but `arrays_of` reads each by `column_by_name`, which returns the first match.
- **Scenario:** a batch with two `price` columns of the same type, which pyarrow allows. The second grid column silently repeats the first; with different types the load fails with `TypeChanged` instead.
- **Confidence:** confirmed; nothing in engine or session rejects duplicates.

- Done in Engine: an empty dictionary, a null column and a repeated name load or refuse, never trap: `Table::new` refuses a schema that names a column twice, and a load refuses a batch that does, with `column price appears more than once; give each column its own name`. Test: `a_repeated_column_name_is_refused_naming_it`.

**9. A column pivot at exactly its limit silently loses its last key — polish**

- **Where:** `parallax-engine/src/view.rs:1121-1139` against `view.rs:3063-3065`
- **Defect:** the check allows `10,000 / measures` keys, but `data_columns` truncates to one fewer.
- **Scenario:** one measure and exactly 10,000 distinct split values (or 2 and 5,000, or 10 and 1,000). The last key's columns are missing while Total still includes them. Keys added past the limit by a reload are dropped the same way with no flag.
- **Confidence:** confirmed.

**10. WMA divisor wraps on wasm32 — polish**

- **Where:** `parallax-engine/src/indicator.rs:408`
- **Defect:** `p * (p + 1) / 2` is computed in `usize`, which is 32 bits in the browser, and the release profile wraps.
- **Scenario:** a weighted moving average with a period from 65,536 to the allowed 100,000. At 65,536 the divisor is 32,768 instead of 2,147,516,416, so values are 65,537 times too large. Native tests cannot see it.
- **Confidence:** confirmed by arithmetic.

## Overall

**Quality.** The crate is in good shape where it matters most. I read the integer sort keys (sign flips, float total order, two-word decimals, null placement, reversal by runs, multi-key passes), the filter kernels (word boundaries, null masks, not-equals and not-in, narrow decimals against a wide operand) and the packed leaf keys and tallies closely. I found no wrong result.

**Exact sums.**

- Float sums use a 2,240-bit Kulisch accumulator, rounded once.
- Integer and decimal sums use i256 and come out as Decimal128(38, scale), or an overflow flag.
- Means and variances are exact quotients, rounded once.
- The f64 fallbacks:
  - a weighted mean with a float on either side;
  - percent-of-total;
  - median and percentile interpolation;
  - the values groups are sorted, filtered and ranked by.

  Each is within a couple of ulps and none affects a displayed sum.

**Formatter.** It matches the recorded rules: 1.005 shows as 1.01, 2.675 as 2.68, and negative zero as 0.00.

**Tests.**

- Unit tests in every module.
- Property tests: sort against a comparison sort, filter words against per-row tests, the formatter against big-integer arithmetic.
- Differential tests against DuckDB: grouped, flat and detail views, orders, running totals, time zones.
- Incremental-against-rebuild, plus TA-Lib and SIFMA fixtures.
- The DuckDB tests are plain `#[test]`s with no `#[ignore]` or feature gate. They run under `cargo test --workspace --locked` at `.github/workflows/ci.yml:399` whenever parallax paths change.

**What is thin.**

- The engine's tests run only natively. The `[profile.wasm]` build inherits release, so overflow checks and `debug_assert` are off and overflow wraps silently. 32-bit `usize` behaviour and the single-threaded leaf path are covered only by the `parallax-wasm` tests, which I did not read.
- Hostile Arrow shapes are barely tested: empty dictionaries, `Null` columns, duplicate names, out-of-range dates in charts.
- Window edge cases for totals and domains are not tested.

**Unsafe.** Zero `unsafe` blocks; the workspace sets `unsafe_code = "forbid"`.

**Not read.**

- `profile.rs` and `examples/measure.rs`.
- The last third of `sifma.rs`.
- Most test files beyond `oracle.rs` (first 450 lines) and `tests/format.rs`.
- `chart.rs` and `indicator.rs` were read in full but less closely than `view.rs`, `sort.rs`, `filter.rs`, `aggregate.rs`, `table.rs`, `column.rs` and `format.rs`.

## Changelog

- `@basis/parallax` loads Arrow it refused or trapped on before: a dictionary-encoded text column that is null in
  every row, as `dictionary_encode()` of an empty column or an all-null pandas categorical sends it, and an Arrow
  `null` column, which loads as text with every value blank. A table whose columns repeat a name is refused, naming
  the column, where it showed the first column's values twice. What to do: nothing; an API that sends a repeated name
  gives each column its own.
