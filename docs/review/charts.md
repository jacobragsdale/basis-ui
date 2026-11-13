**Charts review: 15 findings, most severe first.** One is a release blocker; the rest are fix-before-release or polish. All paths are under `packages/parallax/`. Nothing in the repo was touched; the throwaway scripts are in `(a scratch folder)`.

## Findings

**1. `packages/parallax/src/chart/scale.ts:169` (same loop at `packages/parallax/src/chart/axis-styles.ts:148`)** — The value-axis tick loop counts with a float (`i += 1`) and never ends when the y range is only a few ULPs wide.

- Scenario: a line chart of a "sum of weights" column holding `0.9999999999999999, 1, 1.0000000000000002`, or `100` and `100.00000000000001`. `niceDomain` only widens exactly equal values, so the step is about 1e-16, `i` starts near 1e16 and `i + 1 === i`.
- Actual: `chartModel` never returns; Node aborted on heap exhaustion (exit 134) in both the plain and percent-format paths. In the browser this runs in the animation frame, so the tab hangs until it runs out of memory.
- Expected: about five ticks, as `[1, 1, 1]` gives. The engine's x-axis twin (`nice_ticks`) uses an integer range and is safe.
- Trigger window: ranges of 1 to about 6 ULPs. No unit test covers degenerate domains (`tests/unit/chart-scale.test.ts` has four tests).
- Severity: **release blocker**. Confidence: confirmed by running.

Done in Charts: a value axis over any range of values returns a few ticks: ticks are counted in whole steps and at
most 100 of them (`stepsAcross` in `scale.ts`, which the styled axes share), a range narrower than a billionth of
its values' size is one value and centres the axis, a range past the largest double is measured in halves and keeps
its own ends, and a log axis stays within the powers of ten a double holds. Labels past a thousand trillion or finer
than twelve decimals are scientific. `tests/unit/chart-domains.test.ts` draws each degenerate range the review
names on a line's left and right axes, a log axis, a bar chart and a density, in each axis style, in a worker that
is stopped after two seconds.

**2. `packages/parallax/src/chart/snap.ts:151` (used at `packages/parallax/src/chart/editor-steps.ts:117`)** — The measure tool derives the series key as `label.slice(column.length + 1)`, an old `"column value"` label format the engine no longer writes.

- Scenario: a line chart with `y: ["close"], series: "ticker"`; the engine labels the series `AAPL` and `MSFT` (`crates/parallax-session/src/chart.rs:278-289`). Press on MSFT's line with Measure.
- Actual: `seriesAt` returns `{ key: "", label: "MSFT" }`; with an empty key the engine measures the first series (`crates/parallax-session/src/chart.rs:590-602`, `crates/parallax-engine/src/chart.rs:1285-1292`). The card reads "MSFT" over AAPL's change and prices.
- The same happens with two y columns: the engine always measures `y[0]`, and the card names whichever line was nearest.
- Expected: `key: "MSFT"`; `SeriesData.key` already carries it.
- Severity: fix before release. Confidence: TypeScript half confirmed by running, Rust half by reading.

**3. `packages/parallax/src/chart/indicators.ts:208` and `packages/parallax/src/chart/model-overlays.ts:152`** — An indicator's and an event's "series it follows" is built as `` `${y[0]} ${series}` ``, which never equals the legend label.

- Scenario: the same chart with `indicators: [{ kind: "sma" }]`; hide AAPL from the legend.
- Actual: legend labels are `['AAPL', 'MSFT']`, `follows` is `['close AAPL', 'close MSFT']`. AAPL's SMA or Bollinger lines stay drawn, still stretch the price scale and still read in the tooltip (`src/chart/interaction.ts:270`); its events stay too.
- Tests that don't test what they claim: `tests/unit/chart-indicator-lines.test.ts:10-54` and `:94-115`, and `tests/unit/chart-drawings.test.ts:214-239` (which covers finding 2), hand-build series labelled `"close AAPL"` with `key: ""`, a shape the engine doesn't produce.
- Related footgun: `chart.hidden` stores labels, and labels change with `titles` or with the number of y columns, so saved layouts stop matching.
- Severity: fix before release. Confidence: confirmed by running.

**4. `packages/parallax/src/chart/source.ts:24-33`** — Bar charts, heatmaps and waterfalls read only the first 500 rows of the grouped view, and row 0 is the grand total (`crates/parallax-engine/src/view.rs:3006-3010`), so at most 499 groups are drawn and nothing says so.

