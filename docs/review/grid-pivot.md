I found no stale-frame or wrong-cell drawing bug, but two release blockers: one where the rows shown as checked and the keys the app holds disagree, and one where a click selects the neighbouring row. Everything below was checked by reading plus Node scripts on the pure modules with fake frames and a fake 2D context; nothing was run in a browser, and no `vp`, tests or cargo were run.

## Findings, most severe first

**1. Header "check all" and the app's keys diverge after a filter change.** `src/grid/row-checks.ts:122-132`, `:54-58`, `:154-158`

- Defect: in a flat view the header checkbox stores "every row" and fetches keys for `onSelectionChange` once; a later layout change keeps "every row" but never re-emits.
- Scenario: the README's own example (`selectable rowKey onSelectionChange`). Check the header on 5,000 rows, then filter to 100: the grid shows 100 checked and "100 selected" while the app still holds 5,000 keys, so a bulk action hits 5,000 trades. The reverse also happens. Above 1,000,000 rows the choice is committed and drawn but the callback never fires at all.
- Severity: release blocker for any app that acts on checked rows.
- Confidence: confirmed by running `RowChecks` against fake frames (filter removed: app holds 2 keys, status bar says 5 selected, 5 rows drawn checked).
- Done in Grid: a choice of every row follows its rows to the app, and a click hits the row drawn under it: whenever a frame shows the view's rows changed (a layout the engine took, another load, or more
  rows), a choice of every row is heard again: `onRowsChange` with `view`, the layout's `filters` and `search` and the
  rows it shows, and `onSelectionChange` with the keys fetched again. Past the 1,000,000 keys a fetch takes, an app
  that takes keys is refused the header's check, and a later change past them clears the choice, both said in the
  status bar, so it never holds keys the grid does not show checked; an app that takes only `onRowsChange` gets every
  row of the view. The README's bulk action is the pattern, and `tests/browser/grid-choices.test.tsx` holds a filter,
  a reload and the limit.

**2. The painter and hit-testing use different heights for the scaled scroll mapping.** `src/grid/paint/painter.ts:165` vs `src/grid/hit.ts:65`, `src/grid/model.ts:230`

- Defect: the painter maps scroll to first row with the canvas's CSS height (floored to whole device pixels); hit-testing, keys, wheel and row requests use `clientHeight`.
- Scenario: above about 535,000 rows at 125% or 150% scaling, when height × ratio is not whole (3 of 4 heights at 125%). After a scrollbar drag the drawn first row can be one less than the hit-tested one, so a click, double-click, hover or "Filter by" lands on the row below the one under the pointer.
- Measured: about 0.7–2% of drag positions at 1,000,000 rows and 6–20% at 10,000,000. At the very bottom the outcome depends on how Chrome snaps the maximum offset; I computed three possibilities, one of which is clean, one gives the mismatch and one cuts off the last row.
- Severity: release blocker; the fix is to pass one height to both.
- Confidence: confirmed by running `rowGeometry` with the two heights and reading both call sites. The unit tests use one viewport for both.
- Done in Grid: a choice of every row follows its rows to the app, and a click hits the row drawn under it: the painter maps the scroll to its first row with the visible area's height, the one hit testing,
  the keys and the rows asked for take, not the canvas's height floored to device pixels.
  `tests/browser/scaled-rows.test.tsx` runs at 1, 1.25 and 1.5 over 1,200,000 rows in a box a fraction of a device
  pixel tall, and compares the row drawn at a y with the row a click there reports at 25 positions down the
  scrollbar, the end among them, where the last row shows whole; it failed at the end at both ratios before the
  fix.

**3. `selectable="single"` re-chooses by view index and can emit another column's value as the key.** `src/grid/row-checks.ts:135-144`, `src/grid/row-selection.ts:62-72`

- Defect: the focus stays at its view row, so after a sort, filter or reload the row now at that index becomes the chosen one. The key column's index comes from the new layout while the frame is still the old one.
- Scenario: the user selects T2 and sorts by quantity; `onSelectionChange(["T1"])` fires and the detail pane switches trade. Pinning `ticker` emits `["MSFT"]` as a key before correcting itself.
- Severity: fix before release. It contradicts the README's "a choice stays with its rows".
- Confidence: confirmed by running (sequence heard: `T2`, `MSFT`, `T2`, `T1`).

**4. Context-menu "Filter by / Exclude" builds its operand from the displayed text.** `src/grid/actions.ts:22-30`, `src/grid/events.ts:64`

- Defect: timestamps, decimals and large integers are sent as display text, although `pathValue` already produces the exact form.
- Scenario: right-click a zoned trade-time cell and choose Filter by. The engine refuses with "needs an offset" (`crates/parallax-protocol/src/layout.rs:1521-1528`). An unzoned time shown to the second matches only rows with zero sub-seconds, so the clicked row itself disappears. A decimal shown with thousands separators is refused.
- Severity: fix before release.
- Confidence: confirmed by reading the TypeScript and the Rust. The only test filters a text cell.

