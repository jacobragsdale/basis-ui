# Review of `@basis/ui` utilities: one release blocker, the numeric core is clean

All source in the area was read in full; the tests were skimmed (names and selected bodies), not read line by line. Findings are ranked most severe first. Paths are under `packages/ui/src/`. Throwaway scripts are in `(a scratch folder)`.

## Findings

1. **`packages/ui/src/utils/parse-csv.ts:33`** — `quotedField = /"(?<text>(?:[^"]+|"")*)"/` backtracks exponentially on a quoted field that never closes, so a truncated CSV freezes the tab.
   - Input → actual: `parseCsv('a,b\n1,"' + 'x'.repeat(n))` takes 4 ms at n=20, 65 ms at n=24, 1.0 s at n=28, doubling per character (about an hour at 40). `'cusip,name\n037833100,"APPLE INC 3.85 05/04/43\n'` took 337 ms.
   - Expected: the "never closes" refusal at once. Dropping the inner `+` fixes it.
   - The existing test only uses a 16-character tail.
   - Severity: release blocker. Confidence: confirmed by running.

   - Done in Utilities: a dropped file never freezes the tab, and a workbook from anywhere never throws: a quoted field is found by a scan from quote to quote (`quotedAt`), linear in its length, so a field cut short is refused at once. Timed in `tests/parse-csv.test.ts`: an unclosed quote of 100,000 characters, the review's truncated record, and 30,000 doubled quotes left open are each refused in under 100 ms; a closed field of 100,000 characters still reads.
2. **`packages/ui/src/format/parse.ts:44`** (with `components/amount-input.tsx:59-65`) — a bare number in a rate field is taken as the fraction, and the echo does not reveal it.
   - Input → actual: `parseAmount("5.25", rateSuffixes)` → `5.25`, i.e. 525%, echoed as `= 5.25`. `"5.25%"` → `0.0525`.
   - Expected: refuse a suffix-less rate, or echo it as a percentage.
   - "Rates are fractions" is recorded; this input behaviour is not, so it is a decision to make rather than a code bug.
   - Severity: fix before release. Confidence: parse confirmed by running, echo by reading.

   - Done in AmountInput: a rate needs its unit, and digits too many for a double are refused (`760a598`, step 7.3, inputs.md 3, by decision 3): a rate field refuses a bare number other than zero, naming the units, and AmountInput echoes a rate as a percentage.
3. **`packages/ui/src/utils/workbook-cells.ts:101-123`** — a date-formatted cell has no upper bound on its serial.
   - Input → actual: `numericCellText("20261109", "date", false)` → `"+057373-01-10"`; `"2958466"` → `"+010000-01-01"`; `"250000000"` throws `RangeError: epoch days exceed maximum range`.
   - The throw escapes `readSheet`, because `zipReason` at `read-workbook.ts:92-97` rethrows it, so one such cell rejects the whole sheet.
   - Expected: a per-cell problem past serial 2958465, where Excel shows `#####`.
   - Severity: fix before release. Confidence: confirmed by running.

   - Done in Utilities: a dropped file never freezes the tab, and a workbook from anywhere never throws: a date serial past 31 December 9999, 2,958,465 in the 1900 system and 2,957,003 in the 1904 one, is a problem of its cell ("A date past 31 December 9999, which Excel cannot show"), before Temporal is asked, so `250000000` no longer throws. Anything else a damaged sheet makes the reader meet is a refusal too (finding 5).
4. **`packages/ui/src/utils/workbook-sheet.ts:159-170`** — `place` pads every row out to its last cell, so `maxPartBytes` does not bound memory.
   - Input → actual: 400 rows of `<c r="XFD…"><v>1</v></c>` (17.8 KB XML, 3.5 KB zip) grew the heap by 72.6 MB. That extrapolates to about 3.6 GB from a roughly 70 KB file at 20,000 rows.
   - Expected: a cap on cells or width, or sparse rows. FileImport's row cap applies only after the read.
   - Severity: fix before release. Confidence: confirmed by running; the 3.6 GB figure is extrapolated.

   - Done in Utilities: a dropped file never freezes the tab, and a workbook from anywhere never throws: a sheet's records may hold at most 16,384 fields plus 16 for each cell with something in it; past that the sheet is refused, naming the row and the cell, such as `XFD12`, and saying to delete the empty columns. The review's 400 rows at XFD are refused at the second row; a row of a few cells with a note at column CV still reads. Memory is bounded by what the sheet holds; FileImport's row cap still applies after the read.
