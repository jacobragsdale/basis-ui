# Roadmap

This roadmap is the build order for basis-ui: six phases, the steps in each, what each step needs first, and when it is
done. Steps in different lanes run at the same time. For the reasons behind each piece, see [the design](design.md).
basis has [a roadmap of its own](https://github.com/jacobragsdale/basis/blob/main/docs/roadmap.md), and the two meet at
the contract (basis's step 2.5, which this roadmap's step 1.3 builds on) and the pilot (basis's step 2.8 and this
roadmap's step 3.2).

Steps marked **(work)** need the firm's environment: a Citrix desktop, the internal npm feed and Azure DevOps pipelines,
the AKS cluster, the sign-in system, or the Angular library and apps. They are the maintainer's to run or hand on, with
the exact commands to run and what to send back. Every other step runs here, and this repo's own CI runs on GitHub
Actions.

## Lanes

| Lane        | Builds                              | Phases  |
| ----------- | ----------------------------------- | ------- |
| A. UI       | `@basis/ui`                         | 1, 3, 5 |
| B. Parallax | `@basis/parallax`                   | 2       |
| C. Ports    | the firm's Angular library and apps | 4       |

The critical path runs through lane A: the Vite+ and orval spikes, the workspace, the preset, the shell, fixture mode,
screenshots, the firm's components, the template, and the pilot. Parallax runs alongside phase 1 once the preset exists,
and the ports start at the firm as soon as the base components set the patterns. The eval's UI tasks run in basis's eval
lane, against this roadmap's pilot.

```mermaid
flowchart TD
  s01[0.1 Vite+] --> u2[1.2 preset]
  s02[0.2 orval] --> u3[1.3 app shell]
  s03[0.3 parallax alone] --> p3[2.3 browser source]
  s04[0.4 WSL screenshots, work] --> u6[1.6 screenshots]
  u1[1.1 workspace] --> u2
  u2 --> u3 --> u5[1.5 fixture mode] --> u6 --> u7[1.7 template and tasks] --> u8[1.8 releases] --> l1[3.1 pilot UI]
  u2 --> u4[1.4 theme and base components] --> c1[4.1 library port, work]
  u3 --> u10[1.10 firm components]
  u4 --> u10 --> u7
  p1 --> u10
  u3 --> u9[1.9 sign-in, work]
  u1 --> p1[2.1 move parallax] --> p2[2.2 delete the server] --> p3
  p2 --> p4[2.4 export in wasm]
  u2 --> p5[2.5 React foundation]
  p3 --> p5 --> p6[2.6 component families] --> p7[2.7 demo and release]
  p6 --> p8[2.8 fixed income]
  u3 --> u16[1.16 ctzd's surface]
  u2 --> u14[1.14 tests without a browser]
  u10 --> u15[1.15 component catalogue]
  u10 --> u12[1.12 numbers as doubles] --> u13[1.13 display formats]
  p8 --> u12
  l1 --> l2[3.2 pilot in QA, work]
  l2 --> c2[4.2 app ports, work]
  c1 --> c2
  p7 --> c2
  l2 --> g[5 upkeep]
```

## Rules for working in parallel

1. Each step is one branch and one git worktree, named after its id, such as `1.3-app-shell`, and merges to `main`
   through a pull request whose CI is green.
2. Changes to the preset in `@basis/ui` land one pull request at a time, since every app and parallax build on it.
3. Steps in the same package split by module or component family, so that two agents never edit the same files.
4. A step ends with the repo's checks green and its docs updated. A spike ends with its written result in
   `docs/spikes/`.
5. A step marked **(work)** goes to the maintainer as a list of commands to run and what to send back.

## Phase 0: spikes

Every spike runs at once. Each writes `docs/spikes/NAME.md` with the versions it used, a yes or no for each question,
and the fallback for each no.

1. **0.1 Vite+.** Create a React app with `vp create` and answer:
   - which of Oxlint's rules conflict at the design's strictest settings, and which one of each pair to turn off;
   - whether type-aware Oxlint and tsdown's declaration files work on the TypeScript 7.1 beta;
   - whether the React Compiler's `panicThreshold: "all_errors"` fails a build on a component that breaks its rules;
   - whether Oxlint has `no-restricted-imports` and `no-restricted-globals` built in;
   - whether a preset spread into `vite.config.ts` can add `vp run` tasks, and whether `vp create` accepts a template
     from a package;
   - whether Vite+'s hooks install on a fresh clone through `prepare`;
   - whether `@shadcn/lint` runs under `vp lint` through `lint.jsPlugins`, finds components imported from a package
     and the theme in that package's CSS, and whether a token declared in an app's CSS still hides the package's tokens;
   - whether removing Tailwind's palette and blur utilities makes `no-unknown-classes` reject them, and whether `dark:`
     variants can be made a lint error;
   - whether TanStack Form and TanStack Table v9 build under `panicThreshold: "all_errors"`.

   **(work)** On a Citrix desktop, on Windows and in WSL: install `vp` without admin rights, run `vp install` from the
   internal npm feed, and install the hooks on a fresh clone. Done when the result names the exact Oxlint configuration,
   as the preset step 1.2 starts from.

2. **0.2 orval.** Write a FastAPI app with strict models, operation ids taken from handler names, a list endpoint and an
   endpoint that returns Arrow. Generate its client with orval while TypeScript 7 is installed, and check for Zod 4
   schemas that drop unknown fields, TanStack Query v5 hooks, MSW 3 handlers, and a binary response for the Arrow
   endpoint. Done when the result holds the orval configuration step 1.3 uses, and its sample `openapi.json` stands in
   for basis's until basis's step 2.5 publishes one.
3. **0.3 Parallax alone.** Load Arrow bytes into parallax's worker with no server, build `parallax-export` for wasm32
   with rust_xlsxwriter's in-memory mode and save an xlsx from the browser, and measure the largest table that loads and
   pivots within the existing budgets in headless Chromium with software rendering. Measure, too, how long a page with
   one small chart takes to download and compile the wasm and draw the chart. **(work)** Repeat both measurements on a
   Citrix desktop. Done when the result states the row limit and the first chart's time.
4. **0.4 WSL screenshots (work).** Screenshot the same page with the same pinned Playwright Chromium and bundled fonts
   in WSL on two Citrix desktops, and compare. Done when the result says whether baselines made on one desktop hold on
   another.

## Phase 1: @basis/ui

Lane A. Steps 1.3 and 1.4 run at once, and so do 1.8 and 1.9. Steps 1.12 to 1.16 come from ctzd becoming basis-ui's
second consumer on 2026-11-07: 1.12 and 1.13 wait on basis's contract, and 1.14 to 1.16 run at once.

1. **1.1 Workspace.** Set up `packages/ui` in a pnpm workspace, with GitHub Actions CI that runs only the jobs whose
   paths changed, and this repo's own hooks. Done when an empty package passes CI.
2. **1.2 Preset.** Add the Vite+ preset from spike 0.1, as a function that an app's `vite.config.ts` spreads in: the
   Oxlint and Oxfmt configuration with `@shadcn/lint`, the strict tsconfig, the React Compiler with its
   `panicThreshold`, the `vp run` task slots, the library build with tsdown, and Vitest's browser mode with the
   Playwright provider. Needs 1.1 and spike 0.1.
3. **1.3 App shell.** Add TanStack Router and Query; spike 0.2's orval preset and custom fetch, which attaches the JWT;
   a sign-in adapter interface with a fake for tests; error display that reads RFC 9457 problem details; telemetry; and
   the restricted imports and globals that keep feature code on the generated client. Needs 1.2 and spike 0.2.
4. **1.4 Theme and base components.** First the theme, as the design describes it: the ramp generator and its inputs,
   the semantic tokens in both modes, the two densities, the mode and density cookie with the script that applies it
   before the first paint, and the theme's checks. Then the gallery app, with its screenshots in both modes and both
   densities and the axe check. Then shadcn's components on Base UI, one family per agent at once (forms and inputs,
   overlays and menus, navigation and layout, feedback and display), each with its `no-restyle` contract and its gallery
   page. They set the patterns the library port follows. Needs 1.2.
5. **1.5 Fixture mode.** Fixture mode answers from the records in `.fixtures/`, then the synthetic responses in
   `fixtures/`, then orval's MSW handlers. Records and fixtures share basis-ui's record format, which `@basis/ui` ships
   as a JSON Schema for basis's `basis records export` (its step 4.2) to write. `vp dev` starts the app on fixtures on
   a free port per worktree. Needs 1.3.
6. **1.6 Screenshots.** Add `vp run shot ROUTE`, writing a screenshot, the accessibility tree and the console errors.
   Visual baselines are made and compared in WSL only, per spike 0.4, and `vp run check-full` says so on Windows. Add
   the skill for driving an app with Playwright CLI. Needs 1.5 and spike 0.4. `vp run shot` and the skill are built;
   the visual baselines wait for end-to-end tests to return. Open for the maintainer's review: the axe check that the
   design has each shot run, failing on a violation, is not built, since it adds `axe-core` as a new dependency; it
   comes back with the end-to-end tests and gates.
7. **1.7 Template and tasks.** Add the UI repo template as an `@basis/create` package, which `vp create @basis:app`
   reads from a registry, per spike 0.1, with:
   - its managed-file headers and drift check;
   - the `AGENTS.md` block, and the skills with their `.claude/skills/` copy;
   - Vite+'s hooks installed from `prepare`, with a commit hook that runs `vp staged`, `vp check` and `vp test`, since
     Vite+ scaffolds only `vp staged`;
   - a `.gitignore` that names `.fixtures/`, whose records hold client data;
   - the Dockerfile serving the built files, and `azure-pipelines.yml` with a `vp run check-full` stage ready for when
     CI exists;
   - the tasks `client-pull`, `review`, `sync`, `upgrade`, `doctor` and `docs`.

   Needs 1.6 and 1.10. Done when a generated UI repo passes `vp run check-full` in WSL, `vp dev` serves its fixture
   pages, and its image serves the build.
   The template is built and checked here, outside the workspace, against the packed tarballs: `vp run check-full`
   passes, `vp dev` serves its pages in fixture mode, and its Caddy image serves the build with br and gzip, the hashed
   assets immutable, every other path `no-cache`, a missing asset a 404 never cached, and index.html for the app's
   routes. The template ships a sample API, basis's example document with its generated client and fixtures, so the
   shell's home page and two pages calling the API show data in fixture mode before an app has an API, and its
   `AGENTS.md` says how to replace it with `vp run client-pull`. The tasks are built, each failure one `ERROR` line
   ending with its fix: `vp run sync` writes the framework's files from the installed `@basis/ui`, each opening with
   basis-ui's marker, and removes those an earlier version wrote; `vp run check-full` runs `vp run sync --check` first,
   and ends by recording the commit it passed on; `vp run review` prints a pull request's summary for a checked commit;
   `vp run doctor` checks git, the hooks, the installed versions, Playwright's Chromium and `BASIS_API_URL`; `vp run
   docs` lists and prints the installed READMEs' sections; and `vp run upgrade` moves `@basis/ui` and `@basis/parallax`
   to the feed's latest release, or a named one, then syncs and checks. Each ran in a generated repo outside the
   workspace, upgrade against a throwaway local registry; the push hook, which runs `vp run check-full`, has never run
   on a push. Not yet: `vp create @basis:app` needs the registry of 1.8; `check-full` in WSL and on Windows; screenshot
   diffs in `review`, which wait for the visual baselines of 1.6; and the pipeline, which has never run. Open for the
   maintainer's review: pnpm 12 holds back a version younger than its `minimumReleaseAge`, which `vp run upgrade`
   passes by naming the exact version, and pnpm then lists it under `minimumReleaseAgeExclude` in the app's
   `pnpm-workspace.yaml`; whether the firm's feed should be excluded for `@basis/*` instead.

8. **1.8 Releases.** One tag releases every package, `@basis/create` included, at one version. **(work)** Publish to
   the internal npm feed through Azure DevOps. Needs 1.7. Done when `v0.1.0` installs from git here and from the
   internal feed at the firm.
9. **1.9 Sign-in (work).** Write the adapter for the firm's sign-in system, against the interface from step 1.3. Needs
   1.3.
10. **1.10 Firm components.** Build the components shadcn does not have, one group per agent at once:
    - numbers and dates: the display components, the TypeScript formatter tested against fixtures written by parallax's
      Rust formatter, the number inputs, the as-of date picker and the date ranges;
    - forms: fields bound to orval's Zod schemas, the unsaved-changes guard and typed confirmation, and errors placed on
      the fields a 422's `errors` names, as basis's contract gives them;
    - data: `DataTable` with its row cap, the entity picker, and file import;
    - the shell's parts: sidebar, breadcrumbs, user menu, environment banner, command palette, filter bar, saved views,
      split panes and shortcuts;
    - query states, `Sparkline` and the in-cell bar.

    Each has its gallery page. Needs 1.3, 1.4, and 2.1 for the formatter's fixtures. On 2026-11-08 the shell's parts were built
    but for the filter bar, saved views and split panes: `AppShell`, with the sidebar, breadcrumbs and command palette
    built from routes' `staticData`, the environment banner, the user menu and the shortcut registry with its `?`
    list, used and tested by the example app; t1b built `Sparkline`, `CellBar` and `QueryState`.

11. **1.11 Utilities.** Build the four modules the design's Utilities section lists, two agents at once: `dates`, with
    the SIFMA calendar first since the firm trades US fixed income, then the NYSE's and TARGET2's, alongside
    `securities`; then `numbers` and `utils`. `Decimal` is checked against fixtures Python's `decimal` module writes,
    and each calendar against its published holidays. The imports they replace are added to the preset's
    `no-restricted-imports` in a pull request of its own. Needs 1.2.

12. **1.12 Numbers as doubles.** Bring `@basis/ui` to the design's [Numbers](design.md#numbers) rule:
    - `Num`, `Money`, `Pct`, `Bps`, `Price32` and `DataTable`'s number columns take a number, and the decimal-string
      path for API values goes;
    - `Decimal` and its tests against Python's `decimal` go, by the maintainer's choice on 2026-11-07, since no API value needs one;
    - `AmountInput` and its schema return a number: the text is parsed exactly, by moving the decimal point by its suffix's power of ten, then converted.

    In a pull request of its own, as every preset change is, the preset rejects `toFixed`, `toPrecision`, `toLocaleString`, `Math.round` and `Intl.NumberFormat` in app code, each error naming the component to use, and for `Math.round` also `Math.floor` and `Math.trunc` for integers that are not shown. The
    example app's pinned `openapi.json`, fixtures and pages move to basis's float64 contract, along with the
    service-error problem types basis added since the pin. Needs basis's step 2.11 and 2.8.3. Done when no API value
    in the example app is a string of digits and the lint's errors have tests. Built on 2026-11-08, the lint included
    (`eslint/no-restricted-properties`, tested through `packages/consumer`, with `numberText` for numbers in text):
    the components, DataTable, AmountInput and `amountSchema` take and give numbers, `Decimal` is deleted (32nds, tick
    rounding and shares work on exact BigInt digits inside), and the example app runs on basis's float64 document.

13. **1.13 Display formats.** Read the `basis.format` object the design describes:
    - one TypeScript type, shared by `@basis/ui` and parallax, read from an Arrow field's metadata and from
      `x-basis-format` in the API's document;
    - the number components and `DataTable` take it;
    - parallax's grid, pivot and charts format a column by its metadata unless a layout sets a format.

    The example app shows a dataset whose columns format themselves. Needs 1.12, and basis's step 2.13 for real
    metadata; until then the tests write it into their Arrow. Built on 2026-11-08: parallax keeps Arrow field metadata
    and resolves `basis.format` as each column's default format (`parallax-protocol`'s `display`); `@basis/ui` has
    `DisplayFormat`, `readDisplayFormat` and `Formatted`, `DataTable` columns take `format`, and `client-pull` writes
    `displayFormats` from `x-basis-format`; the example's bond page shows its coupon schedule by the Arrow's formats.

14. **1.14 Tests without a browser.** Add a Vitest setup beside `basisTest()`'s Playwright one, for laptops with no
    Chromium, in a DOM implemented in Node. The DOM library is chosen by measuring the gallery's component tests in
    it, and mirrored like the other large packages. `@basis/ui`'s components render and their interactions run there.
    Parallax's components need a canvas and a worker, so under it they render their text alternative and say that
    their pixels need a browser. Done when the example app's tests pass in both setups. Needs 1.2. Built on 2026-11-08:
    happy-dom (it and jsdom both passed Base UI's Dialog, Select, Combobox, Tabs and DataTable; happy-dom ran faster
    with far fewer dependencies), `basisTest({ browser: false })` or `BASIS_TEST_DOM=node`, `@basis/ui/testing`
    (Testing Library, `renderApp`, `mockApi`), and the lint rule that keeps Vitest's browser API in
    `*.browser.test.tsx` files (t18's decision); the example's page tests pass in both runs, CI running the Node one.

15. **1.15 Component catalogue.** `vp run @basis/ui#catalogue` writes a JSON catalogue of every exported component,
    from the source's types and doc comments: its name, what it is for, its props with their types and docs, its
    variants, and one example per family. The catalogue ships in the package, and a test fails when it is stale, when
    a component lacks a purpose or a family an example, or when an example does not type-check. Needs 1.10. Built:
    `catalogue.json`, read by `src/catalogue/` with oxc's parser, 317 components in 63 families and 92 icons, each
    example type-checked in `packages/consumer`.

16. **1.16 ctzd's surface.** Keep working what the design's [Consumers](design.md#consumers) section says ctzd uses:
    - a test app in this repo whose `vite.config.ts`, `tsconfig.json` and `styles.css` are exactly the lines
      `packages/ui/README.md` shows, checked, tested and built in CI (built: `packages/consumer`, held to the README by
      `@basis/ui`'s `readme-config` test);
    - an anonymous sign-in for `BasisApp` (built: `anonymousSignIn()`);
    - a test for each error the preset adds, and for the React Compiler's bail-outs, that the message names its fix
      (built: `tests/preset-errors.test.ts` lints a probe in `packages/consumer`, and `basisPlugins()` wraps the
      compiler so each bail-out opens with an `ERROR` line naming the fix, which `tests/compiler-fixes.test.ts` checks
      in a real build).

    Needs 1.3. Until 1.8 publishes the packages, ctzd installs them from tarballs that `~/dev/basis-ui-dist/pack.sh`
    packs from `main` on the build host.

## Phase 2: parallax in the browser

Lane B. Needs step 1.1 to move in, spike 0.3 for the browser source, and step 1.2 for the React layer. It runs alongside
phase 1.

1. **2.1 Move parallax.** Bring parallax into `packages/parallax` with its history. Its Rust and wasm builds run in CI
   only when its paths change.
2. **2.2 Delete the server.** Remove `parallax-server`, `parallax-sources`, the client's server paths, the registry,
   `/copy` and `/export`, and CI's database containers. Done when the engine, session and protocol tests pass, the
   DuckDB comparisons included.
3. **2.3 Browser source.** Load Arrow bytes from the app, which passes in its load status, and enforce the row limit
   from spike 0.3 with a clear error. Needs 2.2 and spike 0.3.
4. **2.4 Export in wasm.** Move xlsx and CSV export into the wasm build, as spike 0.3 found it works. Needs 2.2, and
   runs alongside 2.3.
5. **2.5 React foundation.** Add the provider, the worker connection and the hooks every component uses. Needs 2.3 and
   1.2.
6. **2.6 Component families.** Port four families at once, one agent each:
   - the grid, with its filters, toolbar, menus and column tools;
   - the pivot, with its group menu and field list;
   - charts, with technical-analysis panes and drawings, the small-data `Chart` API, the text alternative for screen
     readers, and colours read from the theme's tokens;
   - the shared pieces.

   Each family's existing Playwright specs and pixel baselines are rewritten for React. Needs 2.5.

7. **2.7 Demo and release.** Rebuild the demo as a React app on `@basis/ui` with fixture data, with its screenshot tests
   at threshold 0, and delete the Angular layer. Release `@basis/parallax` with the next basis-ui version, which step
   1.8's releases make. Needs 2.4 and 2.6. The demo and the deletion are done: the demo is `packages/parallax-demo`,
   and [the design](design.md#parallax-basisparallax) records what was removed.
8. **2.8 Fixed income.** Seven additions that fit parallax's charts to the firm's desks, from a study of what Aladdin,
   PORT, Yield Book, FactSet, BarraOne, ICE and Marquee show fixed-income portfolio managers and traders. Analytics stay
   in the API, which sends them as columns: curve fits, key-rate durations, scenario P&L and attribution. Parallax
   draws columns, and live updates stay deferred. Needs the charts of 2.6, and runs alongside its other families and
   2.7.

   The additions land one pull request each, in the order below, each on a branch and worktree named after its id. A
   step that needs an earlier one's code branches from that step's branch until it merges. They follow four rules:
   - **Layouts.** Changes are additive and stay at version 2. A new field defaults to what its absence meant and is
     left out of a layout written without it, so the committed fixtures read every layout as before, and a reader that
     lacks the field refuses a layout that sets it, as `deny_unknown_fields` already makes it do. Layouts that set the new fields go in `tests/fixtures/layouts-2.8.json`, which only the React layer reads.
   - **Frames.** A change to frames keeps the native and wasm transcript fingerprints in step.
   - **Data.** `parallax-datagen` writes the data the new views draw, as deterministically as its other datasets:
     `bonds`, a row per bond with its CUSIP, issuer, sector, rating, coupon, maturity, tenor bucket, duration, yield,
     spread, the fitted curve's spread at its duration, DV01 and par; `curves`, Treasury curves on several dates with
     each point's change in basis points; and `attribution`, P&L explained by factor.
   - **Screenshots.** Each new view is a card on a fixed-income page of the charts' end-to-end harness, with its specs
     beside the others in `tests/e2e/charts/` and its screenshots in light and dark at threshold 0.

   The steps:
   1. **2.8.1 Scatter points** (`2.8-scatter-points`). A scatter with at most 5,000 rows in the range shown draws each
      row as a dot; past that, it stays a density. This is the relative-value view, rich or cheap to a curve.
      - Layout: `size`, a numeric column whose magnitude sets each dot's area, such as DV01 or par; `id`, the column
        naming each dot, such as the CUSIP, which titles its tooltip and is what a click selects; `tooltip`, more
        columns the tooltip lists; and `fit`, a column holding the API's fitted curve at each row's x, drawn as a line
        per series. `series` colours the dots and names them in the legend.
      - Engine and session (`chart.rs` in each): `ChartData::Points` below the cap, the points' batch with every value
        as the engine's text and the id as exact JSON, sizes as shares of the largest magnitude in the whole chart so
        that zooming keeps a dot's size, and the fit reduced with M4 in both forms.
      - React: the points' model and painter, hit-testing to the nearest dot, the tooltip, selection through
        `onSelect` with the id column and value, and the text alternative.
      - Tests:
        - Rust: the cap in both directions, the sizes, the frame's texts, and M4's guarantee for the fit line. The
          transcript's scatter becomes points, so both fingerprints change.
        - Unit: the model and hit-testing.
        - Browser: hover and click.
        - End-to-end: a rich/cheap card over `bonds`, with spread against duration, coloured by sector, sized by DV01,
          and the fitted curve. Its specs hover and select a bond.
   2. **2.8.2 Tenor and rating order** (`2.8-orders`). Text keys sort alphabetically, so a DV01 ladder reads `10Y, 1Y,
      20Y, 2Y` and ratings put `A` ahead of `AA`.
      - Layout: `orders` sets a text column's order by name: `"tenor"`, by length, read as `@basis/ui/dates` reads a
        tenor; `"rating"`, best first, on S&P's and Fitch's scale and Moody's; `{"values": [...]}`, as listed; or
        `{"by": "column"}`, by another column's smallest value among a key's rows. Keys an order cannot place come
        after the rest in text order, and nulls last.
      - Where orders apply: group keys at every level, column pivots, flat and detail sorts, a chart's series, and the
        categories of bars, heatmaps and pies. Filters still compare text.
      - The tenor axis: `axis: "tenor"` places an x column of tenors, as text such as `3M` or as years, with the
        engine's ticks labelled `3M` to `30Y`. `tenor_spacing: "even"`, the default, puts the curve's standard tenors
        one step apart and places a value between them by length; `"length"` places it by its length in years.
      - Engine (`dictionary.rs`, `view.rs` and `chart.rs`): ranks per dictionary code for each ordered column, refreshed
        as loads intern strings or change the column an order reads.
      - Tests:
        - Rust: each order, at every level and in column pivots, with top-N's "Other" and nulls; reloads keep the
          order; DuckDB as the oracle, with each order written as an `ORDER BY` expression; tenors read as
          `@basis/ui/dates` reads them, on its test cases; the tenor axis's positions and ticks.
        - Unit: the layout schema.
        - End-to-end: a DV01 ladder card by tenor bucket, and exposure by rating.
   3. **2.8.3 Basis points, 32nds and par amounts** (`2.8-formats`). `@basis/ui`'s `Bps` shows 0.0025 as `25 bp` and
      `Price32` a Treasury price as `99-16+`, but the grid shows 0.0025 and 99.515625, which breaks the design's rule
      that a number reads the same in a card as in the grid. Bond markets write `M` for thousands, yet parallax writes
      `5.0M` for $5 million.
      - Layout: `LayoutFormat` gains `bps`, a rate written in basis points with ` bp` from the fraction it arrives as,
        the only unit rates have (0.0025 is `25 bp`); `thirty_seconds`, a price in 32nds to its finest step (`"thirty_seconds"`, `"halves"`,
        `"quarters"` or `"eighths"`); and `suffixes: "par"`, which writes K/M/B abbreviations as `M`, `MM` and `BN`,
        the suffixes `AmountInput` reads in par style.
      - Code: the Rust formatter (`format.rs`) and its fixtures; `@basis/ui`'s TypeScript port (`format/format.ts`), with
        `Bps` and `Price32` written through it, so that the two agree by construction; parallax's layout schema; value
        axes labelled in the plotted column's format; and the Excel export's number formats, with a Notes sheet line
        for what Excel cannot show, such as 32nds.
      - Tests:
        - Fixtures: the formatter's fixtures gain a group per new format, and `@basis/ui`'s test runs the 2,192 cases
          and the new ones. Every case of those formats reads the same through `Bps` and `Price32`.
        - Rust: exact arithmetic for basis points and for rounding to 256ths, half away from zero, at doubles next to
          each step's midpoint.
        - Export: the read-back tests.
        - End-to-end: the formats on the fixed-income cards' tooltips and axes.
   4. **2.8.4 The SIFMA trading axis** (`2.8-sifma-axis`). The trading axis knows only the NYSE's calendar and its 09:30
      to 16:00 session, while `@basis/ui`'s date pickers default to SIFMA's. Bond markets close on Columbus Day and
      Veterans Day, SIFMA recommends 2 p.m. early closes, and Treasuries trade electronically almost around the clock.
      - Layout: `axis: "trading"` takes `calendar: "nyse" | "sifma"`, NYSE by default as before, and `session: {opens,
        closes}`, the calendar's regular session by default. A session that opens later in the day than it closes
        opens the evening before.
      - Engine (`calendar.rs`): SIFMA's rules and dated exceptions, ported from `@basis/ui/dates`. An early close
        shortens its day on the axis, so closed time still takes no space.
      - Tests:
        - Rust: the SIFMA calendar against the schedules SIFMA published, the same fixture file `@basis/ui/dates` is
          tested against, with the disputes between SIFMA's sources moved into that file so both tests read one list.
          The Rust also writes each year's closes and early closes from 1996 to 2050 to a fixture, which
          `@basis/ui`'s tests check its SIFMA calendar against, as they check the NYSE's, so the two can't disagree
          past the published years.
        - Axis: positions across early closes, an evening session's open, and daylight-saving changes.
        - End-to-end: a 10-year yield on SIFMA's days over October and November, and an intraday card through
          Thanksgiving's early close.
   5. **2.8.5 Waterfall** (`2.8-waterfall`). Attribution and P&L explain.
      - Layout: `kind: "waterfall"` draws the layout's grouped view: each group's bar floats from the running total
        before it to the one after, rising bars in the gain colour and falling ones in the loss colour, joined by
        connectors and ending in a total bar.
      - Engine (`aggregate.rs` and `view.rs`): `show_as: "running_total"`, Excel's "Running Total In": among siblings
        in their order, from exact sums, for sums and counts only. A waterfall adds it for its first measure.
      - Labels: each bar's value and the total are the engine's text.
      - Tests:
        - Rust: running totals against DuckDB's window sums, after reloads as a diff too, and refused for aggregates
          that do not add.
        - Unit: the model.
        - End-to-end: a P&L explain card over `attribution`, where a click selects a factor.
   6. **2.8.6 Yield curves with a change pane** (`2.8-curve-change`). Curves for several dates as lines, with the
      change in basis points as bars below, on the same tenor axis. Needs 2.8.2's tenor axis.
      - Layout: `panes`, a list of panes under the plot, each with its columns, `line` or `bar`, and a title. They
        share the x axis, the crosshair and zoom, as the indicators' panes do, which they generalise to any value
        axis. A series with no values in a pane is left out of it.
      - Code: `model-panes.ts` in React, and the session's frames for pane columns.
      - Tests:
        - Rust: the frame.
        - Unit: the panes' model.
        - End-to-end: a card of three dates' curves with the change below, and a crosshair spec across the panes.
   7. **2.8.7 Reversed axis and the rising colour** (`2.8-reversed-axis`). A rising yield is a loss to a long position.
      - Layout: `reverse_y`, `reverse_y_right` and a pane's `reverse` turn an axis upside down. `rising: "gain" |
        "loss"` says which colour a rise takes: candles, OHLC bars, volume, MACD's histogram, change bars and waterfall
        steps.
      - Tests:
        - Unit: the model, and drawings, zoom and brushing on a reversed axis.
        - End-to-end: a yield chart drawn reversed.

   Each step updates parallax's design page and its README's API table as it builds. Done when the seven are merged.

## Phase 3: the pilot

Lane A, with basis's lane B.

1. **3.1 Pilot UI.** Create a pilot UI repo from the template, pull basis's pilot API's `openapi.json` with `vp run
   client-pull`, and build a page of each kind, including a parallax page once step 2.7 is done. Needs 1.8 and basis's
   step 2.7.
2. **3.2 Pilot in QA (work).** Deploy the pilot UI and basis's pilot API to QA through their generated pipelines, behind
   one host if basis's spike 0.4 allows it. Basis's eval lane adds UI tasks and runs them against the pilot. Needs 3.1
   and basis's step 2.8. Done when the UI reaches QA in one pipeline run and the loop time is recorded against the
   hook's one-minute budget.

## Phase 4: the Angular library and apps

Lane C (work).

1. **4.1 Library port.** Inventory the Angular library, then port one component family per agent at once. Each family is
   compared by screenshot with its Angular original on the same fixture. Needs 1.4.
2. **4.2 App ports.** Port one app per agent, all at once. Needs step 3.2, the component families from 4.1 that each app
   uses, and step 2.7 for apps with grids or charts. For each app:
   1. Create fixtures for every API call the app makes.
   2. Screenshot every route of the Angular app on those fixtures.
   3. Port the app to a basis-ui repo. An app whose backend is an existing service keeps that service: `vp run
      client-pull` takes its OpenAPI document, or a hand-written one if the service has none.
   4. Compare screenshots with a tolerance, and run the same role-based Playwright specs against both versions.
   5. Keep a `PORTING.md` log, as optim's port skill does, and cut over when the screenshots and specs match.

   No app ever mixes Angular and React.

## Phase 5: upkeep

Lane A. Needs step 3.2.

1. **5.1 Cleanup.** Add a golden-principles file to the synced files, and a scheduled cleanup agent that opens
   refactoring pull requests against it, each gated by the screenshot tests.
2. **5.2 Tuning by eval.** Every release runs the eval's UI tasks. An error message, skill or doc page changes only when
   the eval shows the change helps.
3. **5.3 TypeScript 7.1.** Pin TypeScript 7.1 stable in every package and the template, if a release has not already
   done it.
4. **5.4 CI (work).** When the firm builds CI, turn on the generated pipeline's `vp run check-full` stage, and add a
   branch policy on `main` that requires it.