**5. Clipboard TSV does not neutralise formulas.** `src/grid/selection.ts:86-93`

- Defect: the CSV export and `@basis/ui`'s writers prefix formula-like text; the grid's copy does not.
- Scenario: a comment or name cell `=HYPERLINK(...)` pastes into Excel as a live formula.
- Related, from Excel's known behaviour and not tested here: only `text/plain` is written, so all-digit text ids such as CUSIP `037833100`, digits-E-digits ids, and integers past 15 digits are coerced on paste.
- Severity: fix before release.
- Confidence: formula part confirmed by running `toTsv` and `rangeText`.

**6. A cell tooltip is not cleared or re-read on scroll.** `src/grid/tooltips.ts:22-35`, `src/grid/surface.ts:86-90`

- Defect: the scroll handler updates the hover row only; the tooltip keeps the text captured when the pointer last moved.
- Scenario: rest on a `###` cell, the tooltip shows its number, then wheel three rows. The tooltip stays beside a different row's `###` showing the old number, and it is the only way to read a cut number.
- Severity: fix before release.
- Confidence: confirmed by reading.

**7. A grid whose opening layout the engine refuses never recovers, and the app is not told.** `src/react/use-view.ts:68-80`, `crates/parallax-session/src/lib.rs:972-975`, `src/grid/grid.tsx:211-213`

- Defect: the view is not registered on a refused open, the open effect does not depend on the layout, and `Grid` has no `onError`.
- Scenario: a saved or URL layout names a column the API renamed. The grid shows the reason over a skeleton; removing the chip or passing a corrected layout sends updates to a view that does not exist, so it stays dead until remount. A sort or pin on the missing column has no control to remove it at all.
- Severity: fix before release. The fix sits in the React layer another reviewer owns.
- Confidence: confirmed by reading both sides; not run.
- Done in Parallax: a refused view opens once its layout is corrected, and tells the app (step 7.9): a corrected layout opens the refused view anew, and `Grid`, `Pivot` and `Chart` take
  `onError`, called with the reason they show and with null once it clears. A sort or pin on a missing column still
  has no control to remove it in the grid: that is the grid's, for 7.10.

**8. Condition filters take engine literals, not what the column shows.** `src/grid/labels.ts:71-101`, `src/grid/column-filter.tsx:136-145`

- Scenario: a yield shown as 5.25% filtered "At least 5" silently returns no rows, because it needs 0.05. "1,000", "5.25%" and a time without an offset are refused by the engine.
- Also: the value box applies on blur, so switching a filtered column to "Contains", clicking the empty box and leaving clears the existing filter; Escape after typing applies rather than cancels.
- Severity: fix before release for the percent case, polish for the rest.
- Confidence: confirmed by reading.

**9. Row events expose view indexes, and `key` is null unless `selectable` is set.** `src/grid/events.ts:11-29,59-72`, `src/grid/actions.ts:43-49`

- Scenario: `onRowActivate` gives `{ row, key: null }` on an ordinary grid and there is no `getRow`. An agent-written `rows[row]` opens the wrong record after any sort. `getSelection()` and `scrollTo(row)` have the same shape.
- Severity: fix before release; this is cheap now and painful later. Let `rowKey` work without `selectable`.
- Confidence: confirmed by reading; the app skill lists these events with no caution.

**10. Blank rows after a late frame.** `src/grid/paint/rows.ts:110-116`, `src/grid/paint/cells.ts:45-51`

- Defect: `clearRow` repaints the row's background but keeps its cells' remembered text.
- Scenario: scroll away far enough to send a request, then back to a spot the old frame only partly covers before the reply lands. This is plausible when another view keeps the single worker busy. The rows are cleared, then skipped as "unchanged" when their frame arrives, and stay blank until hover or the next scroll.
- Severity: polish, with a one-line fix.
- Confidence: confirmed by running `drawRows` with a fake context; the race itself by reading.

**11. Menu "Copy", "Copy with headers" and `ref.copy()` fail silently.** `src/grid/actions.ts:90-103`

- Scenario: on plain http `navigator.clipboard` is undefined, a case the Ctrl+C path handles explicitly. A selection over 1,000,000 cells is refused by the engine. Either error goes to `reportError` with no status-bar note.
- Severity: polish.
- Confidence: confirmed by reading.

**12. The cell selection is never clamped or cleared when the view changes.** `src/grid/copy.ts:35-42,158-161`

- Scenario: select including the group column and then ungroup, or select row 500,000 and then filter to 10 rows. Ctrl+C says "the rows changed while copying; copy again" every time, and the screen reader's cell reads "Loading…".
- Severity: polish.
- Confidence: confirmed by reading.

