## Review: `@basis/ui` data, display, overlay and navigation components

Two findings are release blockers and eight more should be fixed before release; most are confirmed by running. Checks ran the real source, or the built `dist` components under happy-dom, with throwaway scripts in `(a scratch folder)`. No `vp`, test suite or browser was run.

### Findings, most severe first

**1. DataTable sorts and filters by stale values when `columns` change but `data` does not**

- **Where:** `packages/ui/src/components/data-table-state.ts:77`, `:82`, `:186`
- **Defect:** TanStack caches each row's accessor value until the `data` array changes, and its sorted and filtered models do not depend on the columns.
- **Scenario:** a Spread column is `|row.yield - benchmark|`, sorted ascending. The user changes the benchmark; cells show 50, 20, 10 bp under "Spread ascending", and pressing the heading shows 10, 20, 50 under "descending". The same happens with `defaultSorting` on a column whose names come from a second query (heading says ascending, rows stay in data order, pressing it does nothing) and with a text filter typed before a lookup loads ("No rows match" stays).
- **Severity:** release blocker.
- **Confidence:** confirmed by running the built `DataTable` (`table.mjs`, `table-filter.mjs`) and table-core directly (`stale-sort.mjs`).

Done in DataTable, shortcuts: rows sort by the columns as they are now, and a shortcut's keys follow one stated grammar: DataTable gives TanStack a copy of its rows for each new set of columns (`useRowsFor` in
`data-table-state.ts`), so the cached values, sorted rows and filtered rows are read again; a copy held in state, since
the React Compiler drops a memo dependency the body does not read. Held by gallery tests that rerender with a new
benchmark under a sort, and with names that arrive after a filter is typed (`data-table-over-time.test.tsx`).

**2. `useShortcut` binds the bare key when the modifier is anything but `mod`, `alt` or `shift`**

- **Where:** `packages/ui/src/components/shortcuts-context.ts:88-99`, `:146`
- **Defect:** unknown modifier names (`ctrl`, `cmd`, `meta`, `control`, `option`) are silently ignored, so the shortcut matches the key with no modifier and never the intended combination.
- **Scenario:** `useShortcut("ctrl+d", "Delete the selected trades", remove)` runs on a bare `d` anywhere outside a field and never on Ctrl+D. `control+enter` runs on a bare Enter and prevents the focused button's own click. The `?` overlay shows "CTRL D", so it looks right. No lint rule or runtime check catches it.
- **Severity:** release blocker (a few-line fix).
- **Confidence:** confirmed by running `matchesKeys` (`keys.mjs`, `keys2.mjs`).

