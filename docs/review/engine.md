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

- Done in Engine: charts leave out dates past the calendar, and a view behind by two loads rebuilds: a chart places a date or instant only on the days a trading calendar covers, a million either side of 1970 (years 1232 to 4707), and leaves any other out as it does a null; the grid still shows them as out of range. `from_epoch_days` and `trading_date` read a day or instant past jiff's range as its first or last, `instant_at` saturates, and `truncate_date` falls back to the year's start, so a zoom the page sends far past the calendar draws too. Decided: a sentinel such as 9999-12-31 is left out of a chart rather than squashing its axis to eight thousand years. Tests: `tests/chart_ranges.rs`, each scenario of the finding on value and trading axes.

**4. Min, max and median totals keep every distinct value and recompute each frame — fix before release**

- **Where:** `parallax-engine/src/view.rs:916-934` (`compile_domains`), `view.rs:2718-2728` (`raw_value`), `aggregate.rs:878-941` (`finish_values`)
- **Defect:** a flat view's domains (one min and one max per bar or heat column) and its min, max, median, percentile or distinct totals are held as a count map of every distinct value. The root of a view with no levels is a leaf, so its value is never cached.
- **Scenario:** a 1,000,000-row grid with a data bar on a P&L column of about 1,000,000 distinct values. Each bar column holds two maps of 2^21 buckets, roughly 140 to 200 MB by my arithmetic. Each `window_frame` (`parallax-session/src/lib.rs:1109-1123`) scans both maps in full; a median total re-sorts a million keys per frame.
- **Confidence:** logic confirmed. Sizes are computed, not measured, and I did not time it.

- Done in Engine: a dictionary forgets the strings no row uses, and a pivot past 256 MB of totals is refused: a flat view's domains are found in one pass over the rows that pass, each time the view rebuilds, as it does on every change, and only the least and greatest value are kept, where two counts of every distinct value were; and the value of a count of values, a minimum, maximum, median, percentile or distinct count, is kept until the view changes, as an upper node's already was, so a frame no longer scans or sorts it. Not done: a flat view's min, max, median and distinct totals still keep a count of their column's distinct values, one per total, since a total shares the state a pivot keeps reversible; the domains, two per bar or heat column, were the cost the finding measured. The memory saved was read from the code, not measured; the existing frames tests hold the values.

**5. Dictionaries never forget a string — fix before release**

- **Where:** `parallax-engine/src/dictionary.rs:71-81`, `column.rs:349`, `table.rs:950-989`
- **Defect:** there is no removal path, and each string is stored three times (as written, folded, and as the lookup key). `view.rs:319-325` relies on strings never leaving.
- **Scenario:** a page that reloads a table with a text column whose values change each time, such as an ISO timestamp or quote id sent as text. A 50,000-row table refreshed every 30 seconds adds about 50,000 strings at roughly 150 bytes each per refresh, about 0.7 GB an hour, until the 4 GB trap.
- **Confidence:** confirmed that nothing shrinks a dictionary. Per-string bytes are an estimate.

- Done in Engine: a dictionary forgets the strings no row uses, and a pivot past 256 MB of totals is refused: after a load, a text column whose live rows use at most half of its dictionary's strings, once it holds 4,096 or more, is recoded with only the strings they use, keeping their order; a keyed table's index is rebuilt when its key is recoded, and the change set says the table was recoded, so views rebuild from it rather than apply it, and it keeps no old rows. A dictionary thus holds at most about twice its rows' strings. The three copies of each string are left as they are. Test: `reloads_whose_text_changes_keep_only_the_strings_rows_use`, unkeyed, keyed by id and keyed by the changing text, with a pivot applying each load checked against one built fresh; the table grew from 0.8 MB to 21.8 MB over forty reloads before.

**6. Nothing bounds the number of pivot cells, and a float sum costs about 400 bytes per cell — fix before release**

- **Where:** `parallax-engine/src/aggregate.rs:246-254`, `exact.rs:16-26`, `view.rs:341-363`, `view.rs:2439-2459`
- **Defect:** a float sum, mean or variance state is 96 bytes inline plus a boxed 304-byte accumulator, per measure, per node, per column-pivot key. Only column-pivot keys are capped (`view.rs:1114-1143`).
- **Scenario:** grouping a 1,000,000-row grid by a near-unique column (trade id, timestamp, 300,000 CUSIPs) with float totals or measures. One million leaves times three float sums is about 1.4 GB before splits; with a column pivot it passes 4 GB and traps.
- **Confidence:** sizes from the type definitions and the `size_of::<State>() <= 96` assert; not measured.

