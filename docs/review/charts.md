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

Done in Charts: a series is hidden and measured by the engine's key, and a layout that hid it by label still does: the measure tool asks for the pressed series by the engine's `key`, and chooses only among the
series of the chart's first y column, the one the engine measures, so the card names the series it measured. Held by
`tests/browser/chart-series-keys.test.ts`, whose frames and measurement the engine makes; the hand-built
`seriesAt` unit test is gone. Then, once the engine lane's
`MeasureChart.y` landed, done in Charts: the Measure tool measures the line pressed, on any of a chart's y columns:
the press sends the series' key and its column, and `ViewHandle.measure` takes them as `{ series, y }`; the browser
test measures BCN's open on a chart of closes and opens.

**3. `packages/parallax/src/chart/indicators.ts:208` and `packages/parallax/src/chart/model-overlays.ts:152`** — An indicator's and an event's "series it follows" is built as `` `${y[0]} ${series}` ``, which never equals the legend label.

- Scenario: the same chart with `indicators: [{ kind: "sma" }]`; hide AAPL from the legend.
- Actual: legend labels are `['AAPL', 'MSFT']`, `follows` is `['close AAPL', 'close MSFT']`. AAPL's SMA or Bollinger lines stay drawn, still stretch the price scale and still read in the tooltip (`src/chart/interaction.ts:270`); its events stay too.
- Tests that don't test what they claim: `tests/unit/chart-indicator-lines.test.ts:10-54` and `:94-115`, and `tests/unit/chart-drawings.test.ts:214-239` (which covers finding 2), hand-build series labelled `"close AAPL"` with `key: ""`, a shape the engine doesn't produce.
- Related footgun: `chart.hidden` stores labels, and labels change with `titles` or with the number of y columns, so saved layouts stop matching.
- Severity: fix before release. Confidence: confirmed by running.

Done in Charts: a series is hidden and measured by the engine's key, and a layout that hid it by label still does: an indicator and an event follow the series the engine labelled with their key
(`seriesLabel` in `src/chart/series-keys.ts`), so hiding a series hides its indicators, in the plot, the scale and
the tooltip, and its events; a series that is not split hides its indicators too. `hidden` now holds a line
series' key: the series column's value on a chart of one column, the column's name for a series not split, and
the column and value on a chart of several; a legend label, as layouts saved before held, still hides its series,
and the legend drops it when the series is shown again. Other charts' series, groups and overlays keep their
labels, as they have no key. The hand-built unit tests the review names are gone; their cases run in the browser
over the engine's frames, and the one pane test left keeps its frame in the engine's shape.

**4. `packages/parallax/src/chart/source.ts:24-33`** — Bar charts, heatmaps and waterfalls read only the first 500 rows of the grouped view, and row 0 is the grand total (`crates/parallax-engine/src/view.rs:3006-3010`), so at most 499 groups are drawn and nothing says so.

- Scenario: `<Chart rows={dailyPnl} kind="bar" x="date" y="pnl" />` with two years of business days (504).
- Actual: the newest five days are missing; the status line and text alternative say "499 groups" (`src/chart/summary.ts:70-73`). `frame.totalRows` is never read in `src/chart/`.
- A waterfall past 499 groups refuses with "show every group", which the user cannot do.
- Severity: fix before release. Confidence: confirmed by reading.

Done in Charts: a grouped chart draws every group up to 2,000, and past them says what to change: a bar chart, heatmap, pie or waterfall reads the grand total's row and up to 2,000 groups and 400
series (`src/chart/group-limits.ts`). A view with more, by its `totalRows` or `totalColumns`, draws none: the plot,
the status line and the text alternative say the limit and what to change (filter the rows, group by a coarser
column, or keep the largest with `top_n`). The README says so. `tests/browser/chart-groups.test.tsx` draws 504 days
as bars and as a waterfall, and refuses 2,100, through the engine.

**5. `packages/parallax/src/chart/chart.tsx:83-95`** — The one `Chart` example published to agents (`packages/ui/catalogue.json:16873`) cannot draw.

- Scenario: `<Chart rows={curve} kind="line" x="tenor" y="yield" />` with tenors `"2Y"`, `"10Y"`. `smallLayout` sets no axis, so it is `value`, and the engine refuses text on a value axis (`crates/parallax-engine/src/chart.rs:505-532`).
- Actual: an alert reading "the x axis of a chart cannot be column tenor of type Utf8". It needs `settings={{ axis: "tenor" }}`. The example is type-checked but never run.
- Severity: fix before release. Confidence: confirmed by reading.