5. **`packages/ui/src/utils/read-zip.ts:134`** — `readWorkbook` rejects with a raw exception on damaged archives instead of returning `{ ok: false }`.
   - `zip64Values` reads past the buffer, and `readZip` is called outside the `try` at `read-workbook.ts:202`. 68 of 6,000 random byte-flips of the fixture workbook threw `RangeError: Offset is outside the bounds of the DataView`. Setting one entry's extra-field length to `0xFFFF` does it deterministically.
   - `workbook-parts.ts:47`: a relationship `Target="worksheets/100%.xml"` throws `URIError: URI malformed` from `decodeURIComponent`.
   - Severity: fix before release. Confidence: confirmed by running.

   - Done in Utilities: a dropped file never freezes the tab, and a workbook from anywhere never throws: `zip64Values` reads nothing past the extra fields or the archive's end, whatever their lengths claim; `resolvePart` keeps a target as written when `decodeURIComponent` refuses it, so `worksheets/100%.xml` reads; and `readZip` runs inside `readWorkbook`'s `try`, where anything but a `ZipError` becomes a reason to open the file in Excel and save it again. `tests/read-workbook-hostile.test.ts` flips one to four random bytes of the openpyxl fixture 3,000 times, with a fixed seed, reading every sheet: no throw, and the slowest reading under a second (the whole run takes about 1.5 s). Run against the old readers it fails with the review's `RangeError`.
6. **`packages/ui/src/utils/equal.ts:90-93`** — the cycle memo also remembers pairs that compared unequal, and `#sets` (lines 141-147) keeps comparing after a miss.
   - Input → actual: with `X={v:1}`, `Y={v:2}`, `deepEqual(new Set([{k:X,id:1},{k:X,id:2}]), new Set([{k:Y,id:2},{k:Y,id:1}]))` → `true`. The same data without shared references → `false`.
   - Only Sets of objects with shared sub-objects are affected.
   - Severity: fix before release. Confidence: confirmed by running.

   - Done in Utilities: equality, JSON, shares, 32nds and changes hold at their edges: a pair is assumed equal only while it is compared; when the comparison finds it unequal, every pair assumed since it began is forgotten, and a left object may be remembered against several right ones, as a Set's members are tried against several candidates. The review's Set now compares `false`, and the same data with a match still `true`; the test fails against the old memo.
7. **`packages/ui/src/utils/export.ts:35`** — text that looks like a number is written bare.
   - Input → actual: `"037833100"` → `037833100`, `"912828E72"` → `912828E72`, in both CSV and TSV.
   - Excel should then show 37833100 and 9.12828E+77. DataTable's export and copy go through this.
   - Severity: fix before release (decision). Confidence: writer output confirmed by running; the Excel behaviour is plausible, not run here.

   - Done in Utilities: identifiers sort as read, and a closed trade date and an old stamp count by the calendar, by the brief's smallest change: CSV and TSV stay as RFC 4180 writes them, since other programs read them, and the README says in one sentence that Excel reads `037833100` as a number and that parallax's grid's Excel export keeps it as text (checked: `parallax-export` writes a text column with `write_string`). Not run in Excel.
8. **`packages/ui/src/utils/sort.ts:36`** — `Intl.Collator({ numeric: true })` orders identifiers by their leading digit run. DataTable sorts text columns with it (`components/data-table-columns.ts:121`).
   - Input → actual: `sortBy(["912828XB1","9128282A7","037833100"], [x => x])` → `912828XB1, 9128282A7, 037833100`. Also `"-5"` before `"-10"` and `"1.5"` before `"1.25"`.
   - Expected for CUSIP columns: `037833100, 9128282A7, 912828XB1`.
   - Severity: polish (decision). Confidence: confirmed by running.

   - Done in Utilities: identifiers sort as read, and a closed trade date and an old stamp count by the calendar, by the brief's smallest change: `compareIdentifiers`, code-point order, in `@basis/ui/utils`; DataTable's text column takes `identifier: true` and sorts by it, missing values still last; and `vp run new table` marks a text column whose field names an identifier (`id`, `*_id`, `*Id`, `cusip`, `isin`, `sedol`, `figi`). The default stays as people read it. `SecurityPicker` lists its matches in the order its search gives them and sorts no column, so it has nothing to mark. `components/data-table-columns.ts` and `data-table-state.ts` are the components lane's files; the change is the option and its one use.
9. **`packages/ui/src/numbers/derive.ts:69`** — `Math.max(0, ...exact.map(...))` overflows the stack on large books.
   - Input → actual: `shares` of 120,000 values works; 130,000 throws `RangeError: Maximum call stack size exceeded`.
   - Severity: polish. Confidence: confirmed by running.

   - Done in Utilities: equality, JSON, shares, 32nds and changes hold at their edges: the common scale is found with a loop, not `Math.max(...scales)`; `shares` of 200,000 values sums to 1.
