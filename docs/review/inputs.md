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

Done in FileImport, DateRangePicker, TypedConfirmDialog: the preview shows what is sent, and a portaled form never submits its parent: under a valid row's cell the preview shows "Sent as …" wherever the schema's value differs from the
cell's text (`5M` par as 5,000, `FALSE` as true); a number written as plain decimal text, and a boolean or text that
reads as itself, is not repeated (`file-import-sent.ts`). The prop's doc names `z.stringbool()` for TRUE or FALSE and
warns off `z.coerce.boolean()`, which reads FALSE as true.

**3. `packages/ui/src/format/parse.ts:110` (echo at `amount-input.tsx:58`)**

- **Defect:** a rate field takes a bare number as a fraction, and the echo gives no hint.
- **Scenario:** in a `rateSuffixes` field, `25` commits 25 (2,500%) with echo `= 25`; `4.375` commits 4.375. A field cannot require a suffix or name a default unit.
- **Severity:** fix before release. The code does what it says; this needs the maintainer's decision, and the design records none for bare numbers.
- **Confidence:** confirmed by running `parseAmount` (`rate.ts`).

Done in AmountInput: a rate needs its unit, and digits too many for a double are refused: by decision 3, a suffix set can need a unit, which `rateSuffixes` does, kept under a symbol so a
spread of the set keeps it and a refusal's list of suffixes never shows it. Such a set refuses a bare number other
than zero, `"25" needs a unit: write 25% or 25bp.`, through `parseAmount`, so `amountSchema` and FileImport refuse it
too; a bare `0` stands, and AmountInput's echo reads as a percentage, `= 0.25%` for `25bp`. Amount and par sets are
unchanged. `docs/design.md`'s "Numbers" and the README's "Taking amounts and dates" say so. Not done: a public helper
that makes a new set need a unit; an app spreads `rateSuffixes` for one, and none has asked for another.

**4. `packages/ui/src/components/form-security-field.tsx:80`**

- **Defect:** the picker is never given the form's value, so it is uncontrolled and the two drift apart.
- **Scenario:** an edit form holding a CUSIP opens with an empty Bond field. After `form.reset()` the picker still shows the last bond while the field holds `""`.
- **Severity:** fix before release.
- **Confidence:** confirmed by reading. Its test covers only choosing and errors.

Done in Forms: an empty field holds what its schema takes, and FormSecurityField shows its form's value: the picker is controlled by the form's value. The field keeps the item last chosen while the
identifier is still its, finds the item for any other identifier through the app's `search`, by TanStack Query, as an
edit form opened on a CUSIP must, and shows none while the field is empty (`form-security-held.ts`). Held by gallery
tests of an edit form, a reset to empty and a reset to the bond the form opened on.

**5. `packages/ui/src/components/form-fields.tsx:127,177` and `form-choice-fields.tsx:27`**

- **Defect:** the form fields hold `""` for "none" and are typed `FormFieldApi<string>`, so an optional field has no empty state.
- **Scenario:** an optional date, enum or pattern field left blank fails the generated schema; a plain optional string is sent as `""`. The scaffold writes only required fields, so every optional one is hand-added.
- **Severity:** fix before release.
- **Confidence:** schema half confirmed by running Zod 4.6.7 (`zod-empty.ts`); binding by reading.

Done in Forms: an empty field holds what its schema takes, and FormSecurityField shows its form's value: a field says what it holds while empty as its schema does. `optional` holds `undefined`, so the
form submits no such key, and `nullable` holds `null`, on FormTextField, FormDateField, FormSelectField and
FormSecurityField; FormAmountField takes `optional`, its `null` already serving `.nullable()`. A required field holds
`""` as before. The field's value type asks for the prop: a field that may hold `undefined` does not compile without
`optional`, nor one that may hold `null` without `nullable`. An optional or nullable select keeps its placeholder in
the list, so a choice can be taken back. The fields' props types are now generic, `FormTextFieldProps<TValue>`, with
the old types as their defaults. Held by a gallery test of a TanStack form submitted empty and emptied by the user,
whose result passes its schema, and a type test. The README's "Building a form" says how a field declares itself.

**6. `packages/ui/src/components/date-range-picker.tsx:95`**

- **Defect:** a preset's range is committed without checking `min` and `max`, which the grid and the typed entry both enforce.
- **Scenario:** with `min` 2026-10-01 and `max` 2026-11-06, eight of the nine presets commit a range outside the bounds. "Prior year" gives 2025-01-02 to 2025-12-31.
- **Severity:** fix before release.
- **Confidence:** confirmed by running `rangeForPreset` against `whyNotPickable` (`dates.ts`).

Done in DateRangePicker, MultiSelect: a preset stays inside the field's dates, and All means every option chosen: the presets count to the as-of date, or to the last business day on or before `max` when that is
earlier, so "Month to date" ends at the latest date the field takes; a preset whose range still has an end outside
`min` and `max` is shown disabled. A preset is never cut to fit, which would give a range other than its name. Held by
a gallery test with the finding's bounds: Month to date, Quarter to date, Prior month and Past month are offered, and
Month to date gives 2026-11-02 to 2026-11-06.

