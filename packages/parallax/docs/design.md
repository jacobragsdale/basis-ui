# How parallax is designed

parallax is a data grid, pivot table and charting stack for portfolio managers
and quant researchers. It is a Rust engine with a React front end. Three
facts about its users drive the design. The datasets are large. The browsers
have no GPU. A wrong number on screen costs more than a slow one.
[Perspective](https://github.com/perspective-dev/perspective) is the model for
the architecture. parallax is a new implementation, not a fork, and its tests
use Perspective as a second reference.

## Why existing grids fail at this size

The component suites that parallax replaces hold each row as a JavaScript
object and draw one DOM or SVG node per value. DevExpress DevExtreme is the
one in the first deployment. One million rows of 20 floating-point columns and
two text columns were parsed from JSON in Node 26's V8 on 2026-11-02. They
took 509 MB of JavaScript heap, about 530 bytes a row. Stored as typed
columns, the same data took 155 MB, 163 bytes a row.

V8's pointer compression caps a tab's JavaScript heap near 4 GB. Grid suites
also keep extra copies of the rows for sorting, filtering and wrapping, so a
few million rows exhaust the tab. The JSON text adds to the peak: about 510 MB
for that million rows, held alongside the parsed objects while it parses.

parallax avoids each of those costs. Data travels and lives as Arrow columns.
Computation happens where the data is held. The screen receives only what it
draws.

## The environment: Windows 11 on Citrix, without a GPU

Users run a Chromium-based browser on 64-bit Windows 11 Citrix VDIs, with
software rendering only. Chromium
[deprecated](https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM/m/oLrB5up_BwAJ)
the automatic SwiftShader fallback for WebGL in Chrome 130 and removed it by
Chrome 139. On a machine without a GPU, creating a WebGL context therefore
fails outright instead of running slowly. WebGPU is unavailable for the same
reason. That rules out every GPU charting library, Perspective's WebGL charts
included. Canvas 2D, which Skia rasterizes on the CPU, is the drawing surface
that works.

Citrix adds two more pressures. A VDI's CPU and memory are shared and limited,
so a table held in the browser has a documented limit. Citrix's display
protocol sends only the screen regions that changed. A redraw confined to the
changed cells therefore costs less than a full repaint, both on the VDI and on
the network.

## One engine, in the browser

The engine is a Rust library compiled to `wasm32-unknown-unknown` and run in a
Web Worker, off the page's main thread. It is also compiled natively, for the
tests: the comparisons with DuckDB run natively, and a fixed protocol
conversation must produce byte-identical replies from both builds, so what the
native tests prove holds in the browser.

The app loads its own data: Arrow IPC stream bytes it fetched from its API move
to the worker in the message's transfer list, so they are never copied between
threads, and the engine decodes them in place, its arrays pointing into the
bytes rather than a second copy of them. A view of a dataset waits for its load,
which the app may start before the bytes arrive, and fails with the reason if
the load does; the worker's welcome is sent before any load, so it lists no
datasets. Spike 0.3 set the limit of one such table at 150,000 rows and 70 MB of
Arrow, where the reference pivot meets its 500 ms budget on a slow desktop;
`MAX_ROWS` and `MAX_ARROW_BYTES` in the browser engine hold them. The bytes are
checked before they leave the page, and the rows are counted from the stream's
batch headers before any data is decoded, so a larger load fails with a message
naming the limit and the size before it costs memory. The load's status is the
app's to give: its API writes when it read the source, and the NaNs it turned
blank, in the schema metadata under `parallax.load`.

WebAssembly memory grows and never shrinks, and a load or export past it ends
in a trap that says only `unreachable`. A trap leaves the engine half-changed
and borrowed, so every later call would fail; the worker therefore reports it
and answers nothing more, and the page ends the worker, which frees all its
memory, fails every waiting request and open view with the reason, and starts
an empty one. The release build drops the module's name section, a quarter of
its bytes, which only stack traces use.

Until basis-ui's step 2.2, parallax also had a server: it held tables too large
for the browser and sent the browser only the rows on screen, read them through
connectors to databases and files, and copied small ones into the worker. The
firm's tables fit within the browser's limit, and every app would have deployed
a server beside it, so it was deleted;
[basis-ui's design](../../../docs/design.md#parallax-basisparallax) has the
reasons. A table larger than the limit is narrowed by its API, which filters or
aggregates it.

The browser build is single-threaded and stays under the 4 GB limit of 32-bit
WebAssembly. Going further would cost a lot:

- Rust's `wasm64-unknown-unknown` target is Tier 3.
- Multithreaded WebAssembly from Rust needs a nightly compiler and a rebuilt
  standard library.
- Threads also need cross-origin isolation headers on the host application.
- The `wasm-bindgen-rayon` helper was last released in December 2024.

That cost isn't worth paying for tables within the limit. The native build,
which the tests run, parallelizes with rayon.

## Inside the engine

A table stores each column as a typed vector with a validity bitmap, one entry
per slot. A slot is stable for the life of a row:

- an update overwrites the slot in place
- a delete frees it for reuse
- a hash index on the primary key finds the slot for a key

Text columns are dictionary-encoded. Each dictionary keeps a rank for every
string in the engine's text order, so sorting and grouping compare integers
instead of strings. Arrow is the format at the edges: loads arrive as Arrow
batches, and every window leaves as one.

A load into a keyed table is a diff against the current contents. New keys are
inserted, changed rows are updated in place, and missing keys are deleted. The
load is validated in full before anything changes. The result is a change set:
the old images of removed and overwritten rows, and the slots of new and updated
ones.

A view is a pipeline over a table:

1. filter
2. computed columns
3. group or pivot
4. aggregate
5. sort
6. the window the screen asks for

A grouped view applies a change set as a diff, as Perspective does. It removes
the old images' contributions and adds the new rows'. That gives the same
state as building the view from scratch, which the tests check after random
streams of loads and upserts. Live streams use this, but its main use is
refresh. About 90% of pages show snapshot data, and applying a reload as a diff
keeps an open pivot's expanded rows, sort and scroll position intact.

A flat view re-filters and re-sorts the table on every change, using every core
natively and the worker's one thread in the browser. Incremental maintenance of
flat views waits for live sources, which are deferred.

Text is stored as dictionary codes, so a filter on a text column decides each
distinct string once. It keeps a bit per code saying whether that string
passes, and testing a row reads its code and one bit; new strings are decided
as a reload interns them. Removed rows carry dictionaries of their own, so they
are tested on their text. On 1,000,000 trades, a "contains" filter on the
ticker took 1.4 ms this way, against 27 ms when each row's text was lowered
and searched (2026-11-03). Text conditions ignore case: contains, does not
contain, starts with and ends with. "Does not contain" keeps blanks, as a
spreadsheet does. A filter may test several columns and pass when its
condition holds in any of them, which is how a search across a grid's columns
runs.

A grouped view keeps a tree. The root is the grand total, and each level below
groups by one more column. Every node is fed directly by base rows, so no total
is computed from other totals. Column pivots keep one cell per node and
column-pivot key, next to the node's own row total.

The aggregates are sum, count, mean, weighted mean, minimum, maximum, first,
last, distinct count, variance, standard deviation, median and percentiles.

- **Sum, count, mean, variance and weighted mean** are kept at every node as
  exact sums that can be reversed. A change costs constant time per node.
- **Minimum, maximum, first, last, distinct count, median and percentiles** keep
  value counts at the leaf nodes only. Nodes above merge their leaves when a
  value is needed, which keeps memory proportional to the rows rather than to
  rows times levels.

Pivots support:

- several row and column levels
- subtotals and grand totals
- expand and collapse state that survives refreshes and re-sorts
- sorting by any aggregate within a level
- filters on raw values and on aggregates
- top-N per level, with an "Other" row
- percentage of parent, row, column or grand total
- running totals among siblings in their order, Excel's "Running Total In",
  from exact sums, for sums and counts
- drill-through to the underlying rows
- several measures at once

A grid can be grouped too, keeping its rows: a detail view. Its innermost
groups expand into their rows, in the grid's sort, and each group row carries a
count of its rows. The grand total is the grid's totals row rather than a row
of its own. Detail rows are kept as runs, one per group, so a million rows cost
a group's entry rather than one each. The rows that pass are gathered by group
the first time any show, and each group is sorted the first time its rows show;
on 1,000,000 trades grouped two levels deep, that first window took 23 ms and
later ones under 2 ms. A detail view takes no column pivots, measures, top-N or
aggregate filters, and sorts its groups by their keys.

## What "never wrong" means

parallax treats a plausible but wrong number as worse than an error. Every rule
in this section follows from that.

### Numbers

Money columns use exact decimals (Arrow Decimal128) alongside f64, i64 and
time-zone-aware timestamps. Floating-point sums are exact until one final
rounding: each double is added to a fixed-point integer wide enough for every
finite double (a Kulisch accumulator), and the total is rounded once. The `xsum`
crate, the first choice, returned a neighbouring double for some single values,
so the engine carries its own accumulator and the tests compare it with a port of
CPython's `math.fsum`. A total comes out the same, to the last bit, however it is
computed:

- incrementally
- from scratch
- in the browser
- natively
- in DuckDB

Removing a value adds its negative, which is equally exact. Integer and
decimal sums accumulate in 256-bit integers. A decimal sum that cannot fit 38
digits shows an overflow marker instead of a wrapped value. A mean is the exact
sum divided by the count, rounded once.

The sample variance of doubles comes from the exact sums of values and of
squares, each square added without error. Big-integer arithmetic then divides
once. A group of identical values therefore has a variance of exactly zero,
not a rounding residue. Percentiles of decimals are reported as doubles at full
interpolated precision. DuckDB instead rounds them to the column's scale.

Every subtotal and grand total is computed from base rows, never from other
subtotals, so no average is an average of averages. Percent-of-total with a
zero denominator shows a dash. Distinct counts are exact. Percentiles
interpolate linearly, matching Excel's `PERCENTILE.INC` and DuckDB's
`quantile_cont`.

A column can declare its unit, either fixed (`USD`) or taken from another
column (`currency`). When a group mixes units, the cell reads "mixed" and lists
the units on hover. The exception is when the layout converts through a
declared FX-rate column. The same guard covers percent against basis points.

### Nulls, NaN and text

Nulls follow SQL rules:

- Aggregates skip nulls.
- `count(*)` and `count(column)` stay distinct.
- A null group key appears as "(blank)" and sorts last.

NaN becomes null at load time and is counted in the view's data-quality badge,
so the substitution is visible. Positive and negative infinity are kept.

Text sorts case-insensitively, with a case-sensitive tie-break and nulls last.
There is no locale-dependent collation, so the order is the same on every
machine and matches the test oracle.

A layout can give a text column another order, which
[step 2.8](../../../docs/roadmap.md#phase-2-parallax-in-the-browser) of
basis-ui's roadmap added for fixed income, in its `orders`:

- `"tenor"` orders tenors by length, so a ladder reads `1Y, 2Y, 10Y` rather
  than `10Y, 1Y, 2Y`. It reads a tenor as `@basis/ui/dates` does: a whole number
  from 1 to 9999 and `D`, `W`, `M` or `Y`, in either case, a month being a
  twelfth of a Julian year, so `12M` and `1Y` are alike.
- `"rating"` orders credit ratings best first, on S&P's and Fitch's scale and
  Moody's, a notch of one alike with the same notch of the other: `AAA` and
  `Aaa`, `BBB-` and `Baa3`, down to the defaults.
- `{"values": [...]}` orders the values as listed.
- `{"by": "column"}` orders each value by another column's smallest value
  among the rows that have it, such as a tenor bucket by its bonds' shortest
  maturity, over every row of the table, whatever the view's filters.

Keys an order cannot place, such as `NR` among ratings, come after the rest,
keys it places alike follow each other in text order, and nulls come last.
Each order becomes a rank for every string of the column's dictionary, kept
with the view and ranked again as loads add strings or change the column an
order reads, so sorting still compares integers. Groups at every level, column
pivots, flat and detail sorts, a filter menu's values, a chart's series and
the categories of bars, heatmaps and pies follow it; a descending sort reverses
it, nulls still last. Filters still compare text: under a rating order,
"greater than BBB" would read as worse than BBB, so a filter on ratings lists
them instead. The tests check every order against DuckDB, which orders the same
rows by SQL written apart from the engine's parser.

### Display

The screen and the Excel export show the same digits because both use one
formatter, in the engine. Frames carry its text next to each value, so the
browser draws what the engine wrote and never formats a number itself. It
follows Excel's display rules: a double is rounded to 15 significant digits, then
to the shown decimals, both half away from zero. So 2.675 at two decimals shows
as 2.68 in both.

Exact decimals and integers skip the 15-digit step: they never were doubles. A
decimal of 15 significant digits or fewer converts to a double and back
unchanged, so Excel shows the same digits. A longer one shows in full on screen;
how the export writes it is decided with the export.

- A value that rounds to zero never shows a minus sign.
- A number too wide for its column shows `###`, as Excel does, never with
  digits clipped off.
- Text truncates with an ellipsis and shows in full on hover.
- K/M/B abbreviations are opt-in per column and always show the suffix. With
  `suffixes: "par"` they read `M`, `MM` and `BN`, as bond markets write par
  amounts and as `@basis/ui`'s `AmountInput` reads them back.
- Basis points, `bps: true`, write a rate or spread as `25 bp` with a
  no-break space. A rate is a fraction, 0.0025 here, the one unit APIs send
  rates and spreads in, so there is no unit to choose. Treasury prices in
  32nds, `thirty_seconds`, write 99.515625 as `99-16+`, to the finest step the
  column asks for: a 32nd, or a half, quarter or eighth of one. They are
  `@basis/ui`'s `Bps` and `Price32`, which now write through its port of this
  formatter, so a rate or a price reads the same in a card as in the grid, and
  the fixtures check every case of each. A double price is read at its
  shortest digits and rounded to 8 decimals, enough for any 256th of a point,
  before it is rounded to its step, as `Price32` reads one. A format takes one
  of a percentage, an abbreviation, basis points or 32nds.
- Percent, basis-point and K/M/B scaling move the decimal point exactly, before
  the one rounding to the shown decimals.
- Booleans show as `TRUE` and `FALSE`, as in Excel.
- Copy and export carry full-precision values. Display formats travel as Excel
  number formats.

A layout sets formats per source column: decimals, thousands separators,
percent, K/M/B and their suffixes, basis points, 32nds, negatives in
parentheses, the display zone, and sub-second digits. A measure takes its
column's format unless it sets its own; counts and variances use their type's
default, and shares of a total show as percentages.

A chart's value axes read in the plotted column's style where it has one a desk
reads: a percentage, basis points, 32nds or par suffixes, with as many decimals
as the step between ticks needs, so a yield's axis reads 5.50% rather than
0.055. The y axes are labelled by `@basis/ui`'s port of the formatter, and an x
axis of numbers by the engine. A 32nds axis steps by a 32nd's halvings, no
finer than the column shows. Other formats keep the axes' round numbers.

Excel has no 32nds and cannot multiply by 10,000, so an export keeps each
cell's value and shows a price in 32nds as a decimal price and basis points as
a percentage, the same digits two places over; the Notes sheet says so. Par
suffixes have Excel formats that read as the screen does.

Rounding happens only in this formatter. The tests compare it with exact
big-integer arithmetic on random doubles, many of them next to rounding
midpoints, and compare its time zones with DuckDB's.

### Time

Timestamps are stored as UTC instants. They are displayed in a zone that each
column declares, defaulting to `America/New_York`, and headers name the zone.
Digits below the shown precision are cut rather than rounded, so a time never
shows later than it happened and 23:59:59.9 never becomes the next day.

A timestamp without a zone, such as SQL Server's `datetime2`, is a wall-clock
time: it is shown as it is and never moved between zones. An API that knows the
source's zone turns such times into instants before it sends them, and decides
what the hour daylight saving repeats in autumn, and the one it skips in spring,
mean.

Business dates such as trade date stay dates and never pass through a zone.
Chart buckets are cut in the display zone, so a day is a New York day. The
engine uses `jiff` with a bundled, version-pinned time-zone database, so the
native and browser builds agree. Diagnostics show the database version.

### Loads

A load that would change the meaning of the data fails loudly instead:

- Duplicate primary keys are an error, unless the table opts into
  last-one-wins.
- A column that changes type or disappears is an error naming the column.
- A table past the browser's row or byte limit is refused before it is decoded,
  with the limit and its size.

A reload that fails never replaces the last good table. The view keeps the old
data and shows a "refresh failed" badge with the time. Each table records its
row count, its load number and its load times, all visible in the view's info
panel.

Every frame of rows sent to the screen carries two versions: the view
configuration that produced it, and the table load. The UI discards frames
that don't match the current versions. A scroll racing a filter change
therefore can never paint old rows under new headers, and a view never mixes
rows from two loads.

## How the guarantees are tested

The tests compare parallax with independent implementations rather than with
expected values written by hand. They run on data from a reproducible,
seed-driven generator. It produces realistic finance data:

- positions, trades, and daily prices with fat-tailed returns
- Zipf-distributed ticker frequency
- several currencies and mixed decimal scales

It also produces hostile values: nulls, NaN, infinities, negative zero,
notionals of 10^15, weights of 10^-12, duplicate keys, Unicode tickers, and
timestamps at daylight-saving transitions.

Six layers of tests run on that data:

1. Random tables and random view configurations run through parallax and
   through DuckDB, and the results must match. Perspective is a second oracle.
2. Random streams of updates must leave every view identical to a
   recomputation from scratch.
3. The native and WebAssembly builds must return identical results.
4. The cells the grid draws must match the engine's output. This is checked
   from the renderer's cell model, and with Playwright screenshots in Chromium
   with the GPU disabled.
5. Exported Excel files are read back with `calamine` and compared with the
   view.
6. The protocol is fuzzed.

Technical-analysis indicators are checked against TA-Lib. Where indicator
definitions vary, such as how an EMA starts, parallax follows TA-Lib's
convention of seeding with an SMA, and MACD aligns its two averages as TA-Lib
does. Two cases differ on purpose, because TA-Lib reports zero where there is
no answer: a stochastic over a window whose high equals its low, and a VWAP
before any volume has traded, have no value. An RSI over a window without
movement reads 50, as in TA-Lib. Indicators skip rows that lack an input, such
as a null close, rather than reading them as zero or breaking the line; a
VWAP starts again with each New York trading day for intraday data, and runs
from the first row for daily data. Moving sums carry their rounding error, so a
moving average over a million rows stays within one unit in the last place of
the exact mean, where a plain running sum drifts by a dozen. Bollinger Bands
keep their sums in double-double precision: a square root turns the smallest
leftover of rounding into a visible spread, so a window that has gone flat must
come out with none. Every indicator takes one pass over the rows whatever its
period. A candle's volume that overflows its column's type says so rather than
wrapping round. Excel can't run on the Linux build host, so
at each milestone someone opens a verification workbook in real Excel on a VDI.

## Drawing without a GPU

The engine reduces data to screen resolution before sending it, so the client
never draws more than the screen can show.

Line charts use M4 aggregation. It keeps the first, last, minimum and maximum
value in each pixel column, and the resulting line matches, pixel for pixel,
the line through every point at that width. Spikes never vanish. A chart 2,000
pixels wide therefore needs at most 8,000 points, whether the series has 2,000
points or 20 million.

Heatmaps become binned densities, and bar charts arrive aggregated. A scatter
with at most 5,000 rows in the range shown, and in its y range, sends each row
as a dot, so that a bond can be seen, hovered and picked on a relative-value
chart; past that, it becomes a density too, and zooming in far enough draws the
dots again. Each dot carries every value it shows as the engine's text: its x
and y, a size column's, such as DV01, a fit column's, the layout's tooltip
columns', and an id column's, such as the CUSIP, with the id's exact JSON,
which a click selects as a bar's group is selected. A dot's area follows its
size column's magnitude as a share of the largest in the whole chart, not only
in the range shown, so zooming never changes a dot's size, and a dot of no size
still shows. A fit column holds the curve the API fitted, its value at each
row's x, and is drawn as a dashed line through each series, reduced with M4 in
either form, so the line covers the same pixels as the line through every
fitted row; the y range holds it as well as the dots. Dots are drawn a little
see-through and edged in the surface's colour, so touching dots stay apart;
while one is selected, the rest fade and it is drawn whole, ringed. In
headless Chromium on the build host's CPU (2026-11-07), 600 dots of mixed
sizes painted in 2.6 ms and 5,000 in 16.6 ms, a frame's worth, of which the
edges took 5 ms; a slow desktop takes about four times as long, so a chart near
the cap pans at about 15 frames a second there.

Indicators are computed on full-resolution data before the reduction. A 200-day
moving average computed from downsampled points would be wrong.

Candlestick and OHLC charts bucket rows by a calendar interval cut in New York
time: minutes, days, Monday-started weeks, months, quarters or years, the
shortest that keeps candles at least 4 pixels wide. Each bucket keeps its first
open, highest high, lowest low and last close. A histogram computes its bin
edges once and places every value by comparing it with them, so a value on an
edge lands in the bin that edge's label opens. Every reduced value carries the
row it came from, so tooltips show the exact value, formatted by the engine like
any cell.

A chart's x axis is either its values or trading time on the NYSE calendar,
where closed days and the hours outside the 09:30 to 16:00 session take no
space, so trading days sit one apart and Friday's close meets Monday's open.
The calendar's closures hold from 2000; before that, only weekends close. The
engine places the axis's ticks and writes their labels, because only it can
map trading time back to dates; a tick that falls on a closed moment moves to
where the market next opens and takes that moment's label.

Step 2.8 gives the trading axis a calendar and a session. SIFMA's calendar,
the US bond market's, closes on Columbus Day and Veterans Day as well, and its
2 p.m. early closes shorten their days, so closed time still takes no space; a
session that opens later in the day than it closes, as electronic Treasury
trading does, opens the evening before. The SIFMA calendar is tested against
the schedules SIFMA published, the same fixtures `@basis/ui/dates` is tested
against.

A tenor axis, `axis: "tenor"`, places curves and bonds by tenor: an x column
of tenors written as text, such as `3M` and `10Y`, or of years. By default the
standard tenors, 1M, 3M, 6M, 1Y, 2Y, 3Y, 5Y, 7Y, 10Y, 20Y, 30Y, 50Y and 100Y,
sit one step apart, as desks' curve screens space them, and a value between
two of them sits between them by length, so 4Y is halfway from 3Y to 5Y;
`tenor_spacing: "length"` places every value by its length in years instead.
The engine labels the axis with the standard tenors in range, keeping from the
long end those at least 36 pixels from the others, so a crowded short end
gives way first. Text that is not a tenor takes no place, as a null x does.

Averages, Bollinger Bands and VWAP are drawn over the price, and widen its
scale to hold them; RSI, MACD, ATR, the stochastic and volume each get a pane
under it, on the same x axis, so zooming, panning, the crosshair and a brush
cover every pane at once. Oscillator panes run from 0 to 100 with their usual
guides, MACD's histogram and volume bars take the up and down colours, and
overlays take the palette's slots after the plotted series, so an average never
shares a price's colour. The tooltip lists each indicator line's value at the
crosshair: on a candle, at the last row of its bucket, the one its close comes
from, and under that row's own date when it differs from the crosshair's.

Step 2.8 generalises panes beyond indicators: a layout lists panes of its own
columns, as lines or bars, on the same x axis, such as the change in basis
points under curves for several dates. Any value axis can be reversed, for
yields, where up is bad for a long position, and a chart says whether a rise
takes the gain colour or the loss colour, for its candles, volume, histogram
and change bars alike.

Drawings (trend lines, horizontal lines, Fibonacci retracements, rectangles
and notes) are saved in the layout, anchored to data rather than to pixels:
each anchor holds an x value of the x column, exactly as the frame's points
carry it, and a price. A new anchor snaps to the nearest point or candle, and
its price is rounded to what a pixel tells apart. The engine places every
anchored x value on the axis and sends the positions with each frame, because
only it can place a date on trading time, so a drawing stays with its data
however the chart is zoomed, panned or its axis placed. Changing a drawing is a
change of how the chart is drawn, so the reduction stays and only the
positions are sent again.

Compare mode puts every series of a line or area chart on its percentage
change from its first value in the range shown, so instruments of different
prices share one axis; the engine computes each change from its row's exact
value and writes it as a percentage, and refuses averages and bands, which are
in prices, on such a chart. A layout can name an events column: the rows it
marks in the range shown, such as earnings and dividends, are marked along the
bottom of the price and read in the tooltip, at most 500 of them, evenly
chosen, with the status bar saying how many there are in all. The measure
tool asks the engine rather than working from pixels: between the rows with a
price nearest the two ends of a band, it reads their prices, the change and
its percentage, and the bars between them, all as the engine's text.

A candle at either edge of the visible range keeps its whole bucket, so panning
never changes its prices, and each price comes from a row that has one. Minute
buckets are cut by each instant's own offset, so the repeated autumn hour gets
its own candles. Candlestick and OHLC charts show one instrument and need dates
or instants on the x axis.

Pie and donut charts draw the layout's grouped view, as bar charts and heatmaps
do, so the engine needed only the kind. A slice's angle comes from its group's
first measure; its label, tooltip and a donut's centre total are the engine's
text, and a second measure shown as a share of the total gives each slice its
percentage, so no share is computed in the browser. A pie with more than seven
groups asks the engine for its seven largest and one "Other" slice, which the
engine totals, unless the layout sets its own top-N. A share of a whole has no
negative parts, so a pie refuses negative values with a message rather than
drawing them. Clicking a bar or slice selects its group: the chart emits
`selectionChange` with the outermost group column and the group's exact key,
for a host to filter a linked view by, dims the other groups, and clears it on
a second click. "Other" stands for several groups and selects nothing.

Waterfalls, for attribution and P&L explain, draw the grouped view too: each
group's bar floats from the running total before it to its own, rising bars in
the up colour and falling ones in the down colour, joined by connectors, and a
total bar from zero ends them. The chart asks the engine for its first
measure's value and the same measure shown as a running total, Excel's
"Running Total In": among siblings in their order, the exact sum of a group's
rows and those of the groups before it, merged from their cells, so the last
step ends exactly on the total, a run that crosses units shows as mixed, and a
top-N's "Other" ends the run. Only sums and counts add up, so only they take a
running total, and groups cannot be sorted, filtered or ranked by one, since it
follows their order and which of them show. Every label is the engine's text. A
waterfall whose steps would miss its total, because an aggregate filter or a
top-N without "Other" hides groups, says so rather than drawing a gap. A small
waterfall's steps follow its rows' order, which it gives the engine as the x
column's order, so the engine runs its totals in that order too.

Charts label what they can without crowding. Category labels along the bottom
stay level if each fits its share of the width, break onto two lines between
words if that makes them fit, and otherwise turn 45° and are cut to a share of
the chart's height; only labels that would touch even turned are thinned out.
Unless the layout's chart says `labels: false`, each bar carries its value just
past its end, or just inside it in a contrasting ink, and the value axis leaves
room for it; stacked bars carry none, since their segments' values would crowd.
Each slice carries its share where the text fits between the hole and the rim,
in white or near-black, whichever contrasts more with the slice. The slice
under the pointer moves out, and a donut's hole names it in place of the total;
the chart finds that slice in the model drawn without the movement, so the
pointer never chases it.

A chart smaller than 260 by 200 pixels is compact: its plot has less padding
and no legend, and its tooltip names what is under the pointer. A pie at least
360 pixels wide lists its slices beside it in a table, as Excel does. A host can turn the
status bar off with `[statusBar]="false"` for a small tile.

M4's guarantee is tested directly: for random series with gaps and repeated x
values, the line through the reduced points reaches exactly the same lowest and
highest value in every pixel column as the line through every point.

The client draws with Canvas 2D:

- only on animation frames
- only in regions that changed
- with updates batched to a configurable visual rate, 4 Hz by default for
  flashing cells

Renderers, hit-testing and interaction are TypeScript inside `@basis/parallax`.
Drawing from Rust would cross the WebAssembly boundary on every text call and
make theming harder.

The grid draws on a canvas too. A virtualized DOM grid, Perspective's choice, was
measured against it on the same views in Chromium with the GPU disabled and the
CPU throttled four times. The DOM grid spent 1.1 to 2 times as much main-thread
time per frame, which is the headroom a slow desktop has before frames drop.
[The grid experiment](grid-experiment.md) has the method and the numbers. The DOM
grid brings native text selection and accessibility, which the canvas grid
provides separately; screen-reader support isn't a first-milestone requirement.

## The wire protocol

The page and the engine's worker exchange binary messages over `postMessage`,
every view's tagged by its ID.

- Control messages are protobuf: create a view, change its configuration, set
  the visible window, subscribe. The `.proto` files are the single source of
  truth and generate both the Rust and the TypeScript code.
- Data travels as Arrow IPC. The app's table reaches the worker as one Arrow
  stream, moved rather than copied; frames for the visible window come back as
  small streams of their own.
- Every data frame carries the view ID, configuration version, window bounds,
  table load version and source timestamp.
- A client can fetch a window once without moving the view's viewport, which
  is how a copy larger than the screen gets its rows. One fetch is limited to
  1,000,000 cells.
- A grid's layout change carries the window to answer it with, so the reply
  holds the rows to draw and the grid never asks twice. If the rows now end at
  or above the window's first row, as after a search, the window starts again
  at row 0 and the grid scrolls to the top.
- A grid has at most one layout change in flight. A newer change replaces any
  change still waiting, so a small table answers every keystroke and a large
  one never queues a backlog. Viewports and expansions asked for while a change
  waits are sent after it, so that they apply to its layout. The engine answers
  every change that carries a window, if only to refuse it, so a change in
  flight is never left waiting for an answer that won't come.
- A view of at most 20,000 cells, such as a few hundred rows, is fetched whole,
  so scrolling it needs no request. After a search leaves it small, the grid
  asks for rows up to that many cells, so clearing the search needs no request
  either. A larger view is fetched for what is in view, plus 40 rows and two
  columns on every side.
- A chart asks for a chart window instead of a viewport: an x range at a plot
  size in pixels, at most 16,384 each way. The answer is the reduction for that
  window, with the x axis's labelled ticks and every value's text, and a
  refresh pushes it again. Only one chart window per view is in flight; a
  newer one replaces any waiting, as viewports do.
- Each data column in a frame travels with its display text, its cell flags
  (overflow, mixed units, undefined) and, for timestamps, full-precision text
  for copying. Every Arrow field names its role and column index in its
  metadata, so the client pairs them by index, never by name. Column-pivot names
  can display alike: 1.001 and 1.004 both read 1.00 at two decimals.
- Names can repeat within a frame: a detail view grouped by a column it also
  shows has that column's group key and its values under one name. Arrow JS
  merges the metadata of same-named fields when it builds a batch, so the client
  reads each field from the schema the stream declares, matching vectors by
  position.

The session code that answers these messages is the same natively and in
WebAssembly, and a fixed conversation must produce byte-identical replies from
both builds, so the two can't drift apart.

## The React layer

The package, `@basis/parallax`, is React 19 on `@basis/ui`, whose components
draw the grid's toolbar, menus and status bar, the pivot's settings and the
charts' chrome. Its React layer replaced an Angular one in basis-ui's roadmap
step 2.6, and step 2.7 deleted that layer; its README has the API.

- `<Grid>`, `<Pivot>` and `<Chart>` each take a single `layout` and hand every
  change the user makes to `onLayoutChange`, so the host keeps its copy
  current.
- `<ParallaxProvider worker>` starts the engine's worker for the tree inside it,
  and ends it when it unmounts.
- `useDataset` loads the app's data, and `useView` opens a view of it, which
  the components build on; `useParallaxClient` offers the engine's operations
  to code.
- The npm package ships the WebAssembly engine and its worker built in; the
  app's bundler bundles the worker from `@basis/parallax/worker?worker` with
  the engine beside it. The worker starts when the app first loads data or a
  view opens, so pages without parallax never download the engine. `prewarm`
  starts it with the provider instead, so that the engine's start, about 0.2 s
  with the CPU throttled four times in spike 0.3, overlaps the app's own. The
  demo prewarms.

A layout is a JSON document that describes a whole view: dataset and
parameters, grouping, pivots, filters, sorts, formats, column widths, chart
configuration and drawings. Saved views, shared URLs, Excel exports and tests
all use it. Its JSON Schema is generated from the Rust types, versioned with a
tested migration for each change, and committed as `schema/layout.schema.json`.
The TypeScript library checks layouts with a Zod schema that mirrors the Rust
types. A test reads layouts the Rust crate wrote and requires each to come back
unchanged, with the same defaults, so the two can't drift.

Version 2 added what grids need. A version 1 document reads unchanged, since
every new field defaults to what version 1 meant.

- `search` matches text, ignoring case, in every column searched: the text
  columns a grid shows, or a pivot's group and column-pivot columns. The layout
  turns it into one filter across those columns, so a search survives
  drill-through, and the value lists in filter menus honour it.
- A filter can name more `columns`, and passes when its condition holds in any
  of them.
- `pinned` columns come first and stay at the left.
- `titles` rename headers, in the grid and in the export alike.
- `totals` fill a totals row, and a detail view's group rows.
- `detail` groups a grid's rows rather than pivoting them.

Frames carry the totals row beside the rows, computed for the same columns.

`<Grid>` keeps everything the user changes in the layout. Clicking a header
sorts by that column, then reverses it, then clears it; Shift adds a sort. In a
pivot, a header sorts groups by that measure. Dragging a header edge resizes
the column, and double-clicking it fits the loaded values. Clicking a group
expands or collapses it. The grid sends the engine only what a change needs:

- New widths send nothing.
- Expanding or collapsing sends that group.
- New formats are applied without recomputing the view.
- Anything else recomputes it.

Cells are selected by click, Shift-click, drag or the keyboard: arrows, Page
Up and Page Down, Home and End, with Ctrl to jump and Shift to extend; Ctrl+A
selects everything. Ctrl+C copies the selection as tab-separated text with
every digit, which pastes into Excel as cells. A selection larger than the rows
on screen is fetched first, up to 1,000,000 cells, without moving the view.
Hovering over a cell whose text was cut, a `###`, or a flagged cell shows the
full text or what the flag means.

`<Pivot>` puts a field list beside a grid, laid out as Excel's PivotTable
field list is, since that is the pivot its users already know. The dataset's
fields are listed with a search, ticked when the pivot uses them, and dragged
into the Filters, Columns, Rows and Values areas, or between them; a drop line
shows where a field lands. Ticking a field puts it where Excel does, numbers on
Values and anything else on Rows, and unticking takes it out of every area.
Dragging is never required: each field has a menu that adds it to any area, and
each chip has a menu and a remove button. A field groups one way, so moving it
to Columns takes it out of Rows. Removing or moving a value renumbers everything
that referred to it by position: the group sort, aggregate filters, top-N and
column widths.

A value's menu sets its aggregate, column, how it is shown (as a value or a
share of a total), and its number format: decimals, thousands, millions or
billions, and how negatives read. The same menu opens from the value's header in
the grid, where it also sorts the groups by the value. A pivot's columns fit
their values, every column of one value sharing a width, so totals don't read
`###`; their titles, which name the pivot values and the value, don't widen
them.

Filters use the grid's own filter editor, so a pivot filters as a header menu
does: a list of the column's values with their counts, which the engine computes
under the view's other filters, as a spreadsheet's filter list does, or a
condition. "(blank)" can be picked too: an "is one of" list may name null, and
then matches blanks. A field dropped on Filters shows "(All)" with its list open,
and stays out of the layout until it names a value, because an empty "is one
of" would hide every row. The pivot's toolbar has the grid's search, chips and
export, plus Expand all and Collapse all.

Double-clicking a value opens the rows behind its cell below the pivot: a flat
view with the pivot's filters plus one filter per group level and per
column-pivot level. Its grid has its own toolbar, to search those rows, choose
their columns and export them. Its filters are what put the rows there, so they
show in its title rather than as chips to remove. It closes when the pivot's
filters or groups change, since its rows would no longer add up to the cells
above.

A layout also travels as a link: `encodeLayout` deflates it into a URL
parameter, and `decodeLayout` checks it against the schema, so an edited link
fails loudly instead of opening a different view.

Under every grid a status bar names the dataset and the rows shown, and says
when the source was read and how long ago. It also flags NaN values the load
turned blank, and a failed refresh with its time. An info button lists the load
details.

### Themes

Every colour, font, size and border the components draw is a design token,
listed once in `src/theme/tokens.ts` with its defaults for the light and dark
schemes; the package's stylesheet, the TypeScript types and `readTheme` are all
generated from that list. `basisTheme`, the default, gives each token one of
`@basis/ui`'s. [Themes](theming.md) lists the tokens and shows how to apply
your own.

Each token has three custom properties. The public one, `--px-accent`, is never
declared by the library, so a value a host sets anywhere wins: on `:root`, on a
wrapper or on the element, whatever its specificity. A theme made with
`defineTheme` declares `--_px-theme-accent` on the components given it. Each
component then declares `--_px-accent` as the first of the two that is set,
else the scheme's default. Had the library declared the public property on the
component, as it once did, a value on `:root` or a wrapper would have lost to
it, and only rules naming the components would have worked.

Most defaults derive from a few tokens with `color-mix()` and `calc()`: the
borders, the header, stripes, selections, focus rings and chips mix the
accent, background and foreground, and paddings are multiples of the spacing
unit. A theme of three colours is therefore consistent throughout, and any
derived token can still be set on its own.

The canvas can't draw with `var()`, `calc()` or `light-dark()`, so the
resolved properties are registered with `@property` as colours and lengths.
`getComputedStyle` then returns concrete values, which the canvas draws with
as they are. CSS can't announce that a computed value changed, so a shared
watcher counts the page changes that usually mean a new theme: an attribute of
`<html>` or `<body>` changing, the system's colour scheme changing, and fonts
loading. The components read their tokens again then, when
`useParallaxTheme()`'s `read` changes, and when their inputs change. Reading tokens on every redraw
would cost a style recalculation per frame, and Citrix desktops have no cycles
to spare. Text widths are cached per font, so a theme that changes the font
measures again.

Comfortable density adds a fixed 6 px to the row and header heights, whatever
the theme sets, so the two choices are independent. The row under the pointer
is highlighted by redrawing that row's cells only: a full redraw at every
pointer movement would send most of the grid across a remote-display protocol
each time.

## Excel export

The engine's worker writes exports with `rust_xlsxwriter`, from the table it
already holds, and the page saves the file as a download. An export runs the
layout through the same engine and formatter as the screen, so it holds the
same numbers. The browser has no file system for `rust_xlsxwriter`'s temporary
files, so every sheet is held in memory, at about 190 bytes a cell that
WebAssembly never returns, and the workbook takes its timestamps from
JavaScript's clock. An Excel export there is capped at 1,000,000 cells, about
190 MB beside a table at the row limit, and a larger view is refused with a
reason that says to export CSV. CSV reaches the page in chunks of about 1 MB as
it is written, and the page joins them into one file, so the export is never
held whole in WebAssembly memory as well as in the page.

- Cells hold real numbers, with Excel number formats that show the digits the
  screen shows. A negative value that rounds to zero gets a format without a
  minus sign, because the screen never shows one there.
- Dates and times are Excel dates, shown in the display zone. Times shown to
  the microsecond, which Excel cannot hold, are written as their text.
- The sheet has a frozen header row, column widths from the layout, and, for
  flat views, an autofilter. Headers are the layout's titles, and pinned
  columns are frozen too, as they stay put on screen.
- A grid with totals ends with its totals row, read as the screen shows it. It
  sits below the autofilter's range, so Excel's filters don't change it, and
  the Notes sheet says so. CSV leaves it out.
- A detail view exports as an outline like a pivot's. Its group rows read
  "Atlas (120)", with the group's count, and hold the group totals; its rows
  hold their values.
- A pivot exports every group as an outline, with the outline buttons beside
  the group rows, which come first as on screen. Groups start expanded:
  `rust_xlsxwriter` 0.102 marks a collapsed group on the row after it, which is
  right only for buttons below the groups. It also writes outline levels only for
  sheets it holds in memory, which every sheet in the browser is; the native
  build, which the tests use, streams pivots of more than 2,000,000 cells
  without an outline, indented by level. Native Excel pivot tables are not
  written.
- A Notes sheet records the dataset, when the source was read, the layout, and
  every place Excel cannot match the screen: values with more than 15
  significant digits, which Excel rounds; infinities, which it lacks; and the
  like.
- An export larger than Excel's limit of 1,048,576 rows, or text longer than a
  cell's 32,767 characters, is refused with the reason, and CSV is offered
  instead. CSV holds every digit as text, and a pivot's CSV has one column per
  group level. It starts with a UTF-8 byte-order mark, without which Excel
  reads non-ASCII text in the system code page, and text that a spreadsheet
  would run as a formula gets a leading apostrophe.

The export reads the table one chunk at a time, and if the table reloads part
way, it stops rather than mix two loads. The page asks for the load the screen
shows, and an export of any other load is refused with the reason, so a file
never holds newer numbers than the screen did. A refusal shows in the status
bar.

The read-back tests open each export with `calamine` and compare every cell
with the engine's value, bit for bit for doubles. Excel can't run on the build
host, so `cargo run -p parallax-export --example verification` writes a workbook
whose second and third columns must read the same in real Excel on a VDI.

## Deliberately out of scope

Authentication, entitlements and audit belong to the app and its API. Cell
editing, Python bindings and the other deferred items are listed with their
reasons in [Deferred work](future.md). The milestones, build order and
performance budgets are in the [Roadmap](roadmap.md).
