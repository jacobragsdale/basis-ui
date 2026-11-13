# Review: `@basis/ui` input and form components

No release blocker in the strict sense, but 1–3 can each put a value on screen or in a request that the user did not mean, and 4–8 are ordinary-use defects. Throwaway scripts are in `(a scratch folder)`.

## Findings

**1. `packages/ui/src/components/filter-controls.tsx:219` (with `filter-draft.ts:60`, `filter-search.ts:39`)**

- **Defect:** the number-range filter writes an inverted range, the schema reads it back as no filter, and the draft hook then blanks both inputs.
- **Scenario:** Min holds 1,000,000. Type `5` in Max on the way to `5mm` and pause past 300 ms. Both boxes empty, the Par filter is gone, and the address keeps `par={"max":5,"min":1000000}`.
- **Severity:** fix before release; the nearest to a blocker.
- **Confidence:** confirmed by running the real `useFilterDraft` and `readFilterValues` in a happy-dom harness (`range-draft.ts`). The gallery test at `packages/gallery/src/pages/data/filter-bar.test.ts:168` uses `fill()`, so it never types through a prefix.

Done in Filters: an inverted number range is never written, and a date range reads an instant's New York date: `NumberRangeControl` writes a range only while Min is not above Max, so the draft keeps `5` while
`5mm` is typed, and once the range is left inverted Max is marked invalid with "Max is below Min." The gallery's tests
type through the prefix key by key and pause past the 300 ms write.

**2. `packages/ui/src/components/file-import-preview.tsx:72`**

- **Defect:** the preview shows each cell's text, never the value the schema read, so the user confirms blind.
- **Scenario:** `par: amountSchema(parSuffixes)` and `callable: z.coerce.boolean()`, row `5M,FALSE`. The preview shows `5M` and `FALSE` with no problem; the app receives `5000` and `true`. The prop doc at `file-import.tsx:44` names "TRUE or FALSE" beside the `z.coerce` examples.
- **Severity:** fix before release.
- **Confidence:** confirmed by running `checkRecords` (`import-blind.ts`).

**3. `packages/ui/src/format/parse.ts:110` (echo at `amount-input.tsx:58`)**

- **Defect:** a rate field takes a bare number as a fraction, and the echo gives no hint.
- **Scenario:** in a `rateSuffixes` field, `25` commits 25 (2,500%) with echo `= 25`; `4.375` commits 4.375. A field cannot require a suffix or name a default unit.
- **Severity:** fix before release. The code does what it says; this needs the maintainer's decision, and the design records none for bare numbers.
- **Confidence:** confirmed by running `parseAmount` (`rate.ts`).

**4. `packages/ui/src/components/form-security-field.tsx:80`**

- **Defect:** the picker is never given the form's value, so it is uncontrolled and the two drift apart.
- **Scenario:** an edit form holding a CUSIP opens with an empty Bond field. After `form.reset()` the picker still shows the last bond while the field holds `""`.
- **Severity:** fix before release.
- **Confidence:** confirmed by reading. Its test covers only choosing and errors.

**5. `packages/ui/src/components/form-fields.tsx:127,177` and `form-choice-fields.tsx:27`**

- **Defect:** the form fields hold `""` for "none" and are typed `FormFieldApi<string>`, so an optional field has no empty state.
- **Scenario:** an optional date, enum or pattern field left blank fails the generated schema; a plain optional string is sent as `""`. The scaffold writes only required fields, so every optional one is hand-added.
- **Severity:** fix before release.
- **Confidence:** schema half confirmed by running Zod 4.6.7 (`zod-empty.ts`); binding by reading.

**6. `packages/ui/src/components/date-range-picker.tsx:95`**

- **Defect:** a preset's range is committed without checking `min` and `max`, which the grid and the typed entry both enforce.
- **Scenario:** with `min` 2026-10-01 and `max` 2026-11-06, eight of the nine presets commit a range outside the bounds. "Prior year" gives 2025-01-02 to 2025-12-31.
- **Severity:** fix before release.
- **Confidence:** confirmed by running `rangeForPreset` against `whyNotPickable` (`dates.ts`).

**7. `packages/ui/src/components/date-range-entry.tsx:99` and `typed-confirm-dialog.tsx:53`**

- **Defect:** these portaled forms call `preventDefault` but not `stopPropagation`, so their submit reaches an ancestor `<form onSubmit>`.
- **Scenario:** a `DateRangePicker` inside a report form: Apply, or Enter in From/To, also submits the report. A `TypedConfirmDialog` rendered inside an edit form saves the record it is deleting.
- **Severity:** fix before release.
- **Confidence:** React 19 behaviour confirmed by running (`portal-submit.ts`); the two components by reading.

**8. `packages/ui/src/components/filter-rows.ts:35`**

- **Defect:** a date-range filter cuts ISO text to its first ten characters, which is the UTC date of an instant.
- **Scenario:** `2026-11-10T01:30:00Z` shows as 20:30 on 9 November in `DateTime`, fails a 9 November filter and passes a 10 November one.
- **Severity:** fix before release.
- **Confidence:** confirmed by running `filterRows`.