Done in Charts: the small-data form runs as its docs show, types its rows or says why, and keeps its own table: the example now gives `settings={{ axis: "tenor" }}`, and a line, area, scatter,
histogram or candle chart of rows whose x column is text, on any axis but a tenor one, says so in place of the plot,
with the setting to give, before it loads. `tests/browser/chart-small-data.test.tsx` runs the catalogue's example
and the README's against the engine.

**6. `packages/parallax/src/chart/small-data.ts:118-122`** — A small-data waterfall whose x is `YYYY-MM-DD` strings is refused.

- Scenario: `<Chart rows={[{ d: "2026-11-12", pnl: 2 }, …]} kind="waterfall" x="d" y="pnl" />`. `rowsOrders` emits `orders: { d: { values: [...] } }` because the values are strings, while `vectorOf` types the column `Date32`.
- Actual: the engine answers "is Date32, and only text columns take an order" (`crates/parallax-engine/src/order.rs:138-145`).
- The unit test's "dates" case passes a number (`tests/unit/chart-waterfall.test.ts:253`), so this path is untested.
- Severity: fix before release. Confidence: TypeScript half confirmed by running, Rust half by reading.

Done in Charts: the small-data form runs as its docs show, types its rows or says why, and keeps its own table: a waterfall's order comes only from an x column typed as text, so `YYYY-MM-DD` days
sort as dates; a waterfall, bar, scatter and area chart of text dates each draw in
`tests/browser/chart-small-data.test.tsx`, and the unit test's "dates" case now passes text.

**7. `packages/parallax/src/chart/small-data.ts:92-115` (called in render at `packages/parallax/src/chart/chart.tsx:61`)** — The cache that keeps `rows` bytes identical across renders is a 64-entry FIFO, and a miss changes the dataset's source identity, which reloads it.

- Scenario: 65 or more mounted small-data charts with distinct rows (a small-multiples page). Each load that settles re-renders its chart, misses, reloads and evicts the next chart's entry.
- Actual: in a model of that loop over the real `smallBytes`, 64 charts rest after 64 loads; 65 were still reloading after 100,000.
- Also: every parent render runs `JSON.stringify` over all rows and all fields, and bar, heatmap and pie charts repaint each time because `rowOrder(rows, x)` is a new function (`chart.tsx:71`).
- Severity: fix before release. Confidence: cache behaviour confirmed by running, the React loop by reading.

Done in Charts: the small-data form runs as its docs show, types its rows or says why, and keeps its own table: the 64-table cache is gone. Each chart keeps its own table, made again only when its
plotted columns' values change (`use-small-table.ts`, over `tableContent`, which writes only the plotted columns),
and its group order is the same function while the x values are. The browser test mounts 70 charts and counts one
load each (the old code made 210), and a page that builds its rows afresh loads them once. On t4's report that the
first small-data test timed out under the whole suite: its 70-chart cousin showed the reload churn was real across
charts, though within one file of a few charts the old cache did not evict; the polls that wait for a chart's first
draw, when the engine's worker starts, now wait up to 20 seconds.

**8. `packages/parallax/src/layout/chart.ts:181-182` and `packages/parallax/src/chart/model-series.ts:86-112`** — `stacked` is documented as "on an area or bar chart", but nothing stacks areas.

- Scenario: `kind: "area", stacked: true`, series a = 60 and b = 40.
- Actual: y domain `[0, 60]`, two overlapping washes. Expected: a stack reaching 100.
- Likewise `y_right` is silently dropped for bars (`src/chart/source.ts:64-69`, single axis at `src/chart/model-bars.ts:185`), though the README lists bars "on two axes".
- Severity: fix before release (implement it, or correct the docs and refuse the setting). Confidence: confirmed by running (area), by reading (bars).

Done in Charts: a setting a chart does not draw is refused with what to change: stacked only on bars, a right axis only on lines and areas: stacked areas over the engine's reductions, whose series are reduced to points of their own, would
need the series aligned and summed, which is not small; and a grouped chart's bars come from its measures, which
have no right axis. So `settingsProblem` in `src/chart/source.ts` refuses, in place of the plot and to `onError`,
`stacked` on any kind but a bar chart and `y_right` on any kind but a line or area chart (a scatter, histogram,
candle and grouped chart all ignored it), with what to change. The README, the layout's descriptions and
`docs/design.md`'s Charts list, as the brief directs, no longer promise bars on two axes or stacked areas.
`tests/browser/chart-settings.test.tsx` holds both.

