# Changelog

What changed in `@basis/ui` and `@basis/parallax`, which release together, newest first, in the words an app's agent
needs: what changed, and what to do about it. `vp run docs ui/changelog` prints it in an app, and `vp run upgrade`
prints the entries between the installed version and the new one. It starts with the version after 0.0.0; nothing
before is listed. Each release is a heading, `## VERSION - YYYY-MM-DD`, below `## Unreleased`, what is merged and not
yet released; each entry is a bullet, its other lines indented by two spaces, ending with "What to do:" when it asks
anything of an app.

## Unreleased

- Form fields bound to a TanStack Form field: `FormTextField`, `FormAmountField`, `FormDateField`, `FormSelectField`
  and `FormCheckboxField`, with `submitErrors` and `errorsOnFields` for a 422's errors; `UnsavedChangesGuard`, which
  asks before a page with unsaved changes is left; and `TypedConfirmDialog`, which asks for a name to be typed before
  an action that cannot be undone. `vp run new form` now writes its fields with them, so a new form is a third the
  size. What to do: nothing; a form that binds its own fields can use them, as the README's "Building a form" shows.

- `DatePicker`, for any date such as a maturity, and `MonthPicker`, for a month, beside `AsOfDatePicker`, whose props
  type is now exported as `AsOfDatePickerProps`. `DateRangePicker` gains the past month, three months and year among
  its presets, a range typed From and To, and Clear, which calls `onValueChange` with `null`. What to do: an
  `onValueChange` on a `DateRangePicker` takes `DateRange | null`; one typed to take only a `DateRange` fails the type
  check, and handles `null` as no range.

- `StatCard`, a dashboard's figure: its value in large tabular figures, its change with an arrow, a sign and the gain
  or loss colour, `rising: "loss"` turning that round, and its recent values as a sparkline, with a skeleton while
  it loads. What to do: nothing; a KPI card built from `Card` and `Sparkline` by hand can become one.

- `SavedViews`, a menu of a page's saved views, with `browserViewStore` for this browser alone and `apiViewStore` over
  the app's API: apply a view, save the page's state as a new one, save changes to, rename, make the default or delete
  the one shown. A view's state is any JSON, a grid's, pivot's or chart's layout or a table's with its filter bar's
  values, read back through the page's own `parse`. What to do: nothing; `vp run docs SavedViews` shows it.

- Two more themes ship beside the default, `desk`, dense and dark-first, and `high-contrast`, and the user menu now
  offers the theme. The default has a look of its own: a slate neutral, white cards on a grey page, a deeper blue
  brand, vivid in dark mode with dark text on it. A status's colour, `text-warning` and its kin, is now its ramp's
  text step, and its solid fills only the environment banner, so `bg-warning` and its kin are darker than they were.
  Figures are tabular across the page, table headings are small and muted, and icons draw at a 1.75 stroke. What to
  do: nothing, unless a test reads a colour or an icon's stroke; `vp run shot --theme desk` shows a page in a theme.

- `applyPreferences` dispatches `themeChangeEvent`, `basis:themechange`, on the root element once it changes the
  mode, density, motion or theme shown, and `@basis/parallax`'s canvases read their tokens again on it. Code that
  changes the theme's tokens another way, such as by setting a variable on a wrapper, dispatches it on the document.
  `@basis/parallax`'s grid rows are now a medium control's height, 28 px compact and 32 comfortable, so a page's
  grids are as dense as its forms. What to do: nothing, unless a test reads a grid's row height in pixels.

- An app made with `vp create @basis:app` now gets its `.gitignore`. The packed template had dropped it, as a packed
  package drops every `.gitignore`, so `vp run verify` failed its sync stage, and its lint read `node_modules` until it
  was killed. The template holds it as `_gitignore`, which `vp create` renames, and CI now makes an app from the packed
  template and packages and runs `vp run verify`, `vp run shot --all` and `vp build` in it. What to do: an app with no
  `.gitignore` runs `vp run sync`, which writes it.