Done in Filters: an inverted number range is never written, and a date range reads an instant's New York date: `filterRows` reads a cell's ISO text through `DateTime`'s own reading (`shownDate` in
`date-time-text.ts`): a date as it is, a wall-clock time's date, and an instant's date in New York. Held by a unit test
of an instant, an offset, a bracketed zone, a wall-clock time and a date.

**9. `packages/ui/src/components/date-field.tsx:113`**

- **Defect:** a refused draft is keyed to `over: null`, so setting the value to `null` from outside cannot clear it.
- **Scenario:** type `13/45/2026` in a `FormDateField`, leave it, then `form.reset()`. The bad text and its error stay.
- **Severity:** fix before release.
- **Confidence:** confirmed by reading.

**10. `packages/ui/src/components/typed-confirm-dialog.tsx:49`**

- **Defect:** an empty `confirmText` matches at once.
- **Scenario:** `packages/showcase/src/pages/book-trade.tsx:212` passes `confirmText={cusip}`; with no bond chosen the action is enabled with nothing typed. A name with a trailing or doubled space cannot be matched at all, because HTML collapses it in the label.
- **Severity:** fix before release (one line).
- **Confidence:** confirmed by reading.

**11. `packages/ui/src/components/month-picker.tsx:140,213,279`**

- **Defect:** arrow keys and the opening focus can land on a disabled month, which keeps `tabindex="0"`, leaving no month in the tab order.
- **Scenario:** `max` is last month and there is no value: the popover opens on the disabled current month and no month can be reached by keyboard. With any `max`, ArrowRight past it then Tab away means Tab cannot return.
- **Severity:** fix before release (keyboard).
- **Confidence:** confirmed by reading, including Base UI 1.9.0's `useFocusableWhenDisabled`.

**12. `packages/ui/src/components/security-picker-multiple.tsx:82`**

- **Defect:** a paste's lookup ends with the `chosen` list captured when the paste began.
- **Scenario:** remove or add a chip while 50 pasted CUSIPs resolve; the removed chip returns and the added one is lost. The lookup also runs up to 200 requests at once outside the query client, and calls `onValueChange` after unmount.
- **Severity:** polish.
- **Confidence:** confirmed by reading.

**13. `packages/ui/src/components/amount-input.tsx:121` and `date-field.tsx:113`**

- **Defect:** the fields report "unreadable" through the value itself (text, or `null`), so a controlled parent that keeps only numbers or dates destroys typing.
- **Scenario:** `onValueChange={(v) => setPar(typeof v === "number" ? v : null)}` makes `-`, `(`, and `1,` vanish as typed, so a negative or grouped number cannot be entered. An as-of page that ignores `null` reverts a holiday date with no reason shown.
- **Severity:** polish, but a public contract that is costly to change later.
- **Confidence:** confirmed by reading.

**14. `packages/ui/src/components/multi-select.tsx:92,142`**

- **Defect:** "all chosen" is judged by count, not membership.
- **Scenario:** a saved view holds `["rates","credit"]` and the options are now rates and munis. The trigger says "All books" and Select all is ticked.
- **Severity:** polish.
- **Confidence:** confirmed by reading.

**15. `packages/ui/src/format/parse.ts:164` and `amount-schema.ts:21`**

- **Defect:** a digit string too long for a double parses as `Infinity`, and the schema passes it although `z.number()` would not.
- **Scenario:** a held key gives 309 or more digits; the request body carries `null`.
- **Severity:** polish.
- **Confidence:** confirmed by running (`amount.ts`).

## Overall

The area is in better shape than a week of agent-written code suggests. The amount parser is strict and exact, typed dates refuse two-digit years and impossible days, and "today" is New York's and is looked at again on open. I looked for the bypasses you named and found none: FileImport cannot send a row that failed, SecurityPicker re-checks before every search, a non-empty TypedConfirmDialog cannot be confirmed by Enter or click, and stale search answers are dropped.

The tests are real browser tests of stated behaviour, including the stale-answer race. They rarely cover state over time: reset and edit forms, controlled parents, key-by-key typing, bounds combined with presets, forms inside forms, and keyboard at a bound. Every finding above sits in one of those gaps.

Not read: the `*-variants.ts` style files, `src/dates`, `src/securities`, `format/format.ts`, `num-text.ts`, and the workbook reader beyond the head of `workbook-cells.ts`. I read the thin Base UI wrappers (Select, Combobox, Checkbox, Switch, Slider, Toggle, RadioGroup, Input, Textarea, NativeSelect, NumberField) but did not exercise them, and read most gallery tests by title only.

## Changelog

- FilterBar's range of numbers never writes a range whose Min is above Max: what was typed stays, so `5` on the way
  to `5mm` no longer blanks both inputs, and once the range is left inverted Max says "Max is below Min." What to do:
  nothing.

- `filterRows` reads an instant's date range by its date in New York, as `DateTime` shows it, not by the UTC date its
  ISO text begins with: `2026-11-10T01:30:00Z` is 9 November. What to do: nothing; a page that filtered timestamps
  by their UTC date now filters by the date it shows.