**9. `packages/parallax/src/chart/model-bins.ts:87-93` with `packages/parallax/src/chart/scale.ts:100-107`** — A histogram with `log_y` starts its axis at 1, so bins holding one row have zero height.

- Scenario: counts `[1, 1, 40, 900, 40, 1, 1, 0, 0, 1]`.
- Actual: bar heights 0, 0, 197.6, 364.4, 197.6, 0, 0, 0 px; five of eight non-empty bins vanish, which are the tails a log axis is used to show.
- Severity: fix before release. Confidence: confirmed by running.

Done in Charts: a log axis shows a histogram's single rows and fits a scatter's dots: what grows from a baseline on a log axis, a histogram's bins and an area, starts a decade
under its smallest value when that is a power of ten itself (`logDomain`'s `under`), so a bin of one row has a
height; `tests/unit/chart-log-axes.test.ts` draws the review's counts, every bin with a row taller than a pixel.

**10. `packages/parallax/src/chart/model-points.ts:139`** — A scatter's log scale is fitted to `[yFrom, yTo]` only, so one y at or below zero puts the domain on the single decade around `yTo`.

- Scenario: y values `-0.0005, 0.0004, 0.002, 0.008, 0.05` with `log_y`.
- Actual: domain `[0.01, 0.1]`; three of five dots land at y = 410 to 882 px in a plot ending at 378 and are clipped away.
- Also: the density form ignores `log_y` (`src/chart/model-bins.ts:179-185`), so the axis flips between log and linear at 5,000 rows.
- Severity: polish, bordering fix. Confidence: confirmed by running (dots), by reading (density).

Done in Charts: a log axis shows a histogram's single rows and fits a scatter's dots: a scatter's log axis is fitted to its dots above zero as well as the range's ends, so one
dot at or below zero no longer squeezes the axis into the top decade; the review's dots fall on
`[0.0001, 0.1]`. The density half is said, not fixed: the engine bins a density by value, so its axis stays
linear, and its status line now ends ", on a linear axis" when the layout asks for a log one. Log bins would be the
engine's (`parallax-engine`'s density), which t4 has been told.

**11. `packages/parallax/src/chart/scene-pointer.ts:255-279`** — The wheel is always swallowed over a chart with an x axis, and keys ignore modifiers.

- Scenario: a dashboard of stacked line charts; wheel-scrolling the page stops whenever the pointer crosses a chart, even at full zoom-out, where each notch also asks the engine again for the same window.
- Ctrl+wheel (browser zoom) is blocked. With the plot focused, Ctrl+`+`, Ctrl+`-` and Ctrl+`0` zoom the chart and Alt+Left pans it, each with `preventDefault`.
- The grid lets the wheel through at its ends; the chart has no equivalent.
- Severity: polish. Confidence: confirmed by reading.

Done in Charts: the wheel and the browser's keys pass to the page, and a drag that loses its pointer ends: the wheel is left to the page when the chart shows everything and it would zoom out
further, which also no longer asks the engine for the same window; Ctrl, Cmd or Alt with the wheel or a key is the
browser's (`browsers` and `wheelZoom` in `pointer-keys.ts`). `tests/browser/chart-pointer.test.tsx` checks which
events the plot takes.

**12. `packages/parallax/src/chart/scene-pointer.ts:158-171` and `:194-204`** — A drag ends only on `pointerup` or `pointercancel`; there is no `lostpointercapture` handler and no `event.buttons` check.

- Scenario: capture is lost mid-pan (Alt-Tab or a Citrix focus change). `#drag` stays set and the chart pans under a plain hover until the next click.
- Severity: polish. Confidence: plausible.

Done in Charts: the wheel and the browser's keys pass to the page, and a drag that loses its pointer ends: `lostpointercapture` ends a drag as `pointercancel` does, and a move whose primary button is
no longer down ends it as its `pointerup` would have; both are held in `tests/browser/chart-pointer.test.tsx`, which
fail on the old code.

**13. `packages/parallax/src/chart/model-pie.ts:66` and `:109-121`** — Hiding a slice rescales the rest, but each keeps the engine's share of the original total.

- Scenario: Govt 50%, IG 25%, HY 25%; hide Govt.
- Actual: IG and HY each span 50% of the ring and are labelled 25.0%.
- Also: any second column's text becomes the slice label, so `y={["mv", "pnl"]}` or a `series` split labels slices sized by the first column with the second's values.
- Severity: polish. Confidence: confirmed by running (hidden slice), by reading (second column).