**13. Keyboard edges.** `src/grid/keys.ts:18-33,53,66-79`

- With no selection, Enter fires `onRowActivate` for row 0 and the first Down arrow lands on row 1.
- Alt+Left and Alt+Right are swallowed as cell moves.
- No key reaches the header checkbox.
- `onCellClick`, and so a link cell, is pointer-only.
- Severity: polish.
- Confidence: confirmed by reading.

**14. Tests that do not test what they claim.**

- `tests/unit/grid-window.test.ts:29-43`: all three `frameToShow` cases pass `wanted = null`, so the late-frame rule has no unit test (two browser tests cover one path).
- `tests/unit/grid-geometry.test.ts:101-128`: "as a browser rounds the offset" uses one viewport for both sides and misses finding 2.
- `tests/unit/grid-edit.test.ts:119`: the name says "sums of its numbers" but the body asserts counts.
- No test crosses selection with a layout change (findings 1 and 3), and "Filter by" is tested on text only.

**15. Smaller items, all polish, by reading.**

- The status message is the only error channel and is cut with no `title` (`src/grid/status-bar.tsx:226`).
- A pivot's drilled rows stay open after its search changes (`src/pivot/drill.ts:55-63`).
- The value list's `source` is a new closure each render, so every tick re-queries the engine; this amplifies the known slow-list item (`src/grid/grid-menu.tsx:62`, `src/pivot/pivot.tsx:158`).
- "Fit this column" fits the selection's focus column, not the one clicked (`src/grid/cell-menu.tsx:256`).
- Hiding the last column shows every column (`src/grid/edit.ts:54-57`).
- `pointermove` never checks `buttons`, and the edge-scroll interval is not stopped on unmount, so a lost pointerup leaves a drag running (plausible on Citrix).
- `height="auto"` with a very large `maxHeight` is not capped at canvas limits.

## Overall quality

The canvas layer is in better shape than a week-old port has a right to be. Frame and sequence handling is sound, old layouts are dropped and every layout change forces a full redraw. Scroll-copy, device-pixel handling, font loading, theme changes, cache bounds and listener cleanup are all careful. Link cells never open a URL, copies over 1,000,000 cells are refused with a message, and pivot columns are capped at 10,000.

The defects sit at seams rather than in the drawing: row identity against view index, displayed text against engine literals, and two measurements of one height. Tests are strong on pure helpers and paint counters but thin where features interact. No test combines selection with a layout change or large row counts with fractional scaling, and nothing covers a refused opening layout.

## Accessibility as it stands

**Keyboard.** The grid is one tab stop and Tab leaves it. Arrows, Page, Home and End with Ctrl and Shift, Ctrl+A, Ctrl+C, Ctrl+F, Enter or Space on groups, Space to check a row, and Alt+Down for the column menu all work. The toolbar, column chooser and pivot settings are real controls with keyboard alternatives to dragging. The gaps:

- no incremental resize, only Fit width;
- no keyboard route to the header checkbox or to `onCellClick`;
- Shift+F10 probably opens the menu for the cell at the grid's centre rather than the focused one, since Chrome places keyboard context menus at the element's centre.

**Screen reader.** A reader gets a `grid` with a name, a description and row and column counts. The focused cell is the active descendant, read as "Title: text". There are live notes for selection size, rows chosen and status messages, and the totals row as text. That is all: only one cell exists in the DOM. There is no browse-mode table, no column headers or sort and filter state, and no group level or expanded state. A cell reached by a jump reads "Loading…" and is not re-announced when its rows arrive. It is workable for a sighted keyboard user, and no more than a spot-check tool for a blind one.

## Not read

- `src/grid/paint/icons.ts`
- `src/pivot/field-list.tsx`, `drag-list.tsx`, `setting.tsx`, and the last lines of `group-menu.tsx`
- `#tools/grid-stats.ts` and `src/react/maximize-parts.tsx`
- e2e and browser test bodies beyond their titles and the few read above

Everything else in `src/grid` and `src/pivot` was read in full. The scripts are in `(a scratch folder)`: `rows.ts`, `end.ts`, `single.ts`, `all.ts`, `tsv.ts` and `blank.ts`.

## Changelog

- A choice of every row, from the header's checkbox, is handed to the app again whenever a filter, a search or a
  reload changes the rows it covers: `onRowsChange` gets `{ all: true, keys, view }`, `view` being the layout's
  `filters` and `search` and how many `rows` the view shows, and `onSelectionChange` the keys again. Past 1,000,000
  rows an app that takes `onSelectionChange` is refused a check of every row, saying so. What to do: a bulk action on
  every row sends `view`'s filters and search with `keys` as the rows left out, as the README shows; `ChosenView` is
  its type.

- At 125 % and 150 % scaling, past about 535,000 rows, a click, a hover or a menu lands on the row drawn under the
  pointer, where it could take the row below. What to do: nothing.