- `vp run upgrade [VERSION]` refuses a working tree with changes not committed, then installs `@basis/ui` and
  `@basis/parallax` at the new version, the latest release or VERSION, prints this changelog's entries after the
  installed version, runs `vp run sync`, then the codemods the releases in between ship, oldest first, and `vp run
  verify`, and ends with a summary of what it changed and what the entries ask of the app. `--dry-run` prints the
  entries, the steps and each codemod's change, line by line, and changes nothing. The first codemod,
  `fetch-rule-name`, renames `eslint/no-restricted-globals` to `basis/no-fetch` in the comments that turn it off;
  `basis/no-suppressions` still refuses such a comment, and its `ERROR` line says what replaces it. What to do: run
  `vp run sync` for the new lines in `AGENTS.md`, and upgrade with `vp run upgrade`, after `vp run upgrade --dry-run`
  to see what it will do.

- `DataTable` pages 50 rows unless `pageSize` says otherwise, and shows its pages once it holds more rows than a page;
  a table of fewer rows looks as it did. Its state can be the app's: `sorting`, `filter`, `hiddenColumns`, `page` and
  `selectedIds`, each with its `on…Change` and a `default…` for a table that holds its own (`DataTableStateProps`).
  `filterBy={{ filters, values, fields }}` takes a FilterBar's values as `filterRows` does, and keeps the selection of
  the rows they hide. The text filter matches the text a cell shows, `5,000,000` or `99-16+`, not the value's digits,
  and filters once typing pauses, 200 ms, or at once on Enter; a column's `text` says what a `cell` of its own shows.
  `onRowClick` hears a click on a row but not on a control in it. The header stays in view as the rows scroll, once the
  table is given a height, as with `className="h-96"` or in a Page that fills the window. A column's `width` sets its
  width in pixels. A row's actions are asked for when its menu opens, not as each row draws. At its row cap, a first
  page, a key in the filter and a change of mode take a tenth of the main thread they did. What to do: pass
  `pageSize={2000}` where a table must show every row on one page; where a test reads a table's rows straight after
  typing in its filter, wait for them, as with `expect.poll`; give a column whose `cell` shows other text than its
  value a `text`, so the filter finds what users see. `DropdownMenuContent` takes `anchor`, for a menu opened from an
  element that is not its trigger.

- `checkRoutes(routeTree)` from `@basis/ui/testing` makes one test per route. Each renders the route on the fixtures
  in `fixtures/`, answered as `vp dev`'s fixture mode answers them, with no browser. It fails with an `ERROR` line on
  a request nothing answers, an error reported to telemetry, an error toast, a console error, a page still loading
  after 10 s, or an axe violation. A route with a parameter opens at a fixture's value for it, or at
  `checkRoutes(routeTree, { params })`, and is skipped without one. `expectAccessible(container?)` runs the same axe
  check in any test. A test leaves out the rules that need the page drawn with its stylesheet, colour contrast and
  target size among them, which `vp run shot` still checks. `basisTest()` adds a setup file that gives `checkRoutes`
  the fixtures. What to do: add `src/routes.test.ts` with `checkRoutes(routeTree)`, as the template has it, and fix
  each line it prints; run `vp run sync` for the new line in `AGENTS.md`. Fixture mode's `fixture.answered` event now
  carries `problem`, the detail of its answer when nothing answers.
- New: `FilterBar`, a page's filters over its rows, kept in its search parameters. Declare the filters with
  `defineFilters` (kinds `text`, `choice`, `multiChoice`, `dateRange`, `numberRange`), give the route
  `validateSearch: filterSearchSchema(filters)`, pass `useFilters(filters)` to the bar, and keep the rows with
  `filterRows(rows, { filters, values, fields })`. Back and Forward restore the filters, typing is one history entry,
  and a value a stale link holds that a filter cannot take opens as no filter. Each active filter is a chip that clears
  it, beside Clear all. `filters.values` is a `FilterValues`, plain JSON for a saved view to store; `filters.setAll`
  restores one in one history entry. See the README's FilterBar section.
- The preferences carry a theme. `Preferences` has a `theme`, one of `themeNames` (only `default` ships yet), which
  the cookie stores as a fourth part, `dark.compact.full.default`, and the head script puts on the root as
  `data-theme`; an older cookie, or one naming a theme no longer shipped, reads as the default theme. The user menu
  offers the themes once more than one ships. `BasisApp` takes `preferencesDomain`, such as `apps.example.com`, which
  puts the cookie on the parent domain the firm's apps share, so a choice made in one is every app's; on `localhost`
  the cookie stays the app's alone. A page follows another app's change at once over HTTPS, and otherwise when the
  user comes back to it. `vp run shot --theme NAME` takes any shipped theme, and a theme other than the default joins
  the files' names. What to do: add `theme` where you build a `Preferences`, such as `theme: "default"` or
  `defaultPreferences.theme`; and give every app on the firm's parent domain the same `preferencesDomain` once it is
  known.