Done in Charts: a pie notes a share only where the view has one, and values while a slice is hidden: a pie notes and labels its slices with a share only when the layout's second measure is the
first's share of the grand total (same column and aggregate, `percent_of_grand_total`, no split), which
`categoriesOf` reads from the layout as `share`; any other second column, or a series split, notes each slice's
value. While a slice is hidden the rest fill the ring, so the notes and labels are the slices' values, which the
engine wrote, not shares of a whole the ring no longer shows; a share recomputed here would be a number the engine
did not write. Held in `tests/unit/chart-model-groups.test.ts` and `chart-source.test.ts`.

**14. `packages/parallax/src/chart/small-data.ts:53-72`** — Type inference fails silently on bad dates and throws in render on mixed values.

- `"0000-00-00"` and `"2026-13-01"` become 1970-01-01, stretching the axis from 1970; `"2026-02-30"` becomes 2 March.
- One `"N/A"` in a numeric column throws a `TypeError` during render, which takes down the React tree instead of showing the chart's own alert.
- `ChartRow = Record<string, ChartValue>` rejects typed API rows with optional or nested fields, though only the plotted columns are read.
- Severity: polish. Confidence: confirmed by running; the type point by reading.

Done in Charts: the small-data form runs as its docs show, types its rows or says why, and keeps its own table: a plotted column of mixed kinds, or of a value a chart does not draw, and a `YYYY-MM-DD` that
is no day (`0000-00-00`, `2026-13-01`, `2026-02-30`), are the chart's own problem, in place of the plot and to
`onError`, never a throw from render. `ChartRow` is any object: an API's typed rows, with optional and nested
fields, are taken, and only the plotted columns are read (`src/chart/small-table.ts`,
`tests/unit/chart-small-table.test.ts`).

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

- A line or area chart's `hidden` holds each series by its key: the series column's value on a chart of one
  column, such as `"AAPL"`, the column's name for a series not split, and the column and the value, as `"close
  AAPL"`, on a chart of several. A series hidden by its legend label, as saved layouts hold them, is still hidden.
  Hiding a series hides its indicators and events with it, and the measure tool measures the series pressed. What to
  do: nothing; a layout written by hand may name its series by key.

- A bar chart, heatmap, pie or waterfall draws every group of its grouped view, up to 2,000 groups and 400 series,
  where it drew the first 499 groups without a word. Past the limit it draws none and says what to change in place
  of the plot. What to do: nothing; a chart of more groups filters its rows or keeps the largest with `top_n`.

- `<Chart rows>` reads only the columns it plots, so an API's typed rows, with optional or nested fields, are taken
  as they come; `ChartRow` is any object. A column of mixed values, or a date that is no day, shows in place of the
  plot and goes to `onError`, where it threw from render or drew from 1970. Text dates are dates on every chart, a
  waterfall's included. Each chart keeps its own table, so a page of many small charts loads each once. What to do:
  nothing; a line of text tenors gives `settings={{ axis: "tenor" }}`, as the chart now says.

- `ViewHandle.measure(from, to, of)` takes `{ series, y }`, the series by its value and the y column whose line it
  measures, where it took the series as a string; the Measure tool measures the line pressed, on any y column. What
  to do: a page that called `measure(from, to, "AAPL")` passes `{ series: "AAPL" }`.

- A chart refuses a setting it does not draw, with what to change, where it ignored it: `stacked` on anything but a
  bar chart, and `y_right` on anything but a line or area chart. What to do: a layout that set either drops it, or
  draws its columns as the message says.

- A histogram or area on a log axis shows its smallest values, such as a bin of one row, where they had no height;
  a scatter's log axis fits its dots though one is at or below zero, and a density, which stays linear, says so.
  What to do: nothing.

- Over a chart that shows everything, the wheel scrolls the page, and with Ctrl, Cmd or Alt the wheel and the keys
  are the browser's (zooming the page, going back). A pan that loses its pointer, as to a remote desktop's change of
  focus, ends. What to do: nothing.

- A pie labels its slices with shares only when its second measure is the first's share of the grand total, and
  with their values while a slice is hidden, where it labelled a half of the ring "25.0%". What to do: nothing; a
  pie that wants shares gives `{ ...first, show_as: "percent_of_grand_total" }` as its second measure.
