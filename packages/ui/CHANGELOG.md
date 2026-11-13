# Changelog

What changed in `@basis/ui` and `@basis/parallax`, which release together, newest first, in the words an app's agent
needs: what changed, and what to do about it. `vp run docs ui/changelog` prints it in an app, and `vp run upgrade`
prints the entries between the installed version and the new one. It starts with the version after 0.0.0; nothing
before is listed. Each release is a heading, `## VERSION - YYYY-MM-DD`, below `## Unreleased`, what is merged and not
yet released; each entry is a bullet, its other lines indented by two spaces, ending with "What to do:" when it asks
anything of an app.

## Unreleased

## 0.1.0 - 2026-11-13

- `windowsSignIn({ tokenUrl })`, the adapter for the firm's Windows authentication: the token from the endpoint, kept
  in local storage, renewed before it expires and after an API's `invalid-token`, with the endpoint, its answer and
  the claims' names as options (`defaultClaims`). `SessionEndedError` is what an adapter throws when the sign-in
  system refuses; the shell answers it as an ended session, whose toast's action says "Sign in again". An adapter's
  `offersSignOut: false` hides the user menu's sign-out, and `renew(refused)` lets the shell send a refused request
  once more; `setTokenSource` takes the renewal as its second argument. An app's adapter is chosen in
  `src/sign-in.ts`: `fakeSignIn()` in `vp dev`, tests and a fixture build, `windowsSignIn` otherwise, and `vp run
  verify`'s build stage fails a production build that would still sign users in with `fakeSignIn`. What to do: add
  the template's `src/sign-in.ts` to an app whose `src/main.tsx` passes `fakeSignIn()`, set its `tokenUrl`, and pass
  its `signIn`; README "Sign-in" lists what to set when porting, and `vp run verify` names the app until it is done.

- A `User` holds `roles`, the token's, empty for `fakeSignIn` and `anonymousSignIn` unless given; `fakeSignIn`'s user
  may leave them out, and its token carries them. `useUser()` returns the signed-in user. A role decides what a page
  shows; the API stays the judge. What to do: an adapter of the app's own returns `roles` on its user.

- A generated hook's `error` is typed as what the client throws: `ApiError` of any problem, or another `Error`, where
  it was an `ApiError` of the operation's declared problems alone, which a 502 or a lost connection broke at run
  time. What to do: narrow with `isApiError(error)` before reading `error.problem`, and read a 422's fields with
  `fieldErrors`; the compiler names each place.

- Only a request that never reached the API is a network failure: `apiFetch` and `arrowResponse` throw it as a
  `NetworkError`, a `TypeError` whose `cause` is what `fetch` threw, and `isNetworkError` tells it. Any other
  `TypeError`, such as a bug in a query's `select`, is no longer retried or shown as "The server could not be
  reached". What to do: a test that stands for a lost connection with `new TypeError(...)` makes a `NetworkError`.