10. **`packages/ui/src/dates/staleness.ts:47` and `:55`** — two staleness slips.
    - `relativeTime` says "yesterday" for anything 24 to 48 hours old: now Friday 10:00 New York, stamp Wednesday 10:01 → `"yesterday"`.
    - `isStale` with `threshold: { weeks: 1 }` or `{ months: 1 }` throws `RangeError: Temporal error: ` with an empty message, though the type allows them.
    - Severity: polish. Confidence: confirmed by running.

- Done in Utilities: identifiers sort as read, and a closed trade date and an old stamp count by the calendar: from a day on, `relativeTime` counts calendar days in `timeZone`, New York by default, so "yesterday" is any time the day before and the review's Wednesday 10:01 seen on Friday is "2 days ago"; under a day it still cuts hours, minutes and seconds. `isStale` adds the threshold to `then` as a zoned time, so weeks and months count on the calendar and no longer throw.

11. **`packages/ui/src/dates/settlement.ts:24-26`** — from a closed trade date, T+0 and T+1 give the same day.
    - Input → actual: `settlementDate(2026-11-14)` (Saturday) → Monday 11-16 for both `days: 0` and `days: 1`. Veterans Day 2026-11-11 → 11-12 for both.
    - Each rule is documented on its own; the collision is not. Rolling the trade date first would give Tuesday for T+1.
    - Severity: polish (decision). Confidence: confirmed by running.

- Done in Utilities: identifiers sort as read, and a closed trade date and an old stamp count by the calendar, as the brief decides: a trade dated on a closed day is moved to the next business day first, then its cycle counted, so the Saturday 2026-11-14 settles T+0 on 11-16 and T+1 on 11-17, and Veterans Day's on 11-12 and 11-13. The doc comment and the README say so.

12. **`packages/ui/src/utils/stringify.ts:53`** — `stableStringify([1, , 3])` → `[1,,3]`, which is not JSON; `JSON.stringify` gives `[1,null,3]`. Boxed primitives also differ: `new Number(1)` → `{}`.
    - Severity: polish. Confidence: confirmed by running.

- Done in Utilities: equality, JSON, shares, 32nds and changes hold at their edges: an array's hole is written `null`, through `Array.from`, and a boxed number, string or boolean as its primitive, each as `JSON.stringify` writes it.

13. **`packages/ui/src/numbers/thirty-seconds.ts:68-75` and `:93`** — two edge cases outside the formatter's own path.
    - Pre-rounding to 8 decimals breaks exact ties at eighths for non-default rounding: `formatThirtySeconds(99.001953125, { rounding: "half-even" })` → `"99-001"`, expected `"99-00"`. The test covers half-even only at halves.
    - `formatThirtySeconds(NaN)` throws `SyntaxError: "NaN" is not a decimal number`. The formatter guards this; direct callers are not guarded.
    - Severity: polish. Confidence: confirmed by running.

- Done in Utilities: equality, JSON, shares, 32nds and changes hold at their edges: under a rounding other than half away from zero, a double price is read at 9 decimals, where half an eighth of a 32nd, 1/512, is exact, so `99.001953125` rounds half-even to `99-00`; under the default it is still read at 8, as parallax's Rust formatter reads it (`parallax-engine/src/format.rs`), so a card and the grid agree. NaN and the infinities are the formatter's dash, `—`, rather than a `SyntaxError`.

14. **`packages/ui/src/utils/xml-scan.ts:109-121`** — `attribute` can match inside another attribute's value.
    - Input → actual: a sheet named `P&L id='s2' x` (relationship `s1`) reads the cells of the sheet at `s2`.
    - Related: `<c t="s"><v></v></c>` reads as shared string 0, because `Number("")` is 0 (`workbook-sheet.ts:122`).
    - Severity: polish. Confidence: confirmed by running.

- Done in Utilities: a dropped file never freezes the tab, and a workbook from anywhere never throws: `attribute` reads a tag's attributes one by one, name, `=` and quoted value, so a name inside another attribute's value is never taken for one, and the sheet `P&L id='s2' x` reads its own part; a shared-string cell whose value is empty or not a whole number is the cell's problem, "The workbook lacks the shared string this cell refers to", not string 0.