- Done in Engine: a dictionary forgets the strings no row uses, and a pivot past 256 MB of totals is refused: a grouped view whose leaves' totals would take more than 256 MB (`MAX_GROUP_BYTES`, about 200,000 groups of three float sums or 1,500,000 of a count) is refused before it is built, with `grouping makes more than N groups, whose totals would take about M MB, more than the 256 MB a view may hold; group by fewer or coarser columns, or filter the rows first`. A bound from the values each column can hold (text: its dictionary; a boolean: three) skips the count for groupings by text columns of few values; otherwise the leaves are counted, stopping at the limit. A view that loads grow past it is rebuilt, which refuses it. Decided: 256 MB, a quarter of the 1 GiB at which the page replaces its worker. Test: `a_pivot_of_more_groups_than_memory_allows_is_refused_naming_the_limit`.

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

- Done in Engine: a dictionary forgets the strings no row uses, and a pivot past 256 MB of totals is refused: the check counts the row total's columns as a key's, so it allows the keys `data_columns` shows, `10,000 / measures - 1`, and refuses one more, where the last key was dropped with no word; a view that a reload gives keys past the limit is built again, which refuses it, rather than dropping them. Test: `a_column_pivot_at_its_limit_shows_every_key_and_one_past_it_is_refused`, which opened 10,000 keys with the last missing before.

**10. WMA divisor wraps on wasm32 — polish**

- **Where:** `parallax-engine/src/indicator.rs:408`
- **Defect:** `p * (p + 1) / 2` is computed in `usize`, which is 32 bits in the browser, and the release profile wraps.
- **Scenario:** a weighted moving average with a period from 65,536 to the allowed 100,000. At 65,536 the divisor is 32,768 instead of 2,147,516,416, so values are 65,537 times too large. Native tests cannot see it.
- **Confidence:** confirmed by arithmetic.

- Done in Engine: a dictionary forgets the strings no row uses, and a pivot past 256 MB of totals is refused: the divisor is computed in doubles, exact to the longest period. Test: `a_weighted_average_of_a_long_period_is_right_where_usize_has_32_bits`, a wasm32 test, since natively `usize` has 64 bits; it overflowed there before.

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

## The pass over the panics

Step 7.12 read every `unwrap`, `expect`, `unreachable!`, assert and index outside tests in the engine, session,
protocol, export and wasm crates, for one that data from the page or an API can reach. Those it could reach are fixed
above and in `session-wasm-export.md`: an empty dictionary and a dictionary of dictionaries, a buffer past its body,
dates and instants past jiff's range and a zoom past the calendar (`instant_at`'s arithmetic overflowed too), a
totals or domains window of no column, bytes after a stream's end, and the WMA divisor. The rest hold by
construction: a column's values match its type, which the load checks; a node, a lazy state or a computed window
exists where it is read; a layout's measure numbers are checked (`check_siblings`); the export's column stays under
Excel's 16,384; a chart's pixels are clamped by the session (`MAX_CHART_PIXELS`); a dictionary or a table stays far
under 2^32 entries within the 10,000,000-row limit; the formatter's digits are ASCII. A panic that still happens says
what and where (`session-wasm-export.md` 4).

## Overflow checks in the browser's build

The `[profile.wasm]` build inherited release's wrapping arithmetic, so an overflow the native tests would catch gave a
wrong number in the browser. Measured on 2026-11-13 on this host, busy (load average 4 to 7), with the bench at
1,000,000 rows, plain, one device pixel ratio: the module grew from 4,838,307 to 4,872,220 bytes (0.7%), and two
pairs of runs on positions put the load at 1,896 and 1,451 ms with checks against 1,432 and 1,457 ms without, and the
reference pivot at 338 and 315 ms against 330 and 409 ms; trades' sorts and filters matched within a millisecond or
two. That is within the bench's noise, so `overflow-checks = true` is on in `[profile.wasm]`
(Done in Engine: the browser's build checks integer overflow). An overflow now panics, and the panic hook names it.
Not measured: the throttled mode, and the 2,000,000-row sizes.

## Changelog

- `@basis/parallax` loads Arrow it refused or trapped on before: a dictionary-encoded text column that is null in
  every row, as `dictionary_encode()` of an empty column or an all-null pandas categorical sends it, and an Arrow
  `null` column, which loads as text with every value blank. A table whose columns repeat a name is refused, naming
  the column, where it showed the first column's values twice. What to do: nothing; an API that sends a repeated name
  gives each column its own.

- A chart leaves out a date or instant more than a million days from 1970, before year 1232 or after 4707, as it
  leaves out a null, where one such value, such as a 9999-12-31 sentinel or nanoseconds sent as microseconds, stopped
  the engine; the grid still shows such a value as out of range. What to do: nothing.

- `@basis/parallax`: a grouped grid or pivot whose groups' totals would take more than 256 MB, such as a million rows
  grouped by their own id with float sums, is refused with a message that says so and what to change, where it could
  stop the engine. A text column whose values change on every reload no longer grows the engine's memory with each.
  What to do: nothing; a layout refused this way groups by fewer or coarser columns, or filters first.

- `@basis/parallax`'s engine checks integer arithmetic in the browser as its tests do: an overflow stops the engine
  with an internal error that names it, where it wrapped into a wrong number. What to do: nothing; report such an
  error.