**7. `packages/ui/src/components/date-range-entry.tsx:99` and `typed-confirm-dialog.tsx:53`**

- **Defect:** these portaled forms call `preventDefault` but not `stopPropagation`, so their submit reaches an ancestor `<form onSubmit>`.
- **Scenario:** a `DateRangePicker` inside a report form: Apply, or Enter in From/To, also submits the report. A `TypedConfirmDialog` rendered inside an edit form saves the record it is deleting.
- **Severity:** fix before release.
- **Confidence:** React 19 behaviour confirmed by running (`portal-submit.ts`); the two components by reading.

Done in FileImport, DateRangePicker, TypedConfirmDialog: the preview shows what is sent, and a portaled form never submits its parent: both forms stop their submit's propagation. Held by gallery tests of each inside a `<form>`; the
range entry's Enter had reached the parent twice. `saved-views-dialogs.tsx` has the same pattern, and is step 7.4's.

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

Done in AmountInput, date fields: what was typed survives a parent that keeps only numbers or dates, and a reset clears a refused date: a reset that leaves the value as it was, `""` to `""`, cannot reach a controlled field through its
value, so FormDateField keys its picker by the field's resets, which TanStack Form shows as the field no longer
touched (`useResets` in `form-field-parts.ts`). A refused draft is no longer keyed to `over: null`: it stays while the
value is `null`, or, until the value has once been `null`, the one it was typed over (`date-typed.ts`). DateField's
`onValueChange` doc says to give the field a new `key` to clear a refused text where the value stays the same. Held by
a gallery test of a form reset after `13/45/2026`.

**10. `packages/ui/src/components/typed-confirm-dialog.tsx:49`**

- **Defect:** an empty `confirmText` matches at once.
- **Scenario:** `packages/showcase/src/pages/book-trade.tsx:212` passes `confirmText={cusip}`; with no bond chosen the action is enabled with nothing typed. A name with a trailing or doubled space cannot be matched at all, because HTML collapses it in the label.
- **Severity:** fix before release (one line).
- **Confidence:** confirmed by reading.

Done in FileImport, DateRangePicker, TypedConfirmDialog: the preview shows what is sent, and a portaled form never submits its parent: the typed text and `confirmText` are compared with their runs of white space read as one and their
ends trimmed, as the label shows them, and an empty `confirmText` never matches, so the action stays off.

**11. `packages/ui/src/components/month-picker.tsx:140,213,279`**

- **Defect:** arrow keys and the opening focus can land on a disabled month, which keeps `tabindex="0"`, leaving no month in the tab order.
- **Scenario:** `max` is last month and there is no value: the popover opens on the disabled current month and no month can be reached by keyboard. With any `max`, ArrowRight past it then Tab away means Tab cannot return.
- **Severity:** fix before release (keyboard).
- **Confidence:** confirmed by reading, including Base UI 1.9.0's `useFocusableWhenDisabled`.

Done in MonthPicker, SecurityPicker: the keyboard stops at a bound, and a paste ends on the chips as they are: the month focused is always one the field takes. The grid opens on the month, or this one, held
within `min` and `max`; the arrow keys stop at a bound; and the year buttons are disabled where the year holds no
month the field takes, and otherwise land on a month within it (`month-picker-months.ts`). Held by gallery tests of
an empty field whose latest month is last month, the arrows at the earliest month with Tab away and back, and a year
that cannot be stepped to.

**12. `packages/ui/src/components/security-picker-multiple.tsx:82`**

- **Defect:** a paste's lookup ends with the `chosen` list captured when the paste began.
- **Scenario:** remove or add a chip while 50 pasted CUSIPs resolve; the removed chip returns and the added one is lost. The lookup also runs up to 200 requests at once outside the query client, and calls `onValueChange` after unmount.
- **Severity:** polish.
- **Confidence:** confirmed by reading.

Done in MonthPicker, SecurityPicker: the keyboard stops at a bound, and a paste ends on the chips as they are: the lookup ends on the chips as they are when it ends, not as they were when it began; it is
aborted, changing nothing, when the picker unmounts; its searches go through the query client, under a key of the
picker's own, so they retry and report a sign-in problem as the picker's own searches do; and at most six run at once.
Held by a gallery test that removes a chip while a paste resolves, and a unit test of the limit.

**13. `packages/ui/src/components/amount-input.tsx:121` and `date-field.tsx:113`**

- **Defect:** the fields report "unreadable" through the value itself (text, or `null`), so a controlled parent that keeps only numbers or dates destroys typing.
- **Scenario:** `onValueChange={(v) => setPar(typeof v === "number" ? v : null)}` makes `-`, `(`, and `1,` vanish as typed, so a negative or grouped number cannot be entered. An as-of page that ignores `null` reverts a holiday date with no reason shown.
- **Severity:** polish, but a public contract that is costly to change later.
- **Confidence:** confirmed by reading.

