# Spike: reading Excel workbooks in the browser

The design held reading uploaded spreadsheets back until a Rust reader had been measured against the JavaScript ones
([Rust and WebAssembly](../design.md#rust-and-webassembly)). calamine, compiled to WebAssembly, reads an .xlsx at
`FileImport`'s row limit 4.4 times faster than SheetJS, 3.2 times faster than exceljs and 1.9 times faster than
read-excel-file. A dependency-free TypeScript reader, written for this spike and shipped as `readWorkbook` in
`@basis/ui/utils`, comes within 1.4 times of calamine: 286 ms against 207 ms for 10,000 rows with the CPU held to a
quarter. It weighs 5.5 KB against calamine's 296 KB, needs no second WebAssembly module and no Rust build in
`@basis/ui`, and needs no dependency from a registry. So `FileImport` reads .xlsx in TypeScript, and refuses the
formats only calamine reads well (.xls, .xlsb and .ods) with the way to save them as .xlsx. Run on 2026-11-07.

## Versions

| Side    | Versions                                                                                                                                                               |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Readers | calamine 0.38.0 with wasm-bindgen 0.2.130 (Rust 1.99.1, release, LTO, one codegen unit); SheetJS `xlsx` 0.18.5, the last on npm; exceljs 4.4.0; read-excel-file 9.3.14 |
| Browser | Playwright 1.65.0, Chromium 158.0.8127.18 headless, on an AMD Ryzen 7 8745HS                                                                                           |
| Tools   | Node 26.13.0, esbuild 0.28.2; files written by openpyxl 3.1.5 and xlwt 1.3.0                                                                                           |

## Setup

[`bench/make_files.py`](xlsx-reader/bench/make_files.py) writes the files: 10,000 rows of 12 columns, as a positions
sheet holds them (a CUSIP, a description, par, price, yield, three dates, a book, a boolean, a coupon and a note),
which is `FileImport`'s row limit and 717 KB as .xlsx and 2.2 MB as .xls; and 60,000 rows, 4.3 MB as .xlsx, near its
5 MB byte limit, for an app that raises the row limit. Each .xlsx also has a second sheet.

[`calamine/`](xlsx-reader/calamine) is the Rust reader: one function that opens the workbook from its bytes, reads the
first sheet and returns its cells as one string, split into rows and cells in JavaScript, which crosses the boundary
once rather than once a cell. [`bench/handrolled.mjs`](xlsx-reader/bench/handrolled.mjs) is the first TypeScript
prototype: the ZIP directory read with a DataView, each part inflated by the browser's `DecompressionStream`, and the
XML scanned with `indexOf`. [`bench/entry.mjs`](xlsx-reader/bench/entry.mjs) wraps each reader to give a sheet's rows,
and [`bench/run.mjs`](xlsx-reader/bench/run.mjs) loads them in a page, reads each file six times, and reports the
median of the last five, at full speed and with `Emulation.setCPUThrottlingRate` at 4, the stand-in for a Citrix
desktop that spike 0.3 used. To run it: build `calamine/` for `wasm32-unknown-unknown` and run `wasm-bindgen --target
web` into `calamine/pkg`; install `bench/package.json`; bundle `entry.mjs` and `basis-entry.mjs` with esbuild into
`bench/dist`, beside the files, the wasm and an `index.html` that loads both; then `node run.mjs`.

## Results

Medians in milliseconds; brotli sizes at quality 11, of a minified bundle of the reader alone.

| Reader                   | 10k rows .xlsx | 10k, CPU ÷4 | 60k rows .xlsx | 60k, CPU ÷4 | 10k .xls, CPU ÷4 | Size, brotli |
| ------------------------ | -------------: | ----------: | -------------: | ----------: | ---------------: | -----------: |
| calamine in wasm         |             50 |         207 |            310 |       1,247 |               56 |       297 KB |
| `readWorkbook` (shipped) |             73 |         286 |            434 |       1,618 |                — |       5.5 KB |
| TypeScript prototype     |             30 |         113 |            179 |         699 |                — |         1 KB |
| read-excel-file          |            120 |         401 |            702 |       2,415 |                — |        15 KB |
| exceljs                  |            227 |         660 |          1,054 |       3,992 |                — |       218 KB |
| SheetJS                  |            208 |         901 |          1,402 |       5,911 |              905 |        93 KB |

calamine's times leave out what `readWorkbook`'s include: dates read as ISO 8601 by their cells' formats, and numbers
rounded to the 15 digits Excel shows. They also leave out its download and compiling the module, done before timing.
The prototype does neither and handles only what the test files hold; `readWorkbook` reads namespace prefixes, rich
and inline strings, cells without references, CDATA, strict Open XML, the 1904 date system, errors and uncalculated
formulas, and refuses what it cannot read with the reason. Its first version scanned with regular expressions and took
893 ms for 10,000 rows with the CPU held to a quarter; finding tags with `indexOf`, reading attributes without a regular
expression, and keeping one ISO date for each day brought it to 286 ms.

## Answers

1. **Does a Rust reader beat the JavaScript ones?** Yes: calamine reads the 10,000-row .xlsx 4.4 times faster than
   SheetJS and 1.9 times faster than the fastest library, read-excel-file. It beats the dependency-free TypeScript
   reader by 79 ms with the CPU held to a quarter, which does not pay for 291 KB more download, a second module in a
   worker, and a Rust build in `@basis/ui`, which `@basis/parallax`'s module cannot hold, since parallax depends on
   `@basis/ui`. **Fallback:** if the firm's files on a Citrix desktop prove the TypeScript reader too slow, calamine
   goes in `@basis/ui` as its own module, loaded only when a workbook is dropped, in a worker ended after the read.
2. **Can a JavaScript library serve?** Not well: SheetJS publishes its current versions only on its own CDN, not on
   the npm registry the firm mirrors, and npm's 0.18.5 carries the advisories its later versions fix; exceljs's last
   release was in 2023; read-excel-file pulls in four packages. All read .xlsx only, but SheetJS. **Fallback:** none
   needed, since `readWorkbook` reads .xlsx with none of them.
3. **Is an .xls read without Rust?** No: only calamine reads it fast, 56 ms with the CPU held to a quarter against
   SheetJS's 905 ms, and no reader in TypeScript is worth writing for a binary format Excel stopped saving by default in 2007. **Fallback:** `FileImport` refuses .xls, .xlsb and .ods, with the steps to save them as .xlsx, and calamine is
   the reader if the firm's users turn out to upload them often.
4. **Must the read move off the page's thread?** Not yet: inflating runs in the browser's own threads, and the XML scan
   of 10,000 rows holds the page for 286 ms with the CPU held to a quarter, about what reading a large CSV holds it
   for. **Fallback:** run `readWorkbook` in a worker if a Citrix desktop shows the drop zone's spinner stall.

## Not verified here

- A real Citrix desktop's CPU: the quarter-speed CPU is spike 0.3's stand-in.
- Workbooks saved by Excel itself: the tests read what openpyxl writes, what `workbookFile` writes in Excel's layout
  (shared strings and a date style), and hand-written parts for what other writers do. **(work)** Import a positions
  workbook saved by Excel on a Citrix desktop through the gallery's data page, and send back what the preview shows and
  how long the spinner showed.