- Scenario: `<Chart rows={dailyPnl} kind="bar" x="date" y="pnl" />` with two years of business days (504).
- Actual: the newest five days are missing; the status line and text alternative say "499 groups" (`src/chart/summary.ts:70-73`). `frame.totalRows` is never read in `src/chart/`.
- A waterfall past 499 groups refuses with "show every group", which the user cannot do.
- Severity: fix before release. Confidence: confirmed by reading.

**5. `packages/parallax/src/chart/chart.tsx:83-95`** — The one `Chart` example published to agents (`packages/ui/catalogue.json:16873`) cannot draw.

- Scenario: `<Chart rows={curve} kind="line" x="tenor" y="yield" />` with tenors `"2Y"`, `"10Y"`. `smallLayout` sets no axis, so it is `value`, and the engine refuses text on a value axis (`crates/parallax-engine/src/chart.rs:505-532`).
- Actual: an alert reading "the x axis of a chart cannot be column tenor of type Utf8". It needs `settings={{ axis: "tenor" }}`. The example is type-checked but never run.
- Severity: fix before release. Confidence: confirmed by reading.

**6. `packages/parallax/src/chart/small-data.ts:118-122`** — A small-data waterfall whose x is `YYYY-MM-DD` strings is refused.

- Scenario: `<Chart rows={[{ d: "2026-11-12", pnl: 2 }, …]} kind="waterfall" x="d" y="pnl" />`. `rowsOrders` emits `orders: { d: { values: [...] } }` because the values are strings, while `vectorOf` types the column `Date32`.
- Actual: the engine answers "is Date32, and only text columns take an order" (`crates/parallax-engine/src/order.rs:138-145`).
- The unit test's "dates" case passes a number (`tests/unit/chart-waterfall.test.ts:253`), so this path is untested.
- Severity: fix before release. Confidence: TypeScript half confirmed by running, Rust half by reading.

**7. `packages/parallax/src/chart/small-data.ts:92-115` (called in render at `packages/parallax/src/chart/chart.tsx:61`)** — The cache that keeps `rows` bytes identical across renders is a 64-entry FIFO, and a miss changes the dataset's source identity, which reloads it.

- Scenario: 65 or more mounted small-data charts with distinct rows (a small-multiples page). Each load that settles re-renders its chart, misses, reloads and evicts the next chart's entry.
- Actual: in a model of that loop over the real `smallBytes`, 64 charts rest after 64 loads; 65 were still reloading after 100,000.
- Also: every parent render runs `JSON.stringify` over all rows and all fields, and bar, heatmap and pie charts repaint each time because `rowOrder(rows, x)` is a new function (`chart.tsx:71`).
- Severity: fix before release. Confidence: cache behaviour confirmed by running, the React loop by reading.

**8. `packages/parallax/src/layout/chart.ts:181-182` and `packages/parallax/src/chart/model-series.ts:86-112`** — `stacked` is documented as "on an area or bar chart", but nothing stacks areas.

- Scenario: `kind: "area", stacked: true`, series a = 60 and b = 40.
- Actual: y domain `[0, 60]`, two overlapping washes. Expected: a stack reaching 100.
- Likewise `y_right` is silently dropped for bars (`src/chart/source.ts:64-69`, single axis at `src/chart/model-bars.ts:185`), though the README lists bars "on two axes".
- Severity: fix before release (implement it, or correct the docs and refuse the setting). Confidence: confirmed by running (area), by reading (bars).

**9. `packages/parallax/src/chart/model-bins.ts:87-93` with `packages/parallax/src/chart/scale.ts:100-107`** — A histogram with `log_y` starts its axis at 1, so bins holding one row have zero height.

- Scenario: counts `[1, 1, 40, 900, 40, 1, 1, 0, 0, 1]`.
- Actual: bar heights 0, 0, 197.6, 364.4, 197.6, 0, 0, 0 px; five of eight non-empty bins vanish, which are the tails a log axis is used to show.
- Severity: fix before release. Confidence: confirmed by running.

**10. `packages/parallax/src/chart/model-points.ts:139`** — A scatter's log scale is fitted to `[yFrom, yTo]` only, so one y at or below zero puts the domain on the single decade around `yTo`.

- Scenario: y values `-0.0005, 0.0004, 0.002, 0.008, 0.05` with `log_y`.
- Actual: domain `[0.01, 0.1]`; three of five dots land at y = 410 to 882 px in a plot ending at 378 and are clipped away.
- Also: the density form ignores `log_y` (`src/chart/model-bins.ts:179-185`), so the axis flips between log and linear at 5,000 rows.
- Severity: polish, bordering fix. Confidence: confirmed by running (dots), by reading (density).