Done in DataTable, shortcuts: rows sort by the columns as they are now, and a shortcut's keys follow one stated grammar: `shortcut-keys.ts` parses a combination once, by the grammar its head and the README's "Keys"
state. `mod` and `ctrl` (the same key, by decision 5), `alt` and `shift` are the modifiers. Any other modifier, or a
key with no name, is refused: thrown in development, as `ERROR the shortcut "cmd+d" names "cmd", which is no modifier:
…` with its fix, and logged as that line in production, where the shortcut is left out rather than bound to the bare
key (`development.ts` reads Vite's `import.meta.env.DEV`). Held by unit tests of the grammar and gallery tests of
`ctrl+d` and `cmd+d`.

**3. A DataTable state prop that returns to `undefined` falls back to a stale internal copy**

- **Where:** `packages/ui/src/components/data-table-control.ts:50-63`, and `:109`, `:133` for selection
- **Defect:** the internal copy is updated only while the prop is `undefined`, so it holds the first change the app took, not the latest.
- **Scenario:** the app keeps `page` in the URL and drops the default (`page || undefined`). Next, Next, Previous, Previous leaves the app at `{}` and the table on page 2. With `q || undefined`, clearing the filter box snaps it back to the first text typed. Applying a saved view that has no `filter` key leaves the table filtered while SavedViews shows the view as unchanged.
- **Severity:** fix before release.
- **Confidence:** confirmed by running the real hook (`controllable.mjs`).

**4. `browserViewStore` permanently deletes every view the current `parse` rejects on its next write**

- **Where:** `packages/ui/src/components/saved-views-store.ts:92-131`
- **Defect:** `put`, `remove` and `setDefault` write back the list as read through `parse`, so views it dropped are erased from storage, along with the default.
- **Scenario:** a release tightens a view schema, a deploy is rolled back, a days-old tab still runs the old bundle, or two parts share a key. One "Save as a new view" in that state erases the user's other views for good.
- **Severity:** fix before release.
- **Confidence:** confirmed by running the real store (`views.mjs`).

**5. SavedViews names the store's current default as the active view, whatever was applied**

- **Where:** `packages/ui/src/components/use-saved-views.ts:99-107`
- **Defect:** until the user picks a view, the active view is derived from the live `defaultId`.
- **Scenario A:** the default "By fund" is applied; "Stop opening By fund by default" makes the trigger read "Views" and removes its save, rename and delete items, though the page still shows it.
- **Scenario B:** a tab loaded with no default; another tab makes "Risk" the default; on the next refetch (window focus) this tab reads "Risk (changed)" without applying it, and "Save changes to Risk" overwrote Risk with this tab's unrelated state.
- **Severity:** fix before release.
- **Confidence:** confirmed by running the real hook (`savedviews.mjs`).

**6. Toasts sit under any open modal's veil and viewport**

- **Where:** `packages/ui/src/components/toast.tsx:66` against `dialog.tsx:78`, `:100` (the same in alert-dialog, sheet, drawer, command-dialog)
- **Defect:** everything is `z-popup` (50), and the toast portal is appended to `<body>` when `BasisApp` mounts, before any dialog's portal, so it paints beneath.
- **Scenario:** a form in a Dialog fails to save and `BasisApp` raises the error toast. It shows washed out under the 70% veil, and a click on it lands on the dialog's viewport, which closes the Dialog. The session-expired toast's "Sign in" is likewise unreachable.
- **Severity:** fix before release.
- **Confidence:** plausible; read from the classes and Base UI 1.9.0's portal code, not run in a browser. No test raises a toast with a modal open.

**7. `onSelectionChange` reports rows the filters hide, while the toolbar counts only visible ones**

- **Where:** `packages/ui/src/components/data-table-control.ts:136`, `data-table-table.tsx:40`
- **Defect:** the app is told of every selected row in `data` and is not told again when a filter narrows them.
- **Scenario:** select all five orders, then filter to "Rates". The toolbar says "2 of 2 selected" and Copy copies two, but the app's "Cancel selected" still holds five ids.
- **Severity:** fix before release (an API that is hard to change later).
- **Confidence:** confirmed by running the built `DataTable` (`selection.mjs`).

**8. Sidebar and palette route derivation breaks on anything but a flat route tree**

- **Where:** `packages/ui/src/components/route-entries.ts:65-83`
- **Defect:** an index route under a parent has `fullPath` `"/positions/"`, which `currentEntry` never matches, and a titled root or pathless layout route becomes its own entry linking to `/`.
- **Scenario:** with `positions/index` titled "Positions", no sidebar item is marked on `/positions` or `/positions/abc`. Titling a layout route "Books" for its breadcrumb adds a "Books" item to the sidebar and Ctrl+K that goes to `/`.
- **Severity:** fix before release.
- **Confidence:** confirmed by running against the installed TanStack Router (`routes.mjs`). The gallery's route tests use only flat routes.

**9. `data: undefined` without `loading` or `error` says "No rows to show."**

- **Where:** `packages/ui/src/components/data-table-table.tsx:68-74`, `:149`
- **Defect:** undefined data is treated as empty, and both props that would say otherwise are optional.
- **Scenario:** `<DataTable data={q.data?.data} … />` tells a trader there are no positions while the query loads, and permanently after a 500.
- **Severity:** fix before release (treat undefined as loading, or take the query).
- **Confidence:** confirmed by running (`selection.mjs`).

**10. A date-range filter on a timestamp uses the UTC date in the text (FilterBar's, reached through `filterBy`)**

- **Where:** `packages/ui/src/components/filter-rows.ts:35-40`
- **Defect:** `dateOf` takes the first ten characters of the ISO text, while `DateTime` shows the New York date.
- **Scenario:** a trade at `2026-11-07T02:00:00Z` displays as `2026-11-06 21:00:00`, but a filter for 6 Nov drops it.
- **Severity:** fix before release.
- **Confidence:** confirmed by running (`views.mjs`). This file may belong to the forms reviewer.

Done in Filters: an inverted number range is never written, and a date range reads an instant's New York date (step 7.3, as `inputs.md` finding 8): `dateOf` takes the date `DateTime` shows, New York's for an
instant.

**11. Shortcut listener gaps**

- **Where:** `packages/ui/src/components/shortcuts.tsx:56-66`, `shortcuts-context.ts:88-99`
- **Defect:** several smaller holes in one listener:
  - No `event.repeat` guard, so holding a shortcut such as `mod+enter` runs its action about 30 times a second.
  - `"Mod+S"` counts as a plain key because the test is case-sensitive (line 60), so it does not fire in a field and the browser's save dialog opens.
  - `shift+1`, `+`, `shift+/`, `esc` and `space` never match.
  - Modifier shortcuts fire behind open modal dialogs.
  - `defaultPrevented` is ignored, so a key parallax's grid or chart already handled also runs the page's shortcut.
- **Severity:** polish.
- **Confidence:** the matching and case-sensitivity cases confirmed by running (`keys.mjs`), the rest by reading.

Done in DataTable, shortcuts: rows sort by the columns as they are now, and a shortcut's keys follow one stated grammar: the listener runs nothing for `event.repeat` or `defaultPrevented`, nor any shortcut while a
modal dialog is open. Whether a shortcut is plain is read from its parsed modifiers, so `Mod+S` runs from a field.
`shift+1`, `+`, `shift+/`, `esc` and `space` match: a digit or symbol with `shift` matches its physical key, and a
symbol without it matches the character pressed. Held by unit tests of each press and gallery tests of a held key, a
handled key, `Mod+S` in a field and `mod+s` behind a modal.

**12. In a window under 768 px the sidebar's sheet stays open after a page link is chosen**

- **Where:** `packages/ui/src/components/app-sidebar.tsx:43-47`, `sidebar.tsx:95-127`
- **Defect:** nothing calls `setOpenMobile(false)` on navigation.
- **Scenario:** a user with the browser snapped to half a laptop screen picks "Trades"; the modal sheet keeps covering the new page until Escape.
- **Severity:** polish.
- **Confidence:** confirmed by reading.

**13. Text columns sort identifiers by digit runs as numbers**

- **Where:** `packages/ui/src/utils/sort.ts:36`, through `data-table-columns.ts:121`
- **Defect:** numeric collation is applied to every text column.
- **Scenario:** a CUSIP column sorts `3135G0Q22 31359MGK3 91282CAB7 912810SU3 912828ZT0 9128285M8 037833100`, with Apple's last, which is not Excel's order after export.
- **Severity:** polish; the "as people read it" rule is deliberate, but identifier columns need a way out.
- **Confidence:** confirmed by running (`sort.mjs`).

**14. SavedViews hides a failed load and applies the default late**

- **Where:** `packages/ui/src/components/use-saved-views.ts:65`, `:79-95`; `saved-views.tsx:47`
- **Defect:** a failed list reads as "No saved views yet", and the default view is applied whenever the list arrives.
- **Scenario:** with an API store behind retries the list can land seconds after the page is usable, overwriting filters the user has already changed.
- **Severity:** polish.
- **Confidence:** confirmed by reading.

**15. Any `TypeError` is described as "The server could not be reached"**

- **Where:** `packages/ui/src/shell/describe-error.ts:67`, shown through `ErrorAlert`, `QueryState` and `DataTable`
- **Defect:** a programming error is reported to the user as a network failure.
- **Scenario:** a bug in a query's `select` (`undefined.map`) tells users to check their network.
- **Severity:** polish; owned by the shell reviewer, listed because my components display it.
- **Confidence:** confirmed by reading.

### Overall quality

The area is in better shape than a week of agent-written code suggests. About sixty probes of the number and date text behaved correctly (rounding, a negative that rounds to zero staying neutral, bad input showing a dash). The CSV writer is correct on RFC 4180 quoting and the OWASP formula prefixes, and the sparkline, bar and resizable arithmetic hold up on empty and non-finite input.

The defects cluster at seams: TanStack Table's caches, controlled/uncontrolled transitions, state derived rather than held in SavedViews, the shortcut grammar, and route trees unlike the template's.

The tests are real-browser behaviour tests and cover the main paths well, but none changes props over time, uses a second tab, a nested route, an unknown modifier, or a toast over a modal. That is exactly where findings 1–8 sit.

Two weak spots in what agents are shown:

- `packages/gallery/src/pages/data/saved-views.test.tsx:102-113` ("stops opening the view shown by default") only polls the store, so it passes while the UI deselects the view (finding 5A).
- The `AlertDialog` `@example` (`alert-dialog.tsx:28-56`) shows an uncontrolled dialog whose action never closes it, against `README.md:893`.

### Not read in full

- **Only skimmed:** `popover`, `hover-card`, `context-menu`, `menubar`, `navigation-menu`, `accordion`, `collapsible`, `scroll-area`, `breadcrumb`, `toolbar`, `sidebar-menu`, `sidebar-group`, `sidebar-sections`.
- **Read in part:** `sheet`, `drawer`, `tabs`, `pagination`, `alert-dialog`, `dropdown-menu`.
- **`index.ts`:** the icon block was skimmed; nothing in the public surface looked accidental, and the route `staticData` augmentation reaches `dist`.

## Changelog

- `DataTable` sorts and filters by its columns' values as they are now when the columns change and the data does
  not, such as a spread from a benchmark the user changed, or names a second query brought. What to do: nothing.

- A shortcut's keys follow one grammar, which the README's "Keys" states: modifiers `mod`, `ctrl` (the same key),
  `alt` and `shift`, then one character or a named key such as `enter`, `esc`, `space` or `f1`. An unknown modifier,
  such as `cmd+d`, is thrown in development and logged as an `ERROR` line in production, never bound to the bare key.
  `shift+1`, `+`, `shift+/`, `esc` and `space` now match, and `Mod+S` in capitals is a modified key. What to do: run
  the app in `vp dev` once; a shortcut that throws names its fix.

- Shortcuts no longer repeat while a key is held, never run for a key a grid or chart already handled, and none run
  while a modal dialog is open. What to do: nothing.