- `checkRoutes` and `renderApp` take `router`, the app's own router options, as its `router.ts` gives
  `createRouter`, or a function of `BasisApp`'s query client that makes them: `{ router: (queryClient) => ({ context:
  { queryClient } }) }`. What to do: an app whose router sets a `context`, a `basepath` or a search serializer passes
  them, so that its route tests run the router it ships.

- `checkRoutes(routeTree)` from `@basis/ui/testing` makes one test per route. Each renders the route on the fixtures
  in `fixtures/`, answered as `vp dev`'s fixture mode answers them, with no browser. It fails with an `ERROR` line on
  a request nothing answers, an error reported to telemetry, an error toast, a console error, a page still loading
  after 10 s, or an axe violation. A route with a parameter opens at a fixture's value for it, or at
  `checkRoutes(routeTree, { params })`, and is skipped without one. `expectAccessible(container?)` runs the same axe
  check in any test. A test leaves out the rules that need the page drawn with its stylesheet, colour contrast and
  target size among them, which `vp run shot` still checks. `basisTest()` adds a setup file that gives `checkRoutes`
  the fixtures. Fixture mode's `fixture.answered` event carries `problem`, the detail of its answer when nothing
  answers. What to do: add `src/routes.test.ts` with `checkRoutes(routeTree)`, as the template has it, and fix each
  line it prints; run `vp run sync` for the new line in `AGENTS.md`.

- `AppShell` titles the browser's tab by the page shown and the app: the route's `staticData` title, then `appName`,
  as "Positions · Workbench", or `appName` alone on a route with no title. What to do: give `appName` the name people
  read, and remove any code of the app's own that sets `document.title`.

- The preferences carry a theme. `Preferences` has a `theme`, one of `themeNames` (`default`, `desk` and
  `high-contrast`), which the cookie stores as a fourth part, `dark.compact.full.default`, and the head script puts on
  the root as `data-theme`; an older cookie, or one naming a theme no longer shipped, reads as the default theme. The
  user menu offers the themes. `BasisApp` takes `preferencesDomain`, such as `apps.example.com`, which puts the cookie
  on the parent domain the firm's apps share, so a choice made in one is every app's; on `localhost` the cookie stays
  the app's alone. A page follows another app's change at once over HTTPS, and otherwise when the user comes back to
  it. `vp run shot --theme NAME` takes any shipped theme, and a theme other than the default joins the files' names.
  What to do: add `theme` where you build a `Preferences`, such as `theme: "default"` or `defaultPreferences.theme`;
  and give every app on the firm's parent domain the same `preferencesDomain` once it is known.

- A field of `rateSuffixes` refuses a bare number: `25` is `"25" needs a unit: write 25% or 25bp.` rather than the
  fraction 25, or 2,500%; a bare `0` stands, and the echo under the field reads as a percentage, `= 0.25%` for
  `25bp`. `amountSchema(rateSuffixes)` and a FileImport column of it refuse the same text. A spread of `rateSuffixes`
  keeps the rule; amounts and par are unchanged. What to do: tell users of a rate field to type its unit, and give a
  rate column of an import file its `%` or `bp`; a default value set as a number is unaffected.

- The form fields take `optional` and `nullable`, as the schema says: an optional text, date, choice or security
  field holds `undefined` while empty, so the form submits no such key, and a nullable one `null`; `FormAmountField`
  takes `optional`. A field whose value type may be `undefined` or `null` must say which, or it does not compile.
  `FormSelectFieldProps` and the other fields' props types take the value type, `FormTextFieldProps<string |
  undefined>`. What to do: for each optional or nullable property of a form's schema, start the field's default value
  at `undefined` or `null` and pass `optional` or `nullable`; a field that held `""` for none of an optional property
  failed the schema or sent `""`.

- FileImport's preview shows "Sent as …" under a cell whose value the schema reads as something its text does not
  say, such as `5M` par as 5,000 or `FALSE` as true, so the user confirms what the app receives. Its `schema` prop's
  doc names `z.stringbool()` for a TRUE or FALSE column: `z.coerce.boolean()` reads any text, FALSE included, as true.
  What to do: replace `z.coerce.boolean()` in an import schema with `z.stringbool()`.

- Every input takes Select's two sizes, `size="sm"` and the default: `Input`, `InputGroup`, `AmountInput`, the date
  pickers, `NumberField`, `ComboboxInput`, `EntityPicker`, `SecurityPicker` and the form fields. `Input`'s `size` is
  no longer the HTML attribute's width in characters. What to do: an `<Input size={20}>` gives its width with a class,
  as `w-48`.

- Every component's props type is exported, named for it, as `ButtonProps`, `DialogContentProps` and
  `DataTableProps`. The lint refuses Radix's `asChild` with `basis/no-as-child`, whose line says to pass the element
  through `render`. What to do: replace `asChild` with `render={<Element />}`, and `ComponentProps<typeof X>` with
  `XProps` where it reads better.

- `Combobox`, and `EntityPicker` and `SecurityPicker` on it, draw at most 100 items unless `limit` says otherwise, and
  say under the list to type to narrow them once they reach it; a `Select` with more than 100 `items` reports an
  `ERROR` line to telemetry naming `Combobox`. What to do: a combobox that must show more sets `limit`; a long select
  becomes a combobox.

- `DatePicker`, for any date such as a maturity, and `MonthPicker`, for a month, beside `AsOfDatePicker`, whose props
  type is now exported as `AsOfDatePickerProps`. `DateRangePicker` gains the past month, three months and year among
  its presets, a range typed From and To, and Clear, which calls `onValueChange` with `null`. What to do: an
  `onValueChange` on a `DateRangePicker` takes `DateRange | null`; one typed to take only a `DateRange` fails the type
  check, and handles `null` as no range.

- A shortcut's keys follow one grammar, which the README's "Keys" states: modifiers `mod`, `ctrl` (the same key),
  `alt` and `shift`, then one character or a named key such as `enter`, `esc`, `space` or `f1`. An unknown modifier,
  such as `cmd+d`, is thrown in development and logged as an `ERROR` line in production, never bound to the bare key.
  `shift+1`, `+`, `shift+/`, `esc` and `space` now match, and `Mod+S` in capitals is a modified key. What to do: run
  the app in `vp dev` once; a shortcut that throws names its fix.

- `DataTable` pages 50 rows unless `pageSize` says otherwise, and shows its pages once it holds more rows than a page;
  a table of fewer rows looks as it did. Its state can be the app's: `sorting`, `filter`, `hiddenColumns`, `page` and
  `selectedIds`, each with its `on…Change` and a `default…` for a table that holds its own (`DataTableStateProps`).
  `filterBy={{ filters, values, fields }}` takes a FilterBar's values as `filterRows` does, and keeps the selection of
  the rows they hide. The text filter matches the text a cell shows, `5,000,000` or `99-16+`, not the value's digits,
  and filters once typing pauses, 200 ms, or at once on Enter; a column's `text` says what a `cell` of its own shows.
  `onRowClick` hears a click on a row but not on a control in it. The header stays in view as the rows scroll, once
  the table is given a height, as with `className="h-96"` or in a Page that fills the window. A column's `width` sets
  its width in pixels. A row's actions are asked for when its menu opens, not as each row draws. At its row cap, a
  first page, a key in the filter and a change of mode take a tenth of the main thread they did.
  `DropdownMenuContent` takes `anchor`, for a menu opened from an element that is not its trigger. What to do: pass
  `pageSize={2000}` where a table must show every row on one page; where a test reads a table's rows straight after
  typing in its filter, wait for them, as with `expect.poll`; give a column whose `cell` shows other text than its
  value a `text`, so the filter finds what users see.

- `onSelectionChange` reports the selected rows the filters keep, as the toolbar counts them, and is called again when
  a filter narrows them. What to do: an action on "the selected rows" now gets only those shown; pass the filter's
  text as `filter` and clear it first if a page means every row selected.

- `DataTable` with `data` `undefined` shows its loading rows unless `loading={false}` or an `error` is passed, never
  "No rows to show." What to do: pass the query's `error`, so a failed load shows it rather than loading.

- DataTable's text column takes `identifier: true`, which sorts it by code point, `037833100` before `912828XB1`, and
  `vp run new table` writes it for an id's or a security code's column; `compareIdentifiers` in `@basis/ui/utils`.
  What to do: add `identifier: true` to a column of CUSIPs, ISINs or ids.

- `percentChange` gains the reason `not-a-number`, for a change from or to NaN or an infinity. What to do: code that
  switches on its reason handles the new one; the compiler names each place.

- `@basis/parallax`: a layout typed by its dataset's rows. `useDataset<Position>(...)` gives a dataset whose `Grid`,
  `Pivot`, `Chart` and `useView` layouts name only `Position`'s columns, so a misspelt column, sort, filter, measure,
  format, cell kind or rule is a type error where it is written; a dataset with no row type takes any name, as
  before. `LayoutFor<TRow>`, `ColumnOf` and `AnyRow` are exported. About 40 internals moved from `@basis/parallax` to
  `@basis/parallax/internals`: `BrowserEngine`, `Connection`, the `ViewHandle` class, `decodeFrame` and the other
  decoders, `FrameError`, `decimalFromWords`, `exactDecimal`, `isNegativeText`, `pathValue`, `timestampText`,
  `layoutSchema`, the width keys, `trapReason`, `exportTypes`, and the theme's readers and style installers
  (`readTheme`, `readChartColors`, `defaultTheme`, `sameTheme`, `installTheme`, `tokenStyles` and their kin). What to
  do: an app that imported one of them imports it from `@basis/parallax/internals`; `ViewHandle` stays a type in
  `@basis/parallax`.

- A dataset's name is the page's key for its rows: two components that give one name different data both fail, with a
  reason that says to put what tells them apart in the name, where each showed whichever load finished last. A dataset
  whose page goes, and whose name the next page loads with other data, loads afresh rather than as a reload. What to
  do: a dataset that takes a parameter, such as a fund, puts it in its name: `` `positions-${fund}` ``.

- `useDataset`'s function source is given `{ signal }`, which aborts once nothing waits for the load, as when the
  source changes again or the component unmounts first; `SourceContext` is its type. What to do: pass it on, `async ({
  signal }) => arrowResponse(url, { signal })`, so the download stops; run `vp run sync` for the `show-data` skill's
  new sample.

- A source that hands back a response whose body was already read, or bytes that already moved to the engine, fails
  its load with a reason that says to return new ones from each call, where it waited for ever. What to do: a source
  that keeps one `Response` or `ArrayBuffer` returns a new one from each call.

- `@basis/parallax`'s grid heads a column the layout gives no title by its name made readable, `market_value_usd` as
  `Market value (USD)` and `position_id` as `Position ID`, and a zoned time by its place, `(New York)` for
  `(America/New_York)`; the Excel and CSV exports' headers and copies with headers say the same. Its body shows a
  skeleton while the first rows load, and says when no row matches. What to do: a test or a tool that reads an
  export's header row, or a grid's header or spoken cell by a column's name, reads the readable title, or the layout
  gives that column a `titles` entry of its own name.

- `@basis/parallax`: a response with no length, as a gzipped or chunked one is, and a table sent as one record batch,
  load with their columns copied a few times rather than once a batch or slice. A table sent as one batch still holds
  its whole stream in the engine's memory beside the table until it has loaded. What to do: an API that serves large
  tables writes them in batches of about 65,536 rows, as `write_table(table, max_chunksize=65_536)` does in pyarrow.

- A choice of every row, from the header's checkbox, is handed to the app again whenever a filter, a search or a
  reload changes the rows it covers: `onRowsChange` gets `{ all: true, keys, view }`, `view` being the layout's
  `filters` and `search` and how many `rows` the view shows, and `onSelectionChange` the keys again. Past 1,000,000
  rows an app that takes `onSelectionChange` is refused a check of every row, saying so. What to do: a bulk action on
  every row sends `view`'s filters and search with `keys` as the rows left out, as the README shows; `ChosenView` is
  its type.

- `Grid`'s `rowKey` works without `selectable`: every `onCellClick`, `onRowActivate` and `onContextMenu` then carries
  the row's `key`. A row event's `row` is the view row, which the next sort or filter gives another record. What to
  do: give a grid whose events open a record a `rowKey`, and name the record by `key`, never `rows[row]`.

- `ViewHandle.measure(from, to, of)` takes `{ series, y }`, the series by its value and the y column whose line it
  measures, where it took the series as a string; the Measure tool measures the line pressed, on any y column. The
  protocol's `MeasureChart` gains `y`, the y column by name, empty for the chart's first as before, an additive field.
  What to do: a page that called `measure(from, to, "AAPL")` passes `{ series: "AAPL" }`.

- A chart refuses a setting it does not draw, with what to change, where it ignored it: `stacked` on anything but a
  bar chart, and `y_right` on anything but a line or area chart. What to do: a layout that set either drops it, or
  draws its columns as the message says.

- `@basis/parallax`: when the engine stops on a fault of its own, the reason every view shows names it as an internal
  error, with what the engine said and where, and the worker logs it to the console; "most likely because it ran out
  of memory" is kept for a trap with no such message, which is what running out of memory is. An integer overflow in
  the browser stops the engine with an internal error that names it, as in the engine's tests, where it wrapped into a
  wrong number. What to do: report such an error with the steps that led to it.

- `vp run upgrade [VERSION]` refuses a working tree with changes not committed, naming the files, then installs
  `@basis/ui` and `@basis/parallax` at the new version, the latest release or VERSION, prints this changelog's
  entries after the installed version, runs `vp run sync`, installs again, moving the app's exact pins on `vite-plus`
  and `typescript` to the versions the new release needs, runs the codemods the releases in between ship, oldest
  first, and `vp run verify`, and ends with a summary of what it changed and what the entries ask of the app.
  `--dry-run` prints the entries, the steps and each codemod's change, line by line, and changes nothing. An upgrade
  that stops part-way names the steps that ran and those that did not, and how to undo it with git, and `vp run
  upgrade --continue` runs the rest. A changelog the installed version cannot parse no longer stops an upgrade, and a
  codemod that cannot change one file still writes the others. The first codemod, `fetch-rule-name`, renames
  `eslint/no-restricted-globals` to `basis/no-fetch` in the comments that turn it off; `basis/no-suppressions` still
  refuses such a comment, and its `ERROR` line says what replaces it. What to do: run `vp run sync` for the new lines
  in `AGENTS.md`, and upgrade with `vp run upgrade`, after `vp run upgrade --dry-run` to see what it will do; when an
  upgrade stops, do as its last `ERROR` line says.

- `vp run verify` runs every check, each stage to its end, then prints one summary: sync, client, fixtures, config,
  lint, types, tests, build, budget and suppressions, each failure one `ERROR` line with its file and line where the
  tool gives them. `--stage NAME`, once for each, runs those stages alone, and `--json` prints the report as one line
  of JSON, the type `VerifyReport` from `@basis/ui/preset`. `vp run check-full` is now `vp run verify`: it still runs,
  saying so. The commit hook runs `vp staged` and verify's fast stages, a few seconds, and the push hook every stage.
  What to do: call `vp run verify` in place of `vp run check-full`; run `vp run sync` to write the new hooks and the
  framework files' new first line, which names `vp run verify`; and write a test of each page, since an app with no
  test file fails the tests stage.

- `vp run verify`'s config stage refuses a `vitest.config.*`, a second `vite.config.*`, an `.oxlintrc*` or an
  `.oxfmtrc*` beside the framework's configuration, holds `optionalDependencies` to the list of packages an app may
  use, and refuses a dependency installed under an alias or from outside the feed. What to do: delete such a file, and
  install each named dependency with `vp add NAME@VERSION`.

- `vp run sync` keeps an app's own file at a path where it writes basis-ui's, such as a `CLAUDE.md` it did not write,
  and a file with changes git has not committed, naming each in an `ERROR` line; it writes the rest and exits 1.
  Before, it overwrote both and said only "Wrote X". It replaces the basis-ui block of an `AGENTS.md` saved with CRLF
  line endings, rather than adding a second, and `--check` names a file that differs only in its line endings as such.
  What to do: when it names a file, do as its line says.

- `vp run sync` no longer manages the `Dockerfile`, `Caddyfile`, `.dockerignore` and `azure-pipelines.yml`: the app
  owns them, may edit or replace them, and writes its own pipeline. The next `vp run sync` removes basis-ui's header
  from each that still has it, and `vp run verify` names one that does until then. The template keeps the Dockerfile,
  Caddyfile and `.dockerignore` as a starting point, and has no pipeline. What to do: run `vp run sync`, commit the
  files it hands over, and delete `azure-pipelines.yml` if the app has no use for it.

- A fixture's response can hold its body in a file beside it, `"body_file": "data/trades.arrows"`, with its
  `media_type`, for a body too large for base64 in JSON; fixture mode streams it, and `vp dev` and `vp run verify`
  name a fixture whose file is missing. The record format's JSON Schema gains the form, an additive change. The
  framework's `.gitignore` names `fixtures/generated/`, the folder for such files that a task of the app's own writes.
  What to do: run `vp run sync`.

- The framework's `.gitignore` names `.playwright-cli/`, `.vitest/`, `__screenshots__/`, and what an editor leaves:
  `.idea/`, `.vscode/`, `*.swp`, `.DS_Store` and `Thumbs.db`. What to do: run `vp run sync`.

- Three more skills, which `vp run sync` writes into the app beside `drive-the-app`: `build-a-page`, `show-data` and
  `verify-the-app`, and `AGENTS.md`'s block names them. Every skill's `description` is quoted, so a strict YAML parser
  reads its front matter. What to do: run `vp run sync`.

- `vp run shot` explains what it pictured. Beside `NAME.png`, `NAME.aria.yml` and `NAME.console.txt` it writes
  `NAME.network.txt`, each request to `/api` with its status and what answered it (`record`, `fixture` with its file,
  `generated`, `none` or `live`), and `NAME.axe.txt`, axe's accessibility check, whose every violation fails the shot
  with the rule, the element and the fix. New options: `--mode light|dark` and `--density compact|comfortable` (set
  through the preferences cookie; `--dark` and `--comfortable` still work), `--theme NAME`, `--selector CSS` for one
  element, several routes at once, `--all` for every route of the router, `--step` to click, hover, type, press or
  wait before the picture, as `--step 'click:Save'`, `--compare DIR` against baselines, with the count of changed
  pixels and `NAME.diff.png`, and `--json`, one line of the type `ShotReport` from `@basis/ui/preset`. Fixture mode's
  answers carry `x-basis-fixture-source` and `x-basis-fixture-file` headers. What to do: run `vp run sync` for the new
  `drive-the-app` skill, and fix what `NAME.axe.txt` lists.

- `vp run shot` fails a route that matches none of the router's paths, whose picture was the page not found, and
  `--all` keeps every other route's shot when one cannot be pictured, as when its load times out; both report a
  problem of the new kind `route` in `--json`. What to do: name a route the router has.

- `vp run doctor` checks more of the desktop: the Node that runs the tasks against what Vite+ needs, with `vp env on`
  as the fix; one HTTPS request to the registry, through `HTTPS_PROXY`, naming `NODE_EXTRA_CA_CERTS` when Node does
  not trust the certificate it gets, as behind a proxy that inspects TLS; and that Chromium starts, naming `playwright
  install-deps chromium` when it lacks a system library, as a fresh Ubuntu in WSL does. `vp run shot` and verify's
  budget name the same fix. What to do: run `vp run doctor` on a new desktop, and do as each `ERROR` line says.

- On Windows, where Playwright's Chromium is not installed, `vp run shot` and the budget use the installed Microsoft
  Edge, and say so; the line for a missing Chromium names `PLAYWRIGHT_DOWNLOAD_HOST` for a mirror. What to do: on a
  desktop that cannot reach Playwright's download site, set `BASIS_TEST_DOM=node` for `vp test`.

- `vp run new table|page|form NAME --operation ID` starts a page from an operation in `openapi.json`: a DataTable of
  the rows a GET answers, a card of the fields a GET answers, or a form for the body an operation takes, bound to the
  generated Zod schema, each number by its display format; with its test, a fixture whose body the schema accepts and
  its route in `src/routes.ts`. It passes `vp run verify` as written, and prints `vp run verify` and `vp run shot
  /NAME` to run next. `vp run fixtures new OPERATION [--status 404]` writes a fixture whose body the schema accepts,
  and `vp run fixtures check` checks every fixture. What to do: fixture mode and `vp run verify` now check each
  fixture's JSON body against its status's schema, so fix, or rewrite with `vp run fixtures new`, each one an `ERROR`
  line names; run `vp run sync` for the new lines in `AGENTS.md`.

- What `vp run new` writes passes `tsc` and the lint where it did not: a page passes an integer or choice path
  parameter as the API declares it, a form has a field for each optional and nullable value its body takes, text from
  the document with quotes, braces or apostrophes is escaped, a table names a row by its identifier fields or its
  whole value rather than by a column that repeats, a form's test expects what the form sends, and a fixture that
  answers the request already is used rather than made. The template gains `@tanstack/react-form`. What to do: in an
  app made before, run `vp add @tanstack/react-form` before `vp run new form`; pages written before are unchanged.

- `vp run client-pull` writes mocks that pass `tsc` and the generated client's own schemas: a property an API leaves
  out of `required` is left out of the mock, where it was set to `undefined`, which the model's type refuses, and the
  string formats the client checks, `time`, `time-local`, `date-time-local` and a `pattern`, are mocked with text it
  accepts. What to do: run `vp run client-pull`.

- The lint and the drift check close what probes found open, each with an `ERROR` line that ends in its fix. The lint
  refuses on a plain element `dark:`, `!`, selector variants such as `[&>*]:`, filters such as `grayscale` and
  `brightness-50`, `black` and `white`, and classes built from template strings (`basis/theme-classes`); dates shown
  with `toLocaleDateString`, `toLocaleTimeString`, `Intl.DateTimeFormat` or `Intl.RelativeTimeFormat`, and a step
  rounded by hand, as `Math.ceil(n * 100) / 100` (`basis/no-hand-rounding`); a call to the API other than through the
  generated client, with no `fetch` in `src/api` and no `XMLHttpRequest`, `WebSocket`, `EventSource` or
  `navigator.sendBeacon` (`basis/no-fetch`); every `oxlint-disable` and `eslint-disable` comment but
  `oxc/no-barrel-file`'s in `src/api`, and every `@ts-expect-error`, `@ts-ignore` and `@ts-nocheck`
  (`basis/no-suppressions`, and verify's suppressions stage, which `vp run review` counts); and an import of
  `recharts`, `react-hook-form`, `sonner` or React Aria. `vp run sync` writes `.gitignore`, `src/styles.css` and
  `tsconfig.json`, and `vite.config.ts` when it is missing, and `vp run sync --check` fails on a `vite.config.ts` beyond
  the preset, its plugins, its tests, a budget and `basisTest({ browser: false })`, and on a dependency that is not on
  `@basis/ui`'s list. `no-unknown-classes`, `no-arbitrary-values` and `no-inline-styles` no longer suggest declaring
  anything in `src/styles.css`, and `typescript/ban-ts-comment` and `typescript/prefer-ts-expect-error` are off in app
  code, since `basis/no-suppressions` refuses every `@ts-` comment. What to do: remove each comment those rules
  refuse, fixing what it hid; show dates with `DateTime` or `relativeTime` and round with `roundToTick`; call the API
  through the generated client; then run `vp run sync`, and fix what `vp run verify` still reports.

- `basis/no-suppressions` and verify's suppressions stage refuse a `@ts-expect-error`, `@ts-ignore` or `@ts-nocheck`
  on any line of a block comment, as TypeScript honours it, and verify reads each file's comments as the parser gives
  them, so a URL or `"src/*"` in a string no longer hides the comment after it; `vp run review` counts the comments
  the same way. What to do: remove what `vp run verify` now reports, and fix the type the compiler names.

- `cn` from `@basis/ui`, the class helper its components use, for an app's own elements: `cn("tabular-nums", pnl < 0
  && "text-loss")`. `vp run sync --check` refuses `cn`, `clsx`, `classnames` and `tailwind-merge` as dependencies, and
  names it as the fix. What to do: import `cn` from `@basis/ui` in place of any helper of the app's own that joins
  classes, and remove such a dependency with `vp remove NAME`.

- `basis/theme-classes` passes a comparison inside `cn(...)`, follows a `className` to the constant, object or helper
  of the file that writes its classes and reports a class there, reads the class strings a call passes a helper of the
  same file, as `cell("dark:bg-muted")`, and reports a class it refuses at the call. It checks an app's own components
  as it checks a plain element, and refuses classes from another module or a function's result, which no check can
  read. Behind a key chosen at run time or a helper it also refuses a palette colour, a hex value and an arbitrary
  value, which `@shadcn/lint` cannot see there. What to do: write a page's classes in its own file, and fix what `vp
  check` now reports where they are written.

- An import of `apiFetch` from `@basis/ui` or `@basis/ui/mutator` outside `src/api` fails the lint: a page calls the
  API through the generated client's hooks, which parse each answer by its schema. `basis/no-fetch` also refuses
  `fetch` through an alias of the global object or destructured from it, and `basis/no-hand-rounding` a floored value
  over a power of ten. What to do: replace a call to `apiFetch` with the operation's hook from `src/api/client.ts`.

- The template pins Node and pnpm as basis-ui's repo does: `.node-version` 26, `engines.node` `>=26.0.0`, and
  `devEngines.packageManager` pnpm 12.18.0. Its `preinstall` refuses an older Node with an `ERROR` line that names
  `vp env on`, since Vite+ in system-first mode runs whichever Node is on the `PATH`. `@basis/ui` names
  `engines.node`. What to do: an app made from an earlier template adds the same `.node-version`, `engines`,
  `devEngines` and `preinstall` to its own files.

- The READMEs' samples compile in an app, and a test holds them to it. Three were untrue: the saved-views sample
  parses a layout with `checkLayout` from `@basis/parallax`, as `layoutSchema` is not exported; `BasisApp` renders the
  `Toaster`, so an app raises a toast without rendering one; and a cell's filter text is written with `numberText`,
  since the lint refuses `toFixed`. The form sample types its `defaultValues` by the schema's input, as
  `z.input<typeof settlementForm>`. What to do: an app that copied the old saved-views or form sample makes the same
  change; one that renders a second `<Toaster />` inside `BasisApp` removes it.

- The template's pages are each a `Page`, and its bond's terms a `DescriptionList`, as the `build-a-page` skill says;
  its `AGENTS.md` says where the app's name goes, and every app's `index.html` names an icon. The `build-a-page` skill
  says how a form field declares itself optional or nullable, and that an identifier column takes `identifier: true`.
  What to do: run `vp run sync`; an app made from an earlier template may give its pages the same shape, and its
  `index.html` an icon of its own.

- The shell grows for a data app. Give each route's content a `Page`, with its `title`, `description` and `actions`,
  and `layout="fill"` for a grid, pivot or chart that fills the window; `layout="scroll"`, the default, scrolls the
  content under the header, and content that is not a Page scrolls in the shell as before. A Page's `breadcrumb`, such
  as a bond's name once its query has it, titles the page's breadcrumb. `AppShell` takes `header`, `sidebarHeader`,
  `sidebarFooter` (in the user menu's place) and `collapsible="icon"`, and a route's `staticData.group` puts its page
  under that heading in the sidebar. A `PaletteCommand` takes `keywords`, `group`, `icon` and `shortcut`; the
  shortcut runs the command with the palette closed. The page shown is a `ShortcutScope`, so a page's `useShortcut`
  keys are its own and win over the app's; `ShortcutScope` does the same for a part of a page. Two shortcuts with the
  same keys in one scope log an `ERROR` line naming both: give one other keys. The shell's tooltips open after 400 ms,
  and a neighbour's at once. `toastError` raised again for the same error within 10 seconds counts on the open toast.
  On the sidebar's icon rail, a group's last item takes the pointer under the next group's hidden label. The shell
  passes `vp run shot`'s axe check: it has one `main`, its header is the page's banner, and its sidebar is a
  complementary landmark named by the app. A paged `DataTable`'s navigation is named by its `label`, as "Coupons,
  pages", rather than "Pages", the sidebar's.

- `basis:sessionchange` (`sessionChangeEvent`) is raised on `window` whenever the signed-in user becomes another user
  or nobody, with `{ userId }` as its detail. What to do: nothing.

- A sign-in adapter written as a class works: the shell calls `signIn.token()` through the adapter. What to do:
  nothing.

- A 204, a 205, or any response with an empty body, whatever its content type, gives a generated hook `data`
  undefined, where a 204 that FastAPI sends as `application/json` used to fail after the write had happened. A failed
  response whose body is not the JSON it claims, or is empty, is an `ApiError` with its status, so it is retried or
  answered as any other. What to do: nothing.

- An error page with no problem details, such as an ingress's 403 over HTTP/2, is shown by its status ("You do not
  have access to this"), not "Request failed", and an `ApiError`'s message says the status. A 422 that is not the
  validation shape keeps its title and detail. What to do: nothing.

- `arrowResponse(url)` asks a dataset route for Arrow as the generated client does, under `/api` with the user's
  token, and returns the response with its body unread, for `@basis/parallax`'s `useDataset` to stream:
  `useDataset("trades", async () => arrowResponse(getTradesUrl()))`. Inside `BasisApp` it is retried, reported and
  answered as a generated hook's request is, where a dataset's failure reached only its grid. What to do: nothing; a
  page that read a large table through the generated call's `Blob` may move to it.

- A telemetry collector that throws no longer stops a failed mutation's toast, or replaces the mutation's error: the
  shell writes it to the console and carries on. `BasisApp` reports the page's uncaught errors (`source: "page"`) and
  unhandled rejections (`source: "unhandled-rejection"`). What to do: nothing.

- Toasts show over every popup and dialog's veil, on a new layer, `z-notice`, so a failed save's error toast raised
  from a form in a Dialog is read and clicked, and clicking it no longer closes the Dialog. What to do: nothing.

- The preferences cookie an app keeps for itself, with no `preferencesDomain`, ends in `.host`, as
  `dark.compact.full.default.host`, and is read before a shared one, so an app on a host under another app's shared
  domain keeps its own choice. What to do: nothing; a test that reads the cookie's value expects the mark.

- Two more themes ship beside the default, `desk`, dense and dark-first, and `high-contrast`. The default has a look
  of its own: a slate neutral, white cards on a grey page, a deeper blue brand, vivid in dark mode with dark text on
  it. A status's colour, `text-warning` and its kin, is now its ramp's text step, and its solid fills only the
  environment banner, so `bg-warning` and its kin are darker than they were. Figures are tabular across the page,
  table headings are small and muted, and icons draw at a 1.75 stroke. What to do: nothing, unless a test reads a
  colour or an icon's stroke; `vp run shot --theme desk` shows a page in a theme.

- `applyPreferences` dispatches `themeChangeEvent`, `basis:themechange`, on the root element once it changes the mode,
  density, motion or theme shown, and `@basis/parallax`'s canvases read their tokens again on it. Code that changes the
  theme's tokens another way, such as by setting a variable on a wrapper, dispatches it on the document.
  `@basis/parallax`'s grid rows are now a medium control's height, 28 px compact and 32 comfortable, so a page's grids
  are as dense as its forms. What to do: nothing, unless a test reads a grid's row height in pixels.

- In a browser without `Temporal`, such as Chrome or Edge before 144, the page shows a line that names the browser it
  needs and the one it found, in place of an empty page: the head script checks before the app's modules load. The
  README's "Browsers" states the floor, Chrome and Edge 144 or later. What to do: nothing; `vp dev` and `vp build`
  write the new head script.

- A page in fixture mode that the browser gives no service worker, such as `vp dev --host` opened over plain HTTP by
  hostname, says "Fixture mode could not start" and the address to open instead, where it was blank. What to do:
  nothing.

- `vp dev`'s body-file route, `__basis/fixture-body/`, serves only a file inside `fixtures/` or `.fixtures/` by the
  path it resolves to, where an encoded `/` or `\` let a request read any file the developer could. What to do:
  nothing.

- `vp build --mode fixtures` builds the app in fixture mode, as static files whose `/api` MSW's worker answers from
  `fixtures/` and orval's handlers, with the fixtures' body files beside the page, for a demonstration with no backend.
  `.fixtures/` is never built in. What to do: nothing.

- New: `FilterBar`, a page's filters over its rows, kept in its search parameters. Declare the filters with
  `defineFilters` (kinds `text`, `choice`, `multiChoice`, `dateRange`, `numberRange`), give the route
  `validateSearch: filterSearchSchema(filters)`, pass `useFilters(filters)` to the bar, and keep the rows with
  `filterRows(rows, { filters, values, fields })`. Back and Forward restore the filters, typing is one history entry,
  and a value a stale link holds that a filter cannot take opens as no filter. Each active filter is a chip that clears
  it, beside Clear all. `filters.values` is a `FilterValues`, plain JSON for a saved view to store; `filters.setAll`
  restores one in one history entry. See the README's FilterBar section. What to do: nothing.

- FilterBar's range of numbers never writes a range whose Min is above Max: what was typed stays, so `5` on the way
  to `5mm` no longer blanks both inputs, and once the range is left inverted Max says "Max is below Min." What to do:
  nothing.

- `filterRows` reads an instant's date range by its date in New York, as `DateTime` shows it, not by the UTC date its
  ISO text begins with: `2026-11-10T01:30:00Z` is 9 November. What to do: nothing; a page that filtered timestamps by
  their UTC date now filters by the date it shows.

- Form fields bound to a TanStack Form field: `FormTextField`, `FormAmountField`, `FormDateField`, `FormSelectField`
  and `FormCheckboxField`, with `submitErrors` and `errorsOnFields` for a 422's errors; `UnsavedChangesGuard`, which
  asks before a page with unsaved changes is left; and `TypedConfirmDialog`, which asks for a name to be typed before
  an action that cannot be undone. `vp run new form` writes its fields with them, so a new form is a third the size.
  What to do: nothing; a form that binds its own fields can use them, as the README's "Building a form" shows.

- `FormSecurityField`, SecurityPicker bound to a TanStack Form field as the other form fields are, holding the chosen
  security's identifier, `itemKey`'s unless `itemValue` says otherwise. It shows the form's value: an edit form opened
  on an identifier finds its security through `search`, and `form.reset()` empties the picker with the field. What to
  do: nothing.

- `FormDateField` clears a date it refused, and its reason, on `form.reset()`. What to do: nothing.

- `AmountInput` keeps what was typed while a parent that keeps only numbers maps text to `null` or ignores it, so `-`,
  `(` and `1,` no longer vanish on the way to a number; a date field keeps a refused date and its reason while its
  parent ignores `null`. A value the parent sets otherwise replaces them. What to do: nothing; a page that kept an
  AmountInput uncontrolled to avoid this may hold its number.

- `parseAmount`, AmountInput and `amountSchema` refuse digits too many for a double, which read as `Infinity` and were
  sent as `null`. What to do: nothing.

- DateRangePicker's typed range and TypedConfirmDialog no longer submit a `<form>` they are rendered in: their own
  submit stops there. TypedConfirmDialog never confirms an empty `confirmText`, and matches a name with doubled or
  trailing spaces as its label shows it. What to do: nothing.

- DateRangePicker's presets never commit a range outside `min` and `max`: they count to the last business day on or
  before `max`, and a preset still outside the field's dates is disabled. What to do: nothing.

- MonthPicker's keyboard never leaves the months it takes: it opens on the month, or this one, within `min` and `max`,
  the arrows stop at a bound, and a year with no month it takes cannot be stepped to. What to do: nothing.

- MultiSelect says "All" and ticks Select all only when every option is chosen, not when as many values are held, so a
  saved value an option no longer has is not counted. What to do: nothing.

- A `SecurityPicker` with `multiple` takes a list of identifiers pasted at once, as copied from a sheet, and adds every
  security it finds, saying under the picker which identifiers found none. `EntityPicker` takes `onPaste`. A pasted
  list keeps a chip removed or added while it is looked up, stops when the picker goes, runs at most six searches at
  once, and searches through the app's query client. What to do: nothing.

- `MultiSelect`, several choices from a short list with "Select all" and a count; `NumberField`, Base UI's number field
  with buttons that step it; and `Toolbar`, with `ToolbarButton`, `ToolbarGroup` and `ToolbarSeparator`. What to do:
  nothing.

- `Tree` and `TreeSelect`, a node of a hierarchy, such as a book under its desk, chosen on the WAI-ARIA tree view's
  keys, with `TreeNode` for its nodes. What to do: nothing.

- `HeatCell`, a value's heat filling a table's cell on the theme's sequential or diverging scale, its ink measured to
  read on its step in the theme and mode shown; and `DescriptionList`, a detail page's facts, each term beside or
  above its value. What to do: nothing.

- `StatCard`, a dashboard's figure: its value in large tabular figures, its change with an arrow, a sign and the gain
  or loss colour, `rising: "loss"` turning that round, and its recent values as a sparkline, with a skeleton while it
  loads. What to do: nothing; a KPI card built from `Card` and `Sparkline` by hand can become one.

- `DataTable` sorts and filters by its columns' values as they are now when the columns change and the data does not,
  such as a spread from a benchmark the user changed, or names a second query brought. What to do: nothing.

- A DataTable state prop the app sets back to `undefined`, such as `page || undefined` or a saved view with no
  `filter`, returns the table to its default rather than to the table's own last copy. What to do: nothing.

- Shortcuts no longer repeat while a key is held, never run for a key a grid or chart already handled, and none run
  while a modal dialog is open. What to do: nothing.

- `SavedViews`, a menu of a page's saved views, with `browserViewStore` for this browser alone and `apiViewStore` over
  the app's API: apply a view, save the page's state as a new one, save changes to, rename, make the default or delete
  the one shown. A view's state is any JSON, a grid's, pivot's or chart's layout or a table's with its filter bar's
  values, read back through the page's own `parse`. What to do: nothing; `vp run docs SavedViews` shows it.

- SavedViews holds the view shown: stopping the default no longer deselects it, and a default another tab sets is not
  taken for this tab's view. A failed load says so in the menu, and a default that arrives after the user has changed
  the page's state is not applied. Its name dialog no longer submits a `<form>` SavedViews sits in when a view is saved
  by Enter. What to do: nothing.

- `browserViewStore` never writes back less than it read: a view the page's `parse` refuses, and a default it cannot
  show, stay stored, and unreadable text is kept aside under `KEY:unreadable:TIME` before a write replaces it. What to
  do: nothing.

- The sidebar and Ctrl+K list a nested route tree's pages once each: an index route under a parent by its parent's
  path, marked on the pages below it, and never a titled root or pathless layout route, whose titles stay their
  breadcrumbs'. What to do: nothing; an app that titled a layout route to hide its index loses the extra item.

- In a window under 768 px, choosing a page from the sidebar's sheet closes it. What to do: nothing.

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

- `formatThirtySeconds` keeps an exact tie at half an eighth a tie under a rounding other than half away from zero,
  and writes NaN and the infinities as `—` rather than throwing. What to do: nothing.

- `settlementDate` from a closed trade date counts its cycle from the next business day, so T+1 from a Saturday is
  Tuesday, not Monday. What to do: nothing, unless a page relied on the old day.

- `relativeTime` says "yesterday" only for the day before on New York's calendar (`timeZone` for another), and
  `isStale` takes a threshold in weeks or months without throwing. What to do: nothing.

- `ParallaxProvider` drops every dataset and view when `@basis/ui`'s shell says the signed-in user changed, with its
  `basis:sessionchange` event on the window, and each dataset loads again for the user now signed in, one that failed
  for want of a sign-in among them. What to do: nothing.

- `ParallaxProvider` mounts in the Node DOM that `BASIS_TEST_DOM=node` runs tests in: with no Web Worker it starts no
  engine, and its datasets wait as `loading` without calling their sources. What to do: nothing; a route check of a
  page with a grid now passes there.

- A view the engine refused to open, such as one whose saved layout names a column the API dropped, opens once its
  layout is corrected, and a view that refused a change draws again on the layout the engine kept. What to do:
  nothing.

- `Grid`, `Pivot` and `Chart` take `onError`, called with the reason they show in place of their data, or for a
  change the engine refused, each time it changes, and with null once it clears. What to do: nothing; a page that
  restores a saved layout may reset it there.

- A dataset whose fetch is on its way when the engine gives its memory back, in a planned restart, loads on the new
  engine rather than failing; `Restart`, which `ParallaxClient.onRestart` hears, gains `planned`. A dataset whose last
  component unmounts while its fetch is on its way is not loaded when the bytes arrive. What to do: nothing.

- Parallax gives up recovering from an engine that keeps running out of memory after the third restart in a run, each
  within five minutes of the one before, where it was three within a minute, so a large table that traps the engine
  each time it loads again stops being fetched. What to do: nothing.

- `reload()` reloads a dataset for every component that shows it, and components that show the same data share one
  load however many restarts each has seen. Bytes past the byte limit are refused before they are copied. What to do:
  nothing.

- `ParallaxClient`, `useParallaxClient`, `ClientOptions` and `Restart` are no longer exported from `@basis/parallax`,
  since closing the engine, or loading and unloading behind the hooks, left them showing what it no longer held; they
  are in `@basis/parallax/internals`. `ViewHandle` is a type of what a view's `handle` offers, without the methods the
  engine's connection calls, and `ChartWindow` and `Measurement` are exported. What to do: nothing; a tool that needs
  the client imports it from `@basis/parallax/internals`.

- `@basis/parallax` exports `PerformanceOverlay`, the demo's performance overlay, for an app to show from a tool such
  as a palette command; every grid's drawing counters reach it with no `ref`. What to do: nothing.

- `@basis/parallax`'s grid: a right click on a cell opens its menu (copy, copy with headers, filter by the value or
  exclude it, sort, pin, fit, export, and the app's `contextMenuItems`); `onCellClick`, `onRowActivate` and
  `onContextMenu`; `GridHandle.scrollTo`, `getSelection` and `copy`; and a drag that selects past the edge scrolls. A
  layout's `cells` draws a column as a data bar, a heat fill, a badge, a sparkline or a link, and its `rules` style
  cells by value, in the grid and in the Excel export; the theme gains `positive`, `warning` and `info` inks and their
  tints. Row selection holds every row but some: `onRowsChange` gets a `RowsChosen`, and `selected` takes one, so the
  header's checkbox checks every row of a flat view without fetching a key. What to do: nothing.

- With `selectable="single"`, the row chosen stays chosen through a sort, a filter or a reload; it changes only when
  the user moves the focus. What to do: nothing.

- At 125 % and 150 % scaling, past about 535,000 rows, a click, a hover or a menu lands on the row drawn under the
  pointer, where it could take the row below. What to do: nothing.

- A column's typed condition is read as the column shows its values: separators, `%`, `bp`, `K`, `M`, `B`, 32nds and
  parentheses, and a bare number in a percentage, basis-point or abbreviated column at the column's scale, so 5 in a
  yield shown as 5.25% means 5%. A value the engine refuses shows its reason beside the box. Escape cancels a typed
  value, and leaving an unchanged box no longer clears a filter. What to do: nothing.

- "Filter by" and "Exclude" filter by the cell's exact value, so a time, a decimal shown with separators and a large
  integer filter as they should. What to do: nothing.

- A grid's copy prefixes a text cell that starts like a formula, `=`, `+`, `-` or `@`, with `'`, as `@basis/ui`'s CSV
  and TSV writers do, so it pastes into Excel as text; numbers are copied as they are. The menu's Copy and
  `ref.copy()` say in the status bar why a copy failed, and a selection is kept to the cells the view has after a
  filter or an ungroup, so it copies. What to do: nothing.

- A cut cell's tooltip goes when the grid scrolls, rather than staying beside another row's cell with the number of
  the one it was about, and rows a late frame fills are drawn rather than left blank. What to do: nothing.

- The grid's keyboard: Ctrl+Space checks every row, as the header's checkbox does; Enter on a link cell clicks it;
  Shift+F10 or the Menu key opens the focused cell's menu; with nothing selected the first key selects the first cell
  rather than activating or moving from row 0; Alt with an arrow is the browser's again. A screen reader hears how the
  focused cell's column sorts and filters. What to do: nothing.

- A layout the engine refuses, such as a saved one whose sort or pin names a column the data dropped, shows its reason
  with a button that clears its sorts, filters, groups and pins. What to do: nothing.

- An auto-height grid grows to 8,192 CSS pixels at most, whatever its `maxHeight`, so its canvas stays within what a
  browser draws. The last column shown can no longer be hidden, which showed every column. What to do: nothing.

- A grid's "rows to come" no longer reads low for a compressed response from another origin: its length counts only
  when the API exposes `Content-Encoding` as `identity`. What to do: nothing.

- A chart whose values are a few units in the last place apart, such as a sum of weights that reads 1, no longer hangs
  the tab: it draws a flat line on an axis centred on the value. Values past a thousand trillion, or a range finer than
  twelve decimals, label their axis in scientific notation. What to do: nothing.

- A line or area chart's `hidden` holds each series by its key: the series column's value on a chart of one column,
  such as `"AAPL"`, the column's name for a series not split, and the column and the value, as `"close AAPL"`, on a
  chart of several. A series hidden by its legend label, as saved layouts hold them, is still hidden. Hiding a series
  hides its indicators and events with it, and the measure tool measures the series pressed. What to do: nothing; a
  layout written by hand may name its series by key.

- A bar chart, heatmap, pie or waterfall draws every group of its grouped view, up to 2,000 groups and 400 series,
  where it drew the first 499 groups without a word. Past the limit it draws none and says what to change in place of
  the plot. What to do: nothing; a chart of more groups filters its rows or keeps the largest with `top_n`.

- `<Chart rows>` reads only the columns it plots, so an API's typed rows, with optional or nested fields, are taken as
  they come; `ChartRow` is any object. A column of mixed values, or a date that is no day, shows in place of the plot
  and goes to `onError`, where it threw from render or drew from 1970. Text dates are dates on every chart, a
  waterfall's included. Each chart keeps its own table, so a page of many small charts loads each once. What to do:
  nothing; a line of text tenors gives `settings={{ axis: "tenor" }}`, as the chart now says.

- A histogram or area on a log axis shows its smallest values, such as a bin of one row, where they had no height; a
  scatter's log axis fits its dots though one is at or below zero, and a density, which stays linear, says so. What to
  do: nothing.

- Over a chart that shows everything, the wheel scrolls the page, and with Ctrl, Cmd or Alt the wheel and the keys are
  the browser's (zooming the page, going back). A pan that loses its pointer, as to a remote desktop's change of focus,
  ends. What to do: nothing.

- A pie labels its slices with shares only when its second measure is the first's share of the grand total, and with
  their values while a slice is hidden, where it labelled a half of the ring "25.0%". What to do: nothing; a pie that
  wants shares gives `{ ...first, show_as: "percent_of_grand_total" }` as its second measure.

- A chart's text alternative reads a histogram's rows and fullest bin and a density's dots, and leaves out what the
  legend hides. Crosshairs move together only between charts whose axes share a calendar, session or tenor spacing.
  What to do: nothing.

- `@basis/parallax` loads Arrow it refused or trapped on before: a dictionary-encoded text column that is null in every
  row, as `dictionary_encode()` of an empty column or an all-null pandas categorical sends it, and an Arrow `null`
  column, which loads as text with every value blank. A table whose columns repeat a name is refused, naming the
  column, where it showed the first column's values twice. What to do: nothing; an API that sends a repeated name gives
  each column its own.

- A chart leaves out a date or instant more than a million days from 1970, before year 1232 or after 4707, as it leaves
  out a null, where one such value, such as a 9999-12-31 sentinel or nanoseconds sent as microseconds, stopped the
  engine; the grid still shows such a value as out of range. What to do: nothing.

- `@basis/parallax`: a grouped grid or pivot whose groups' totals would take more than 256 MB, such as a million rows
  grouped by their own id with float sums, is refused with a message that says so and what to change, where it could
  stop the engine. A text column whose values change on every reload no longer grows the engine's memory with each.
  What to do: nothing; a layout refused this way groups by fewer or coarser columns, or filters first.

- `vp run verify` and `vp run budget` end, with their `ERROR` line, when Chromium cannot start; before, the budget's
  server held the task open and the push hook hung with it. What to do: nothing.

- `vp run verify`'s client and lint stages fail when their tool fails with no report to read, as a client check whose
  child cannot start, or a lint whose type-aware pass crashes; before, both passed. What to do: nothing.

- `vp run doctor`, `vp run upgrade` and verify's record name git's own refusal of a clone, such as one it holds to be
  another user's, with `git config --global --add safe.directory`, rather than calling it no clone; and the files not
  committed that stop an upgrade or a record, with `.git/info/exclude` for a file git should never see. What to do:
  nothing.

- A task whose scratch folder a virus scanner holds a moment too long no longer fails for it: the folder is removed
  with retries, and left to the system when it cannot be. What to do: nothing.

- `vp run shot` stops the `vp dev` it started, and everything that one started, on Windows too, and when it is
  interrupted; before, on Windows, the task wrote its files and never exited, leaving a dev server on the port. It runs
  `vp dev` from the app's own Vite+. `vp run shot /route` in Git Bash, which rewrites the route into a Windows path,
  takes the route back. What to do: nothing.

- `vp run docs NAME` prints one component, hook, function, type or module from the installed catalogue, such as `vp
  run docs Select`, `vp run docs numberText`, `vp run docs DataTableColumn` or `vp run docs dates`: what it is for,
  when to use it, what goes with it, its props with their defaults, its variants and an example. `vp run docs --search
  WORDS` finds entries and README sections by what they are for, and `--json` prints either as JSON. A name it does
  not have fails with the closest names it has. README sections print as before, by `ui/SLUG` or `SLUG`. What to do:
  nothing.

- `@basis/ui/catalogue.json` is now `basis-ui-catalogue/2`. A component lists the props it takes from Base UI, with
  `from: "@base-ui/react"` and their `default`, so `Select` shows `items`, `value` and `onValueChange`; `extends` keeps
  only what is not listed, such as `ComponentProps<"div">`. Components gain `module`, `use` and `with`. New lists:
  `functions` (hooks, functions, classes and constants, with signatures), `types` (every type an entry names, with its
  fields, such as `DataTableColumn` and `DisplayFormat`) and `modules` (each subpath and what it is for).
  `@basis/parallax`'s components, hooks and types, every `LayoutInput` field among them, are in it under `module:
  "@basis/parallax"`. A reader of format 1 reads `components[].props` and `icons` as before. What to do: nothing.

- The lint asks less of a page and says more when it refuses one. In app code a function may run to 200 lines, blanks
  and comments aside, with a complexity of 30 and 4 parameters; `a`, `b`, `e`, `k`, `v` and `_` are names; a number
  inside JSX needs no name; and only exported functions need a return type. A class that restyles a component names
  its variants and sizes and `vp run docs NAME`; a raw colour or a missing shadow names the tokens it means, such as
  `text-loss` or `bg-destructive` for red, and `shadow-sm` or `shadow-md`; `fetch` is refused by `basis/no-fetch`, so
  a disable comment for it names that rule, not `eslint/no-restricted-globals`. What to do: nothing.

- A UI repo is made with `vp dlx @basis/create NAME`, `@basis/create`'s own creator, which copies the template into
  the folder NAME, renames `_gitignore` to `.gitignore`, names the package and the page after the folder, and runs
  `git init`; CI makes an app with it from the packed packages, on Linux and on Windows, and runs `vp run verify`,
  `vp run shot --all` and `vp build` in it. `vp create @basis:app` no longer offers the template: Vite+ 1.5.0 rewrites
  every app it makes into a configuration the drift check refuses. What to do: nothing; an app with no `.gitignore`
  runs `vp run sync`, which writes it.

- The template's sample, and the example, pin basis's example API at its release, `v0.1.0`: its numbers may be null,
  and its coupons show every kind of display format. What to do: nothing; an app made from the template before has its
  own API's document.

- The README holds only what an app needs. How the package is built and how a component or icon is added moved to
  basis-ui's `packages/ui/CONTRIBUTING.md`, which does not ship. What to do: nothing.

- `@basis/ui`'s package carries culori's licence, in `licenses/culori/LICENSE`, beside the code its build bundles from
  it. What to do: nothing.