Done in AmountInput, date fields: what was typed survives a parent that keeps only numbers or dates, and a reset clears a refused date: the value's type is unchanged, and no second callback is needed. What was typed now stays while
the value is what it reads as, and text that reads as no number, or a refused date, also while the value is `null` or
the one it was typed over, until the value has once taken it. So a parent that maps text to `null`, or ignores it,
keeps `-1,234` and `(1,000)` key by key, and a refused date with its reason, and a value set otherwise replaces them.
The props' docs and the README's "Taking amounts and dates" give the pattern. Held by gallery tests of both kinds of
parent typing key by key, a parent that ignores a refused date and then sets another, and a form reset of an amount.

**14. `packages/ui/src/components/multi-select.tsx:92,142`**

- **Defect:** "all chosen" is judged by count, not membership.
- **Scenario:** a saved view holds `["rates","credit"]` and the options are now rates and munis. The trigger says "All books" and Select all is ticked.
- **Severity:** polish.
- **Confidence:** confirmed by reading.

Done in DateRangePicker, MultiSelect: a preset stays inside the field's dates, and All means every option chosen: "all chosen" and the count are judged by the options chosen, so a value no option has is not
counted, in the trigger's text, Select all's tick, and what Select all does next. Held by a gallery test of a saved
value the options no longer offer.

**15. `packages/ui/src/format/parse.ts:164` and `amount-schema.ts:21`**

- **Defect:** a digit string too long for a double parses as `Infinity`, and the schema passes it although `z.number()` would not.
- **Scenario:** a held key gives 309 or more digits; the request body carries `null`.
- **Severity:** polish.
- **Confidence:** confirmed by running (`amount.ts`).

Done in AmountInput: a rate needs its unit, and digits too many for a double are refused: `parseAmount` refuses text whose number is not finite as a double, `"…" is too large for a number.`,
so the input holds the text, shows no echo, and `amountSchema` gives the reason. A tiny fraction still reads as 0.

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

- A field of `rateSuffixes` refuses a bare number: `25` is `"25" needs a unit: write 25% or 25bp.` rather than the
  fraction 25, or 2,500%; a bare `0` stands, and the echo under the field reads as a percentage, `= 0.25%` for `25bp`.
  `amountSchema(rateSuffixes)` and a FileImport column of it refuse the same text. A spread of `rateSuffixes` keeps
  the rule; amounts and par are unchanged. What to do: tell users of a rate field to type its unit, and give a rate
  column of an import file its `%` or `bp`; a default value set as a number is unaffected.

- `parseAmount`, AmountInput and `amountSchema` refuse digits too many for a double, which read as `Infinity` and were
  sent as `null`. What to do: nothing.

- FileImport's preview shows "Sent as …" under a cell whose value the schema reads as something its text does not
  say, such as `5M` par as 5,000 or `FALSE` as true, so the user confirms what the app receives. Its `schema` prop's
  doc names `z.stringbool()` for a TRUE or FALSE column: `z.coerce.boolean()` reads any text, FALSE included, as
  true. What to do: replace `z.coerce.boolean()` in an import schema with `z.stringbool()`.

- DateRangePicker's typed range and TypedConfirmDialog no longer submit a `<form>` they are rendered in: their own
  submit stops there. What to do: nothing.

- TypedConfirmDialog never confirms an empty `confirmText`, and matches a name with doubled or trailing spaces as its
  label shows it. What to do: nothing.

- The form fields take `optional` and `nullable`, as the schema says: an optional text, date, choice or security
  field holds `undefined` while empty, so the form submits no such key, and a nullable one `null`; `FormAmountField`
  takes `optional`. A field whose value type may be `undefined` or `null` must say which, or it does not compile.
  `FormSelectFieldProps` and the other fields' props types take the value type, `FormTextFieldProps<string | undefined>`.
  What to do: for each optional or nullable property of a form's schema, start the field's default value at
  `undefined` or `null` and pass `optional` or `nullable`; a field that held `""` for none of an optional property
  failed the schema or sent `""`.

- `FormSecurityField` shows the form's value: an edit form opened on an identifier finds its security through
  `search`, and `form.reset()` empties the picker with the field. What to do: nothing.

- `AmountInput` keeps what was typed while a parent that keeps only numbers maps text to `null` or ignores it, so `-`,
  `(` and `1,` no longer vanish on the way to a number; a date field keeps a refused date and its reason while its
  parent ignores `null`. A value the parent sets otherwise replaces them. What to do: nothing; a page that kept an
  AmountInput uncontrolled to avoid this may hold its number.

- `FormDateField` clears a date it refused, and its reason, on `form.reset()`. What to do: nothing.

- DateRangePicker's presets never commit a range outside `min` and `max`: they count to the last business day on or
  before `max`, and a preset still outside the field's dates is disabled. What to do: nothing.

- MultiSelect says "All" and ticks Select all only when every option is chosen, not when as many values are held, so
  a saved value an option no longer has is not counted. What to do: nothing.

- MonthPicker's keyboard never leaves the months it takes: it opens on the month, or this one, within `min` and
  `max`, the arrows stop at a bound, and a year with no month it takes cannot be stepped to. What to do: nothing.

- A list pasted into a SecurityPicker of several keeps a chip removed or added while it is looked up, stops when the
  picker goes, runs at most six searches at once, and searches through the app's query client. What to do: nothing.