**11. `packages/parallax/src/chart/scene-pointer.ts:255-279`** — The wheel is always swallowed over a chart with an x axis, and keys ignore modifiers.

- Scenario: a dashboard of stacked line charts; wheel-scrolling the page stops whenever the pointer crosses a chart, even at full zoom-out, where each notch also asks the engine again for the same window.
- Ctrl+wheel (browser zoom) is blocked. With the plot focused, Ctrl+`+`, Ctrl+`-` and Ctrl+`0` zoom the chart and Alt+Left pans it, each with `preventDefault`.
- The grid lets the wheel through at its ends; the chart has no equivalent.
- Severity: polish. Confidence: confirmed by reading.

**12. `packages/parallax/src/chart/scene-pointer.ts:158-171` and `:194-204`** — A drag ends only on `pointerup` or `pointercancel`; there is no `lostpointercapture` handler and no `event.buttons` check.

- Scenario: capture is lost mid-pan (Alt-Tab or a Citrix focus change). `#drag` stays set and the chart pans under a plain hover until the next click.
- Severity: polish. Confidence: plausible.

**13. `packages/parallax/src/chart/model-pie.ts:66` and `:109-121`** — Hiding a slice rescales the rest, but each keeps the engine's share of the original total.

- Scenario: Govt 50%, IG 25%, HY 25%; hide Govt.
- Actual: IG and HY each span 50% of the ring and are labelled 25.0%.
- Also: any second column's text becomes the slice label, so `y={["mv", "pnl"]}` or a `series` split labels slices sized by the first column with the second's values.
- Severity: polish. Confidence: confirmed by running (hidden slice), by reading (second column).

**14. `packages/parallax/src/chart/small-data.ts:53-72`** — Type inference fails silently on bad dates and throws in render on mixed values.

- `"0000-00-00"` and `"2026-13-01"` become 1970-01-01, stretching the axis from 1970; `"2026-02-30"` becomes 2 March.
- One `"N/A"` in a numeric column throws a `TypeError` during render, which takes down the React tree instead of showing the chart's own alert.
- `ChartRow = Record<string, ChartValue>` rejects typed API rows with optional or nested fields, though only the plotted columns are read.
- Severity: polish. Confidence: confirmed by running; the type point by reading.

**15. `packages/parallax/src/chart/summary.ts:147-159` and `packages/parallax/src/chart/scene-inputs.ts:19-28`** — Two smaller gaps.

- The text alternative for a histogram is "N bins" and for a density "N points", with no values; hidden series and slices are still read out as shown.
- The crosshair sync group is `[dataset, x, axis]` and omits `calendar`, `session` and `tenor_spacing`, which change axis positions, so two such charts point at different times.
- Severity: polish. Confidence: confirmed by reading.

## Overall

The area is in better shape than a week of agent-written code suggests. The draw model is pure and readable, every number a reader sees is the engine's text, and stacked mixed-sign bars, reversed axes, the crosshair's "nearest point, labelled with its own x" rule, the waterfall refusals and unmount cleanup all held up. The indicator formulas in `crates/parallax-engine/src/indicator.rs` (SMA, EMA, WMA, Bollinger, RSI, MACD, ATR, stochastic, VWAP) match their TA-Lib definitions and warm-ups; I read them but could not run them. The chart TypeScript has no dependence on the browser's time zone.

The defects cluster in three places the pixel-parity port could not catch:

- **Degenerate numeric inputs** (finding 1).
- **Series identity drift** between the engine's labels and the TypeScript's assumptions (findings 2 and 3), which the unit tests hide because their fixtures are hand-built in the old shape.
- **The small-data path and silent caps or ignored settings** (findings 4 to 8), where no test runs the documented examples against the engine.

## Not reviewed

- `crates/parallax-engine/src/calendar.rs` and `sifma.rs`: the trading axis, DST, holidays, early closes and day bucketing all live there, so that part of the brief is essentially unexamined by me.
- The rest of the Rust beyond the parts cited above.
- `src/chart/ink.ts` past line 60; `src/frame/chart-frame.ts`; the engine client.
- `src/canvas/device-pixels.ts` beyond the `DevicePixels` class.
- Most unit tests beyond their names, and the e2e specs beyond their test names.

## Changelog

- A chart whose values are a few units in the last place apart, such as a sum of weights that reads 1, no longer
  hangs the tab: it draws a flat line on an axis centred on the value. Values past a thousand trillion, or a range
  finer than twelve decimals, label their axis in scientific notation. What to do: nothing.