- `vp run new table|page|form NAME --operation ID` starts a page from an operation in `openapi.json`: a DataTable of
  the rows a GET answers, a card of the fields a GET answers, or a form for the body an operation takes, bound to the
  generated Zod schema, each number by its display format; with its test, a fixture whose body the schema accepts and
  its route in `src/routes.ts`. It passes `vp run verify` as written, and prints `vp run verify` and `vp run shot
  /NAME` to run next. `vp run fixtures new OPERATION [--status 404]` writes a fixture whose body the schema accepts,
  and `vp run fixtures check` checks every fixture. What to do: fixture mode and `vp run verify` now check each
  fixture's JSON body against its status's schema, so fix, or rewrite with `vp run fixtures new`, each one an `ERROR`
  line names; run `vp run sync` for the new lines in `AGENTS.md`.
- The shell grows for a data app. Give each route's content a `Page`, with its `title`, `description` and `actions`,
  and `layout="fill"` for a grid, pivot or chart that fills the window; `layout="scroll"`, the default, scrolls the
  content under the header, and content that is not a Page scrolls in the shell as before. A Page's `breadcrumb`, such
  as a bond's name once its query has it, titles the page's breadcrumb. `AppShell` takes `header`, `sidebarHeader`,
  `sidebarFooter` (in the user menu's place) and `collapsible="icon"`, and a route's `staticData.group` puts its page
  under that heading in the sidebar. A `PaletteCommand` takes `keywords`, `group`, `icon` and `shortcut`; the shortcut
  runs the command with the palette closed. The page shown is a `ShortcutScope`, so a page's `useShortcut` keys are
  its own and win over the app's; `ShortcutScope` does the same for a part of a page. Two shortcuts with the same keys
  in one scope now log an `ERROR` line naming both: give one other keys. The shell's tooltips open after 400 ms, and
  a neighbour's at once. `toastError` raised again for the same error within 10 seconds counts on the open toast. On
  the sidebar's icon rail, a group's last item now takes the pointer under the next group's hidden label. The shell
  passes `vp run shot`'s axe check: it has one `main`, its header is the page's banner, and its sidebar is a
  complementary landmark named by the app. A paged `DataTable`'s navigation is named by its `label`, as
  "Coupons, pages", rather than "Pages", the sidebar's.
- `vp run shot` explains what it pictured. Beside `NAME.png`, `NAME.aria.yml` and `NAME.console.txt` it writes
  `NAME.network.txt`, each request to `/api` with its status and what answered it (`record`, `fixture` with its file,
  `generated`, `none` or `live`), and `NAME.axe.txt`, axe's accessibility check, whose every violation fails the shot
  with the rule, the element and the fix. New options: `--mode light|dark` and `--density compact|comfortable` (set
  through the preferences cookie; `--dark` and `--comfortable` still work), `--theme default`, `--selector CSS` for one
  element, several routes at once, `--all` for every route of the router, `--step` to click, hover, type, press or wait
  before the picture, as `--step 'click:Save'`, `--compare DIR` against baselines, with the count of changed pixels and
  `NAME.diff.png`, and `--json`, one line of the type `ShotReport` from `@basis/ui/preset`. What to do: run `vp run
  sync` for the new `drive-the-app` skill, and fix what `NAME.axe.txt` lists; a page that fails only on the shell's
  landmarks waits for the shell's fix. Fixture mode's answers now carry `x-basis-fixture-source` and
  `x-basis-fixture-file` headers.
- `vp run verify` runs every check, each stage to its end, then prints one summary: sync, client, fixtures, config,
  lint, types, tests, build, budget and suppressions, each failure one `ERROR` line with its file and line where the
  tool gives them. `--stage NAME`, once for each, runs those stages alone, and `--json` prints the report as one line
  of JSON, the type `VerifyReport` from `@basis/ui/preset`. `vp run check-full` is now `vp run verify`: it still runs,
  saying so, so call `vp run verify` instead. The commit hook now runs `vp staged` and verify's fast stages, a few
  seconds, and the push hook every stage; run `vp run sync` to write the new hooks and the framework files' new first
  line, which names `vp run verify`. An app with no test file now fails the tests stage: write a test of each page.
- The lint and the drift check close what probes found open, each with an `ERROR` line that ends in its fix. What an
  app must change: remove every `oxlint-disable` and `eslint-disable` comment but `oxc/no-barrel-file`'s in
  `src/api`, and every `@ts-expect-error`, `@ts-ignore` and `@ts-nocheck`, fixing what they hid (`basis/no-suppressions`,
  and the new suppressions step of `vp run check-full`, now `vp run verify`, which `vp run review` counts); on a plain element, drop `dark:`,
  `!`, selector variants such as `[&>*]:`, filters such as `grayscale` and `brightness-50`, `black` and `white`, and
  classes built from template strings (`basis/theme-classes`); show dates with `DateTime` or `relativeTime`, not
  `toLocaleDateString`, `toLocaleTimeString`, `Intl.DateTimeFormat` or `Intl.RelativeTimeFormat`, and round to a step
  with `roundToTick`, not `Math.ceil(n * 100) / 100` (`basis/no-hand-rounding`); call the API only through the
  generated client, with no `fetch` in `src/api` and no `XMLHttpRequest`, `WebSocket`, `EventSource` or
  `navigator.sendBeacon` (`basis/no-fetch`); and import none of `recharts`, `react-hook-form`, `sonner` or React Aria.
  `vp run sync` now writes `.gitignore`, `src/styles.css` and `tsconfig.json`, and `vite.config.ts` when it is
  missing, and `vp run sync --check` fails on a `vite.config.ts` beyond the preset, its plugins, its tests, a budget and
  `basisTest({ browser: false })`, and on a dependency that is not on `@basis/ui`'s list: run `vp run sync`, then fix
  what it still reports. `no-unknown-classes`, `no-arbitrary-values` and `no-inline-styles` no longer suggest declaring
  anything in `src/styles.css`, and `typescript/ban-ts-comment` and `typescript/prefer-ts-expect-error` are off in app
  code, since `basis/no-suppressions` refuses every `@ts-` comment.
- The lint asks less of a page and says more when it refuses one. In app code a function may run to 200 lines,
  blanks and comments aside, with a complexity of 30 and 4 parameters; `a`, `b`, `e`, `k`, `v` and `_` are names; a
  number inside JSX needs no name; and only exported functions need a return type. A class that restyles a component
  names its variants and sizes and `vp run docs NAME`; a raw colour or a missing shadow names the tokens it means,
  such as `text-loss` or `bg-destructive` for red, and `shadow-sm` or `shadow-md`; `fetch` is refused by
  `basis/no-fetch`, so a disable comment for it names that rule, not `eslint/no-restricted-globals`.
- `vp run docs NAME` prints one component, hook, function, type or module from the installed catalogue, such as
  `vp run docs Select`, `vp run docs numberText`, `vp run docs DataTableColumn` or `vp run docs dates`: what it is for,
  when to use it, what goes with it, its props with their defaults, its variants and an example. `vp run docs --search
  WORDS` finds entries and README sections by what they are for, and `--json` prints either as JSON. A name it does not
  have fails with the closest names it has. README sections print as before, by `ui/SLUG` or `SLUG`.
- `@basis/ui/catalogue.json` is now `basis-ui-catalogue/2`. A component lists the props it takes from Base UI, with
  `from: "@base-ui/react"` and their `default`, so `Select` shows `items`, `value` and `onValueChange`; `extends` keeps
  only what is not listed, such as `ComponentProps<"div">`. Components gain `module`, `use` and `with`. New lists:
  `functions` (hooks, functions, classes and constants, with signatures), `types` (every type an entry names, with its
  fields, such as `DataTableColumn` and `DisplayFormat`) and `modules` (each subpath and what it is for).
  `@basis/parallax`'s components, hooks and types, every `LayoutInput` field among them, are in it under
  `module: "@basis/parallax"`. A reader of format 1 reads `components[].props` and `icons` as before.
- The README holds only what an app needs. How the package is built and how a component or icon is added moved to
  basis-ui's `packages/ui/CONTRIBUTING.md`, which does not ship.