15. **`packages/ui/src/format/parse.ts:164-167` and `packages/ui/src/numbers/derive.ts:30-35`** — non-finite results are returned as good values.
    - `parseAmount("9".repeat(400))` → `{ ok: true, value: Infinity }`.
    - `percentChange(NaN, 5)` → `{ defined: true, value: NaN }`, against the module's "says so by name rather than with NaN".
    - Severity: polish. Confidence: confirmed by running.

- Done for `parseAmount` in AmountInput: a rate needs its unit, and digits too many for a double are refused (`760a598`, step 7.3, inputs.md 15). Done for `percentChange` in Utilities: equality, JSON, shares, 32nds and changes hold at their edges: a change from or to NaN or an infinity is `{ defined: false, reason: "not-a-number" }`, never NaN.

## Overall quality

The numeric core is in good shape, and I could not break it:

- **Formatter:** 40,000 random doubles (ties, percent, bps, K/M) matched a Python `Decimal` implementation of the recorded rule with 0 mismatches. No `-0.00` appears, and `99-31+` rolls to `100-00`.
- **`sumPrecise` fallback:** 0 mismatches against a BigInt exact reference over 20,000 lists.
- **`parseAmount`:** 0 mismatches over 100,000 fuzzed inputs, and format → parse round-trips.
- **Identifiers:** CUSIP, ISIN, SEDOL and CUSIP→ISIN are right on known public identifiers.
- **Dates:** Easter matches Meeus for 1583–4099; market status is right across DST and early closes.
- **CSV writer:** real numbers are never mangled. Text starting with `-` or `+` gets the documented apostrophe (`"-5.25"` → `'-5.25`).

The tests are better than usual for generated code:

- Calendars are checked against transcribed published schedules, and the calendars agree with them. SIFMA covers 1996–2027 (873 days, 3 recorded disputes); NYSE covers 2016–2028.
- Sums are checked against Python fractions, and identifiers against TreasuryDirect.
- The formatter's "oracle" is the Rust formatter's own output, so it tests parity, not correctness.
- NYSE's unscheduled closes in `dates-published.test.ts` are taken from `nyse.exceptions`, the code under test.

Holiday data reach: SIFMA is verified through 2027, NYSE through 2028, and TARGET2 is standing rules. Dated exceptions end at 2025-01-09. Later dates silently follow the rules; only `publishedThrough` says so. `createCalendar` is not exported, so a new unscheduled close needs a package release.

The weak spot is hostile or malformed file input (findings 1, 3, 4, 5, 14), which the tests barely touch.

## Not covered

- No `vp` suites, browser or Excel were run; everything ran on Node 26.
- Fixture transcriptions were not checked against the live SIFMA and NYSE pages.
- `downloadBlob` and `rafThrottle` were read but not run.
- Components were only peeked at where they consume this area (AmountInput's echo, FileImport's read path, DataTable's sort and export).

## Changelog

- `parseCsv` refuses a quoted field that never closes at once, however long it runs, where a truncated file froze the
  tab. What to do: nothing.
- `readWorkbook` never rejects: a damaged archive, a part name with a stray `%`, a date past 9999 or a sheet whose few
  cells sit far apart (at column XFD) is `{ ok: false }` with a reason, or a problem of its cell, and a sheet's records
  hold no more fields than its cells bound. A sheet named with what looks like an attribute reads its own cells. What
  to do: nothing.
- `deepEqual` compares Sets of objects that share a sub-object by what each holds, where a pair that once differed
  could be taken as equal. What to do: nothing.
- `stableStringify` writes an array's hole as `null` and a boxed primitive as its value, as `JSON.stringify` does.
  What to do: nothing.
- `shares` reads any number of values; it overflowed the stack past about 120,000. What to do: nothing.
- `formatThirtySeconds` keeps an exact tie at half an eighth a tie under a rounding other than half away from zero, and
  writes NaN and the infinities as `—` rather than throwing. What to do: nothing.
- `percentChange` gains the reason `not-a-number`, for a change from or to NaN or an infinity. What to do: code that
  switches on its reason handles the new one; the compiler names each place.
- DataTable's text column takes `identifier: true`, which sorts it by code point, `037833100` before `912828XB1`, and
  `vp run new table` writes it for an id's or a security code's column; `compareIdentifiers` in `@basis/ui/utils`.
  What to do: add `identifier: true` to a column of CUSIPs, ISINs or ids.
- `settlementDate` from a closed trade date counts its cycle from the next business day, so T+1 from a Saturday is
  Tuesday, not Monday. What to do: nothing, unless a page relied on the old day.
- `relativeTime` says "yesterday" only for the day before on New York's calendar (`timeZone` for another), and
  `isStale` takes a threshold in weeks or months without throwing. What to do: nothing.
