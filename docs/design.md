# The basis-ui design

basis-ui is the TypeScript sibling of [basis](https://github.com/jacobragsdale/basis): the packages the firm's web UIs
are built on, `@basis/ui` and `@basis/parallax`, shaped so that the agents that write nearly all of the firm's code
produce the same kind of UI repo every time, and checks, rather than people reading diffs, decide whether a change is
right. A basis-ui app talks to a basis API through [the contract on basis's design
page](https://github.com/jacobragsdale/basis/blob/main/docs/design.md#what-a-ui-can-rely-on). "basis-ui" is a
placeholder name. The design was agreed on 2026-11-06, in the brainstorm that produced basis; this page records the UI's
decisions and their reasons, and [the roadmap](roadmap.md) gives the build order.

## The problem

The firm's UIs are Angular apps on an internal Angular component library, and their grids use DevExpress, which is
heavy, slow on large data and runs out of memory. The UIs are to be ported to React and written, like the rest of the
firm's code, by AI agents that people rarely read behind. Users work on Windows 11 Citrix desktops with no GPU, so WebGL
and WebGPU fail outright and Canvas 2D, rasterized on the CPU, is the drawing surface that works. Developers work on the
same desktops, on Windows and in WSL, with no admin rights assumed and no Docker. A UI lives in a repo of its own, apart
from the basis API it calls, and both deploy to the same AKS cluster. A custom sign-in system protects the UIs and
issues JWTs. The repos have no CI yet.

## The idea

basis-ui follows basis's rule: every rule is a check, and every check's failure says how to fix it. It differs in one
way, because its toolchain already exists: basis-ui uses Vite+ as VoidZero ships it, at its strictest settings, and adds
as little of its own as it can. The one addition to its linting is `@shadcn/lint`, because the design system's rules
have no built-in replacement. A UI repo's command is Vite+'s `vp`, and the verbs a developer knows from basis repos mean
the same thing here.

What basis-ui adds is the firm's design system: themes the library defines, each in light and dark, the components every
app needs, and every chart through parallax. Apps import the components and cannot restyle them, so every app looks and
behaves alike, and a fix reaches all of them in one upgrade.

## What a developer sees

| Command                         | What it does                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vp check`                      | Formatting, linting and type checking together                                                                                                                           |
| `vp test`                       | The Vitest suites, in Vitest's browser mode with the Playwright provider                                                                                                 |
| `vp dev`                        | The app in fixture mode, on a free port per git worktree, with no backend                                                                                                |
| `vp run check-full`             | `sync --check`, `client-check`, the fixtures against `openapi.json`, `tsc --noEmit` on the whole app, `check`, `test` and `build`; screenshot comparison in WSL, not yet |
| `vp run shot ROUTE`             | A screenshot of a page, its accessibility tree and its console errors                                                                                                    |
| `vp run budget`                 | The build, then each route's JavaScript and CSS, gzipped, against the budget the app's `vite.config.ts` gives it                                                         |
| `vp run client-pull`            | Copies the API's `openapi.json` from the API repo at a tag, or from a deployed API, and regenerates the client                                                           |
| `vp run client-check`           | Whether the generated client still matches the repo's `openapi.json`: a task of its own, since an app cannot add a step to `vp check`                                    |
| `vp run review`                 | A pull request's summary: the client's diff, the versions, and the commit that was checked; screenshot diffs, not yet                                                    |
| `vp run sync`, `vp run upgrade` | Rewrite the framework's files from the installed version; update `@basis/ui`, sync and check in one step                                                                 |
| `vp run doctor`, `vp run docs`  | Check the desktop's setup and print the fix for each problem; print the installed version's docs: one entry of the catalogue, a search by purpose, or a README section   |

Screenshot comparison in `check-full` and screenshot diffs in `review` wait for an app's baselines, step 6.8.5; the
gallery's exist, as [Components](#components) says.

The `vp run` tasks come from `@basis/ui`'s preset, which an app's `vite.config.ts` spreads in, so every UI repo has the
same ones. `check-full`'s `tsc --noEmit`, from the app's installed TypeScript, is what type-checks the generated client:
`vp check` lints around `src/api/generated`, so a type error there, such as one an upgrade of `@basis/ui`'s mutator
causes, would pass it. As in basis, every file `vp run sync` writes opens with a line saying that basis-ui manages it,
the drift check fails when someone edits one, and every failure is one line that starts with `ERROR`, gives the reason
and ends with the fix.

A UI repo is made with `vp create` and `@basis/ui`'s template, if Vite+ accepts a template from a package, and with
`pnpm create @basis/app` if it does not.

## The packages

| Package           | What it is                                                                                                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@basis/ui`       | The runtime and the toolchain: the theme, the React components, the app shell, the Vite+ preset with its tasks and lint configuration, fixture mode, the template, and the UI's skills and docs |
| `@basis/parallax` | The grid, pivot table and every chart, running in the browser                                                                                                                                   |

Both are published to the internal npm feed, from this repo, a pnpm workspace. They release together, under one version
and one tag, such as `v0.4.0`, and `@basis/parallax` depends on `@basis/ui` at exactly its own version. basis-ui's
version line is its own, apart from basis's: the two meet at the contract, not at a shared version.

## A UI repo

| Path                                                           | Holds                                                                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/`                                                         | The app's routes, pages and components                                                                                                     |
| `openapi.json`                                                 | The pinned copy of the API's document, which the client is generated from                                                                  |
| `fixtures/`                                                    | Synthetic responses for fixture mode, in git, in the record format `basis records export` writes                                           |
| `.fixtures/`                                                   | Records exported from a basis API's run store by `basis records export`, which git ignores because they hold client data                   |
| `Dockerfile`, `azure-pipelines.yml`                            | An image that serves the built files with a static file server, and the deploy pipeline that calls the maintainer's team's templates       |
| `AGENTS.md`, `CLAUDE.md`, `.agents/skills/`, `.claude/skills/` | The agent files, as basis writes them: `AGENTS.md` a short map, `CLAUDE.md` containing `@AGENTS.md`, and the skills copied for Claude Code |
| `.vite-hooks/`, `.gitattributes`, `.gitignore`                 | Vite+'s commit and push hooks, LF line endings on Windows and in WSL alike, and the ignored files, `.fixtures/` among them                 |

The template writes `.gitignore`, but `vp run sync` does not keep it, so nothing stops an app dropping `.fixtures/`
from it: not yet, step 6.8.3.

## Consumers

Two kinds of repo build on basis-ui. A UI repo, as above, comes from the template and keeps its framework files in step
with `vp run sync`. The second is [ctzd](https://github.com/jacobragsdale/ctzd), the firm's platform for citizen
developers, whose only UI is a React app on `@basis/ui` and `@basis/parallax` with a basis API behind it, one repo and
one container per app. ctzd writes every file in its apps itself and never runs `vp run sync`, its pages import the
components directly, and its agents take no screenshots: they trust lint, types and other checks that read code.

ctzd uses this surface, and a change to any of it needs a note to ctzd:

- `basisPreset()` and `basisPlugins()`, the tsconfig and the styles entry, in a `vite.config.ts`, `tsconfig.json` and
  `styles.css` that ctzd writes with exactly the lines `packages/ui/README.md` shows;
- `BasisApp` with an anonymous sign-in, since ctzd's dashboards have no sign-in in their first version;
- the components, and `@basis/parallax`.

It also needs four things built for it (roadmap steps 1.14 to 1.16):

- a test setup that runs without a browser, beside `basisTest()`'s Playwright one, since citizen developers' laptops
  have no Chromium: `basisTest({ browser: false })` in happy-dom, with tests written through `@basis/ui/testing` and
  Vitest's browser API kept to `*.browser.test.tsx` files;
- a machine-readable catalogue, `@basis/ui/catalogue.json`, which a test keeps current, of everything both packages export: each component's name,
  purpose, when to use it and what goes with it, its props, those it takes from Base UI among them, with their docs and defaults, its variants and one
  example per family; each hook and function with its signature; each type an entry names, with its fields, `LayoutInput`'s among them; and each
  module. Every example compiles in an app, and every prop listed is checked against the component's own type. Parallax's entries are read from its
  source when the catalogue is built, so `@basis/ui` never depends on parallax; the two release together, so they match. ctzd turns it into its agents'
  reference, and `vp run docs NAME` prints one entry, as `vp run docs --search WORDS` finds one by purpose, so an agent reads 60 lines rather than the
  whole file;
- a check in this repo that configuration written by hand from the README keeps working;
- lint and compiler errors that name the fix in their message, since in a ctzd app nobody reads the code.

## The toolchain, at its strictest

The UI is React 19.3 with the React Compiler 1.0. Its toolchain is Vite+, VoidZero's MIT-licensed `vp` command, which
bundles Vite 8 with Rolldown, Vitest 5, Oxlint, Oxfmt, tsdown and a task runner, configured in one `vite.config.ts`.
basis-ui adds one lint plugin, `@shadcn/lint`, described below:

- TypeScript 7, the native compiler, with `strict` and every further check: `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `noImplicitOverride`, `noImplicitReturns`,
  `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `allowUnreachableCode: false`,
  `allowUnusedLabels: false`, `verbatimModuleSyntax`, `isolatedModules`, `erasableSyntaxOnly` and
  `noUncheckedSideEffectImports`.
- Oxlint with type-aware linting and type checking on, its built-in typescript, react, jsx-a11y, unicorn, import,
  promise and oxc plugins, vitest's on test files, and its correctness, suspicious, pedantic, perf, style and
  restriction categories at error: 623 rules, and 73 more on tests. Its experimental nursery category stays off. Where
  two rules conflict, one is turned off, given an option, or confined to the files it fits, with a one-line reason
  above it; spike 0.1 settled 26 such conflicts. A warning fails the check.
- Nine more rules are off or loosened, by the maintainer's choice on 2026-11-07, because they banned plain language
  features or forced file splits: `eslint/no-ternary`, `oxc/no-optional-chaining`, `react/jsx-max-depth`,
  `react/no-multi-comp`, `eslint/sort-imports`, and on tests `vitest/require-test-timeout` and
  `vitest/prefer-expect-assertions` are off; `eslint/no-magic-numbers` ignores -1, 0, 1, 2 and 100 and is off on tests;
  `import/max-dependencies` allows 20. The same day five more went, for obstructing basis-ui's own code without
  catching a bug: `eslint/capitalized-comments` and `eslint/sort-keys` are off, `eslint/id-length` allows `l`, `c`, `h`,
  `x`, `y` and `i`, `unicorn/no-useless-promise-resolve-reject` is off, and `eslint/max-lines-per-function` is off on
  tests.
- Six more are to be loosened in app code, by the maintainer's choice on 2026-11-09, because a 60-line table page
  failed all six without a UI bug among them, and each failure costs an agent a round: `eslint/max-lines-per-function`,
  `eslint/complexity` and `eslint/max-params` turned off or loosened, `eslint/id-length` and `eslint/no-magic-numbers`
  loosened for literals in JSX, and `typescript/explicit-function-return-type` off for event handlers. The same choice
  closes the real holes that probes found open: an app's `src/styles.css`, `vite.config.ts` and `tsconfig.json` held to
  the framework's lines, suppression comments refused outside a short allowlist, and the classes, formatting calls,
  network APIs and dependencies the lint lets past today. Not yet: step 6.8.2 loosens the six, and step 6.8.3 closes
  the holes.
- Oxfmt with its defaults.

Two guarantees need more than Oxlint's built-in rules. Components the React Compiler cannot optimize fail the build,
through the compiler's `panicThreshold: "all_errors"`, which React Compiler 1.0 reads through Babel 7 (Babel 8 breaks it
on destructured defaults). Its Rust port in `@vitejs/plugin-react` caught the same faults three times faster in spike
0.1, and replaces it once it is no longer experimental. The design system's rules come from `@shadcn/lint`, shadcn's
linter for Tailwind design systems, which runs as an Oxlint JS plugin through Vite+'s `lint.jsPlugins`. Its errors say
which variant, size or token to use instead, from the components and the theme themselves:

| Rule                     | What it rejects                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `no-restyle`             | Restyling a `@basis/ui` component through `className`; each component declares what an app may change, which is mostly its placement |
| `no-raw-colors`          | Palette colours and hex values in place of the theme's tokens                                                                        |
| `no-arbitrary-values`    | Values off the theme's scales, such as `p-[13px]`                                                                                    |
| `no-inline-styles`       | `style` props that set anything but a CSS variable, and `<style>` elements                                                           |
| `no-unknown-classes`     | Classes Tailwind cannot generate, which include Tailwind's own palette, since the theme removes it                                   |
| `require-static-classes` | Classes built at run time, which no check can read                                                                                   |

It is pinned to an exact version, since it is at 0.2 and Oxlint still calls its JS plugins alpha. If it breaks, its
rules are turned off until it is fixed, and the gallery's screenshots catch what they would have.

## The stack

TanStack Router, whose search parameters are typed and validated, serves apps that keep their filters and layouts in the
URL; TanStack Query holds server state; Tailwind 4 and Base UI, which shadcn/ui made its default in July 2026, make the
components; TanStack Form holds form state; lucide supplies the icons; and Zod 4 guards every boundary. React Hook Form,
the better-known form library, is on the React Compiler's list of incompatible libraries, because the compiler memoizes
what its `watch()` returns; spike 0.1 confirmed that `watch()` fails the build, and that TanStack Form and TanStack
Table build at `panicThreshold: "all_errors"`.

The client is generated by orval from the repo's `openapi.json`: the types, a Zod schema per model, a TanStack Query
hook per operation, and MSW handlers for fixture mode. Generated types are not validation, so every response is parsed
by its schema before a component sees it. A response's schema checks every field it knows and drops the ones it does
not, so that an API can add a field without breaking a UI already deployed, as basis's contract promises.

The app shell owns startup, sign-in (it attaches the user's JWT to every request through orval's custom fetch), routing,
the generated client, telemetry, and how errors are shown, reading RFC 9457 problem details. It answers the sign-in
problems basis's contract names by their type: `invalid-token` means the session has ended, so the shell signs the user
out through the sign-in adapter and says so; `sign-in-required` asks the user to sign in; and `keys-unavailable`, a 503
while the sign-in system's keys cannot be fetched, is retried and never signs the user out. Feature code reaches the
backend only through the generated client, which Oxlint's built-in `no-restricted-imports` and `no-restricted-globals`
(for `fetch`) enforce.

A UI and its API sit behind one host on the AKS cluster, the ingress routing `/api` to the API, so the browser makes no
cross-origin calls. Where that routing is not possible, the API declares the UI's origin as one it allows.

## Components

`@basis/ui` ships its components, and apps import them. shadcn's usual model copies each component's source into the
app, which suits a team that wants to own every line, but across the firm's repos it means as many copies drifting
apart, and a fix that reaches none of them. Here a fix or a new variant lands once and reaches every app through `vp run
upgrade`, and `no-restyle` keeps each component looking the same everywhere. When no variant fits, the variant is added
to `@basis/ui`, never restyled in an app. For the same reason `@basis/ui` exports no `*Variants` helpers, through which
an app could style a plain element past the lint: an element that must look like another component is a component of
its own, such as `ButtonLink`.

Each component starts from shadcn's source for Base UI, which is MIT-licensed, and keeps shadcn's names, props and parts
(`Card`, `CardHeader`, `CardContent`), so what agents already know about shadcn applies here. From shadcn, `@basis/ui`
takes the components a business app uses:

- **Forms and inputs:** Button, Button Group, Input, Input Group, Textarea, Field, Label, Checkbox, Radio Group,
  Switch, Slider, Select, Native Select, Combobox, Toggle and Toggle Group.
- **Overlays and menus:** Dialog, Alert Dialog, Sheet, Drawer, Popover, Hover Card, Tooltip, Dropdown Menu, Context
  Menu, Menubar and Command.
- **Navigation and layout:** Sidebar, Navigation Menu, Tabs, Breadcrumb, Pagination, Accordion, Collapsible, Resizable,
  Scroll Area, Separator, Aspect Ratio, Card and Item.
- **Feedback and display:** Alert, Toast (Base UI's, not Sonner), Badge, Avatar, Kbd, Progress, Spinner, Skeleton,
  Empty, Table and Typography.

It leaves out shadcn's chat and AI components (Attachment, Bubble, Message, Message Scroller, Trace, Code Block, Marker
and Questionnaire), Carousel, Input OTP, Direction, Calendar and Date Picker, whose react-day-picker brings date-fns
(the as-of date picker below is built on Temporal instead), and Chart, since [every chart is parallax's](#charts).

The firm's own components cover what shadcn does not:

- **Numbers and dates.** `Num`, `Money`, `Pct`, `Bps`, `Price32` and `DateTime` display values by parallax's rules
  (Excel's display rules and the New York time zone), so a number reads the same in a card as in the grid. Each number
  component takes a number, as [every API sends one](#numbers), and a column's display format, so a page never
  chooses decimals. The formatter is a TypeScript port of parallax's Rust formatter, tested against fixtures the Rust
  writes. `AmountInput` reads `1.5m`, `250k` and `25bp`, parses the text exactly, returns it as a number, and shows the
  full number back. Each field declares the suffixes it accepts, because in bond markets `M` means thousands, so `5M`
  par is $5,000. `AsOfDatePicker` knows
  business days on its declared calendar, SIFMA by default, and `DateRangePicker` offers month, quarter and year to
  date.
- **Forms.** Fields bind to the Zod schemas orval generates, so a form checks what the API's document declares. Errors
  the API returns land on the fields they name. Leaving a page with unsaved changes is to ask first, and a destructive
  action to ask for typed confirmation: neither is built yet (step 6.7.6). basis's contract names each field at fault in
  a 422's `errors`, RFC 9457's own list of `{detail, pointer}`, with `{detail, parameter}` for a query or path
  parameter, the shape spike 0.2 found and basis-ui asked basis for (jacobragsdale/basis#7). `fieldErrors` names each
  field as TanStack Form does, so the errors go straight onto the form; the example app's settlement form does this.
- **Data.** `DataTable`, on TanStack Table, is for small data whose cells hold links and buttons; past its row cap it
  fails with a message that points to parallax's grid. `EntityPicker` searches through the generated client, and
  `SecurityPicker` sends only a valid CUSIP, ISIN or SEDOL. `FileImport` reads CSV and Excel workbooks (.xlsx), previews
  the rows, and checks them against a schema before anything is sent; a workbook's cells read as the text Excel shows,
  with dates in ISO 8601, and a workbook with several sheets of the schema's columns offers a choice of sheet. An .xls,
  .xlsb or .ods is refused with how to save it as .xlsx ([the reader's spike](spikes/xlsx-reader.md)).
- **The shell's parts.** A sidebar built from the route tree, breadcrumbs, a user menu holding the mode, density and motion, a
  banner naming the environment, a command palette (Ctrl+K) filled from the routes, and a shortcut registry with a `?`
  overlay. Not yet: a filter bar whose state lives in the URL's search parameters (step 6.7.2), saved views (step
  6.6.3), and split panes for master and detail (step 6.7).
- **States.** One component shows a query's loading skeleton, its empty state, its error, read from problem details, and
  its staleness, as the time its data was current.
- **Small charts.** `Sparkline` and an in-cell bar, drawn as SVG, for KPI cards and table cells, which are too small to
  load parallax for.

A gallery in this repo shows every component in both modes and both densities, and a page of the theme's tokens read
from the generated stylesheet: each colour with its contrast against the surfaces it sits on, the type scale, the
radii, the shadows, the motion and the chart palettes. Its screenshots are the components' visual tests. `vp run
@basis/gallery#shots` opens each section alone, its menus, dialogs, popovers, tooltips and toasts open and its hovered,
focused and pressed examples forced through Chromium's DevTools protocol, so no pointer moves, and compares a
screenshot of it in light and dark, comfortable and compact, with its baseline pixel for pixel, in the pinned Playwright
image; CI runs it when `@basis/ui` or the gallery changes. A screenshot is named by its section, so a diff names the
component. Every shot runs an axe accessibility check, WCAG 2.2's levels A and AA and axe's best practices, that a
violation fails, naming the section, the rule and the element; a rule off for a section is listed with its reason
beside the spec. The maintainer approved `axe-core` for it on 2026-11-09. A render matrix renders every section, on its
page and alone, in Chromium and in a Node DOM, in both modes and densities, with no console error. Not yet: `vp run
shot` in an app runs no axe check (step 6.8.5).

## The theme

The library defines the themes, each in a light mode and a dark mode, and the user picks one as they pick a mode and a
density. The maintainer chose this on 2026-11-09, where there had been one theme: `@basis/ui` ships several themes from
one typed generator, each held to the checks below, so that a desk that lives in the grid can choose a dense, dark-first
theme and a user who needs it one of high contrast, while every app still looks alike, since the themes are the
library's and not an app's. The default theme gets a look of its own, decided the same day, since the components read as
shadcn's defaults: status colours with their own lightness, a neutral whose tint shows, elevation that reads, a dark
primary that is not pastel, and a considered look for numbers. The firm's brand is ported onto the generator's inputs
later, when the maintainer has its guidelines, and its values stay out of this public repo. Not yet: today there is one
theme, the default, which still reads as shadcn's; the generator, `defineTheme`, is step 6.5.3, the choice of theme
6.5.5, and the default's identity with the two more themes, dense dark and high contrast, 6.5.7.

Each theme has three layers, and no app can change it: apps declare no tokens, and use no `dark:` variants, since every
token already switches with the mode. `no-restyle` rejects `dark:` on a component; on plain elements no built-in rule
can, so the theme points `dark:` at the user's chosen mode, and the template's drift check is to reject tokens an app's
stylesheet declares, since `@shadcn/lint` accepts them once it reads the package's theme. Not yet: no check reads an
app's stylesheet today (step 6.8.3).

1. **Ramps.** Twelve-step OKLCH scales for a neutral, the brand, and four status hues (red, amber, green and blue). Each
   step has one job: steps 1 and 2 are page backgrounds, 3 to 5 control fills at rest, hovered and pressed, 6 to 8
   borders, 9 and 10 solid fills, and 11 and 12 text. A dark ramp has the same steps at different lightness, so the dark
   mode is designed rather than inverted. A script in this repo generates the ramps from a few inputs, the brand's hue
   and chroma and the neutral's tint, and commits the CSS. Porting the firm's existing theme means changing those
   inputs, the fonts and the radius; step 6.5.3 makes every hand-written value an input, so that a theme is one file of
   them.
2. **Semantic tokens.** These are the only colours Tailwind exposes, and each one is a ramp step in each mode.
   Tailwind's own palette is removed, and `no-raw-colors` rejects a class such as `bg-pink-500`. A colour is drawn whole
   from its token, never faded with an opacity modifier such as `bg-primary/80`: a faded colour changes with whatever
   lies under it, so no check can measure its contrast and no theme can re-skin it, and a test fails on any colour
   class in `@basis/ui` that takes one (step 6.5.1, 2026-11-09). A hovered or pressed fill, an edge and a veil are
   tokens of their own.

   | Tokens                                                                                       | Use                                                                                                                                                              |
   | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `background`, `card`, `popover`, `muted`, `secondary`, `accent`, each with its `-foreground` | Surfaces and the text on them. These are shadcn's names, so its source ports with its `dark:` classes replaced by tokens.                                        |
   | `primary`, `primary-foreground`, `border`, `input`, `ring`                                   | The main action, lines, control outlines and focus                                                                                                               |
   | `primary-hover`, `primary-active`, `secondary-hover`, `secondary-active`                     | A filled button hovered (step 10 for a solid) and pressed (as far again past it); a secondary fill a step and two steps further from the page                    |
   | `edge`, `overlay`                                                                            | The outline of a card or a popup, a step lighter than `border`; the veil behind a dialog, sheet or drawer, the page's colour at 70%, the one token with an alpha |
   | `control-off`, `disabled`                                                                    | A control that is off, such as Switch's track, at 3:1 on every surface; the fill of a disabled field, under the fade every disabled control takes                |
   | `sidebar-*`                                                                                  | shadcn's set for the sidebar                                                                                                                                     |
   | `success`, `warning`, `info` and `destructive`, each with `-foreground` and `-subtle`        | Status, always with an icon or a label as well as the colour                                                                                                     |
   | each status's `-subtle-hover` and `-edge`                                                    | A tint hovered, a step toward the page, since a step toward its text costs the text its 5.5:1, and pressed back at rest; the outline of an alert or toast on it  |
   | `gain`, `loss`                                                                               | Signed values. They differ in lightness as well as hue, because red against green is the pair colour-blind readers lose, and every signed number shows its sign. |
   | `selection`, `highlight`                                                                     | Selected rows and cells, and search matches                                                                                                                      |
   | `env-dev`, `env-qa`, `env-prod`                                                              | The environment banner                                                                                                                                           |
   | `chart-1` to `chart-8`, a sequential scale and a diverging scale                             | Chart series in order, heatmaps and conditional formatting. Parallax's canvases read the same tokens.                                                            |

3. **Scales.** Spacing derives from Tailwind's single `--spacing` variable, so the compact density sets it smaller and
   every control's height follows. One spacing value stays fixed, `--spacing-target` at 24 pixels, whose `min-h-target`
   and `min-w-target` every control shorter than `h-8` carries, so the compact density keeps WCAG 2.2's minimum target
   size. Type runs down to `text-2xs`, for axes and dense labels, and number components use
   tabular figures. There are two shadows, both subtle, `shadow-sm` for a control raised off its surface and
   `shadow-md` for a popup, each a variable (`--shadow-raised`, `--shadow-floating`) rather than a value written into
   the utility, so a theme can change it. The focus ring is an outline in `ring`, drawn whole, whose width and gap
   are the variables `--focus-width` (2 pixels) and `--focus-offset` (none): `focus-visible:outline-solid
   focus-visible:outline focus-visible:outline-offset-(--focus-offset) focus-visible:outline-ring`. An outline rather
   than a ring, since an outline's gap is transparent on any surface where a ring's would need the surface's colour,
   and Windows' forced colours keep an outline and drop a ring; a field that is invalid takes `outline-destructive`
   for it. The other scales are named for their use: `duration-popup` and `duration-panel`, `z-raised` for a part over
   its siblings and `z-popup` for a popup or a veil, `rounded-pill` for a badge or a switch, where a circle such as an
   avatar or a radio stays `rounded-full`, and `opacity-disabled` for a disabled control's fade. Citrix desktops draw on the CPU, so the theme removes the blur
   scale, which makes `blur-sm` and `backdrop-blur-md` unknown classes; the other filter utilities have no scale to
   remove and stay out of the components by review. Transitions are short and stop under
   `prefers-reduced-motion`: 100 ms for a popup's fade and scale, 150 ms for a panel that slides, such as the sidebar,
   a Sheet or an Accordion's content. Motion never lays the page out frame by frame where a grid or chart would resize
   with it: the sidebar's panel moves on its own while the space it holds changes at once, and canvases never animate.
   The maintainer asked for this motion on 2026-11-08, where the sidebar had folded at once. A Citrix desktop draws on
   the CPU and sends each frame's changes as an image, so motion that touches much of the screen, or never stops,
   costs it most, and since 2026-11-09 the components hold to five more rules (step 6.2c). The veil behind a Dialog,
   Alert Dialog, Sheet or Drawer appears at once, and only the popup over it fades or slides. Controls such as Button,
   Badge, Toggle, a tab, Switch and Progress fade their colours and nothing else, so no change of size is laid out
   frame by frame. A table's rows and a date grid's days change on hover at once, since the pointer crosses many. The
   skeleton holds still, where shadcn's pulses, so a page that loads sends nothing until it has loaded. And a change of
   theme, mode, density or motion is drawn in one frame, with every transition held off until it is, as the canvases
   change. `Resizable` resizes a pane that holds a canvas once, on release, with only its line following the pointer.
   A gallery test holds `DataTable` at its row cap, a dialog opening and a change of mode to a budget of long animation
   frames with the CPU slowed four times. Fonts are bundled, so screenshots match on every desktop: Inter for text and
   JetBrains Mono for code, until the firm's fonts replace them. A canvas's font cannot ask for tabular figures, so
   `--font-num` names Inter declared again with them on, which parallax's canvases draw in.

The user chooses a mode (system, light or dark), a density (compact, the default by the maintainer's choice of
2026-11-07, or comfortable), a motion (full, the default, or reduced), and once step 6.5.5 is built a theme. Reduced
motion stops every transition and animation as `prefers-reduced-motion` does, for a desktop whose Windows setting is
not the user's to change; either one stops them. They live in one cookie, meant to sit on the parent
domain the firm's apps share, so that every app follows one choice, and a page left open changes when another app
changes it. A script in the page's head applies them before the first paint, and sets `color-scheme` to match, so
scrollbars and native controls follow. If the apps share no parent domain, each app keeps its own choice. Not yet: the
cookie can take a domain, but the user menu passes none, so today each app keeps its own choice (step 6.5.5).

This repo's `vp check` runs the theme's checks, since no app can change the theme. Step 6.5.4 lifts them into
`checkTheme`, which every shipped theme must pass, and widens them to every text token on every surface, the focus
ring as drawn, and every pair of chart colours (not yet):

- every token is defined in both modes, and nothing outside the theme defines one;
- text tokens reach 5.5:1 contrast on the surfaces they sit on, and control outlines and focus rings 3:1;
- `chart-1` to `chart-8` stay distinct under simulated protanopia, deuteranopia and tritanopia;
- `gain` and `loss` differ in lightness;
- in the compact density, controls stay at least 24 pixels tall, WCAG 2.2's minimum target size;
- the gallery's screenshots, in every theme, light and dark, comfortable and compact, match their baselines.

Apps' routes are screenshotted in light and dark, at the compact density, with `vp run shot`; comparing them with
baselines is step 6.8.5 (not yet).

## Numbers

Every number an API sends is a double: a JSON number or an Arrow `float64` column, never a decimal string. The
maintainer set this rule for the whole firm on 2026-11-07, so it binds basis and ctzd as well, and basis's contract
changes to match (basis's step 2.11). Python never rounds. The UI rounds once, at display, by parallax's rule: the value
to 15 significant digits, half away from zero, then to the decimals shown. Parallax's formatter and its TypeScript port
both follow it, so a value reads the same in the grid, a chart, a card and a form.

- **One unit.** Rates and spreads are fractions: 0.0525 is 5.25% and 525 bp. `Pct`, `Bps` and the formatter take a
  fraction and offer no unit for a value already in percent or basis points.
- **Inputs.** `AmountInput` parses its text exactly, suffix included, then converts the result to a number, so `1.1m`
  is the double nearest 1,100,000.
- **No sums by default.** Most of a desk's numbers, its prices, yields, spreads and durations, do not add, so nothing
  sums a column on its own, by the maintainer's choice on 2026-11-08: a grid's totals row counts its rows until a
  column's menu picks a sum, and a number put in a pivot's values starts as its mean. A sum is written into a layout
  where it means something, such as a book's market value.
- **Totals.** A total on screen comes from parallax's exact sums or from `sumPrecise`, never from adding rounded
  doubles.
- **One formatter.** The preset rejects display rounding in app code (`toFixed`, `toPrecision`, `toLocaleString`,
  `Math.round` and `Intl.NumberFormat`), and each error names the component to use instead, or `numberText` for a
  number inside text such as a toast's; code that needs an integer for anything but display uses `Math.floor` or `Math.trunc`. The components and parallax
  are the only formatters.
- **Display formats.** basis writes each number's display format, so a page never chooses decimals. A dataset column
  carries it in its Arrow field's metadata, under the key `basis.format` as a JSON string, and a property of the API's
  document as `x-basis-format` on its schema, the columns of Arrow responses included. Parallax's grid, pivot and
  charts format a column by it unless a layout sets a format, and the number components take the same object.

  | `kind`    | Fields                                                                  | Shows                 |
  | --------- | ----------------------------------------------------------------------- | --------------------- |
  | `number`  | `decimals`                                                              | `1,234.50`            |
  | `money`   | `currency`, ISO 4217; `decimals`, the currency's minor units unless set | `$1,234.50`           |
  | `pct`     | `decimals`                                                              | 0.0525 as `5.25%`     |
  | `bps`     | `decimals`                                                              | 0.0525 as `525 bp`    |
  | `price`   | `decimals`                                                              | `99.516`              |
  | `price32` | `step`: `32nd` unless set, or `half`, `quarter` or `eighth`             | 99.515625 as `99-16+` |

  `decimals` is an integer from 0 to 15. The UI ignores fields it does not know and treats an unknown kind as no
  format, so basis can add to the object; basis refuses an unknown kind, a currency missing from its ISO 4217 list, or
  decimals out of range when a route is declared (basis's step 2.13). The shape was agreed with basis on 2026-11-07.

Parallax still reads `Decimal128` columns exactly, since it reads any Arrow, but no API sends them.

## Utilities

`@basis/ui` carries the utilities apps need, in four modules, so that no app adds lodash, a date library or a decimal
library. They do display arithmetic only: anything with a market convention, such as accrued interest, day counts,
yields, risk or returns over long series, is computed by the API, so the firm has one implementation of each.

| Module                 | What it holds                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@basis/ui/numbers`    | `sumPrecise`, the exact sum of doubles; tick rounding; Treasury prices in 32nds; percent change and shares of a total                                                                                                                                                                                                                                     |
| `@basis/ui/dates`      | Business days on the SIFMA calendar, the default, since the firm trades US fixed income, then the NYSE's and TARGET2's for euro settlement, each its rules plus a dated list of exceptions, since markets close on unscheduled days; month, quarter and year to date; settlement dates; market status; tenors such as `3M` and `10Y`; how stale a time is |
| `@basis/ui/securities` | CUSIP, ISIN and SEDOL checks, CUSIP to ISIN, and branded identifier types, so a ticker cannot pass where a CUSIP is due                                                                                                                                                                                                                                   |
| `@basis/ui/utils`      | The collection helpers modern JavaScript lacks (`keyBy`, `partition`, `chunk`, `uniqBy`, a multi-key `sortBy` and others), `deepEqual` and `stableStringify`, `debounce` and `throttle`, type guards such as `assertNever`, and CSV and TSV writers that neutralize formula injection                                                                     |

A date field names its calendar, SIFMA unless it says otherwise. Dates use Temporal, which the firm's Chrome has shipped
since version 144, so no date library is needed; grouping uses `Object.groupBy`, cloning `structuredClone`, and set
operations the Set methods. `AmountInput` parses its text exactly, by moving the decimal point by its suffix's power of ten, before it converts the result to a number, and the calendars are tested against the exchanges' published holidays. The preset's `no-restricted-imports` rejects `lodash`, `lodash-es`, `underscore`,
`es-toolkit`, `moment`, `date-fns`, `dayjs`, `decimal.js` and `big.js` in apps, and each error names the module or the
native API to use instead.

## Dependencies and the supply chain

The firm installs packages only from its internal registry, and basis-ui keeps what comes from upstream small. Small,
stable code is copied into `@basis/ui`'s `src/vendor/`, with its license and the upstream version it came from: `cva`
and `clsx`, and the lucide icons the components use. Large, maintained packages are mirrored unchanged through the
internal registry, pinned exactly, and upgraded one reviewed pull request at a time, checked by the gallery's tests and
screenshots: Base UI and its eight dependencies, `cn`, `@shadcn/lint`, and the toolchain. Forking Base UI would mean
owning keyboard, focus and screen-reader behaviour across browsers, and losing its fixes. The shadcn CLI, with its 32
dependencies, is installed nowhere; its repository is read when porting a component. pnpm refuses package versions
younger than its minimum release age and runs no dependency's install script without approval, which closes the two
routes the 2025 npm worms used.

## Charts

Every chart is parallax's. Parallax draws on Canvas 2D after its engine, in a worker, reduces the data to pixels, and it
draws line, area, bar (across, stacked, or on two axes), scatter (a dot per row, or a density past 5,000 rows), heatmap,
histogram, candlestick, OHLC, pie and donut charts. It adds a trading-time axis, technical-analysis indicators, panes,
drawings and a compare mode, and it formats numbers and times by the grid's rules. One chart system means one look, one formatter, one time zone and
one way to interact.

Those kinds came from equity charting, and a study of what the fixed-income systems the firm's users know show them
(Aladdin, PORT, Yield Book, FactSet, BarraOne, ICE and Marquee) found seven gaps, which [roadmap step
2.8](roadmap.md#phase-2-parallax-in-the-browser) closes:

- A relative-value scatter draws each bond as a dot, coloured and sized by columns, with the API's fitted curve,
  rather than as a density (step 2.8.1, built).
- Tenors and ratings sort as a desk reads them, groups can sort by another column, and curves get a tenor axis from
  `3M` to `30Y` (step 2.8.2, built).
- The grid's formatter writes basis points, Treasury 32nds and par amounts' `M` and `MM`, so that a value reads the
  same in the grid as in `Bps` and `Price32` (step 2.8.3, built).
- The trading axis takes SIFMA's calendar, its early closes, and sessions that open the evening before (step
  2.8.4, built).
- Waterfalls draw attribution and P&L explain, their steps the engine's running totals (step 2.8.5, built).
- Panes under a chart take any columns, for curves on several dates with their change in basis points below (step
  2.8.6, built).
- An axis can be reversed, for yields, and a chart says whether a rise takes the gain colour or the loss colour (step
  2.8.7, built).

Analytics stay in the API: curve fits, key-rate durations, scenario P&L and attribution arrive as columns, and
parallax draws them. With those additions, parallax draws what the firm's dashboards need.

Two additions fit it to small charts. A small-data API, such as `<Chart rows={rows} kind="bar" x="sector"
y="exposure" />`, builds the Arrow table itself, so a ten-bar chart does not feel like loading an engine. And
`@basis/ui`'s SVG `Sparkline` and in-cell bar serve the places too small for parallax. A canvas is invisible to screen
readers, so every chart carries a text alternative.

Recharts, the most used React chart library and what shadcn's Chart wraps, draws one SVG element per mark on the main
thread, and has no financial charts. Its line and bar charts are 118 kB gzipped. Parallax's wasm, export included, is
1.01 MB brotli, which a page whose only chart is small still downloads, once, before the browser caches it. In spike
0.3 such a page drew its chart 89 ms after navigation cold and 57 ms warm on the build host, and 506 ms and 320 ms with
its CPU held to a quarter, a rough stand-in for a Citrix desktop. That needs no Recharts; the Citrix repeat confirms it,
and if a chart-only page proves too slow there, Recharts behind a cap on its points is the fallback.

## Rust and WebAssembly

Rust runs in the browser only where it wins, measured on a Citrix desktop's CPU or in memory, and always in a Web
Worker, prebuilt inside a package, so no app compiles Rust. It already wins in parallax: the pivot engine with its exact
sums, the chart reduction, and Excel export. Reading uploaded spreadsheets was the next candidate, and lost: calamine
in wasm read an .xlsx of 10,000 rows 79 ms faster than a TypeScript reader with no dependency, with the CPU held to a
quarter, for 291 KB more to download and a module of its own, so `@basis/ui` reads .xlsx in TypeScript
([spike](spikes/xlsx-reader.md)). calamine stays the reader for .xls, .xlsb and .ods if the firm's users need them.
Components,
forms, routing, small tables and JSON stay in TypeScript: the browser's `JSON.parse` is native, and copying data into
wasm costs more than the parse saves.

WebAssembly memory grows and never shrinks, so heavy work runs in a worker that the page can end to free its memory,
and the packages share one wasm module rather than loading one per feature.

## Seeing the UI

Agents need to see what they build, so the UI runs without a backend. In fixture mode, MSW's service worker answers
every request under `/api` from three sources, in this order: the records `basis records export` writes into
`.fixtures/`, the synthetic responses the app commits in `fixtures/`, and the handlers orval generates. The first record
or fixture whose method, path and query match the request answers, each folder's files in the order of their names.
Records and fixtures share one format, basis-ui's, which `@basis/ui` ships as a JSON Schema that basis tests its export
against: one JSON file for each exchange, holding the operation's id, when it was recorded, the request's method, its
path without `/api`, its query and its body, and the response's status, the headers that matter to a UI, and its body,
as JSON or as base64 bytes with their media type. A record never holds the bearer token: a request keeps no headers,
and a JWT anywhere in a record is refused. A request for Arrow is answered only by a fixture, since orval's handlers
make random bytes, and a request no source answers gets a problem that says what to add. Every file is checked against
`openapi.json` when `vp dev` starts and when one changes, and each in `fixtures/` by `vp run check-full`, so a fixture a
newer document has left behind fails with an `ERROR` line rather than serving an answer the API no longer gives.

`vp dev` starts the app in fixture mode with no code in the app: the preset rewrites `index.html` to start the worker
before the app's entry runs, and reports each answer and its source through the telemetry interface, which writes to
the browser's console. `BASIS_API_URL` sends `/api` to a live API instead. The app runs on a port derived from its
folder, the same on every run and another in another git worktree, and `vp run shot ROUTE` writes a screenshot, the
page's accessibility tree and its console errors. Agents drive the browser with Playwright CLI, which Microsoft built
for coding agents.

Screenshots differ between operating systems, as Playwright's docs warn, and the desktops run no Docker to pin a Linux
image in. So visual baselines are made and compared only in WSL, with the Chromium build Playwright pins and the fonts
`@basis/ui` bundles, and on Windows `vp run check-full` says it skipped the comparison and to run it in WSL. An agent on
Windows still takes screenshots to look at. Not yet: an app has no baselines and `check-full` compares none (step
6.8.5). This repo's gallery has its baselines, made and compared in the pinned Playwright image as parallax's are.

## Serving the build

`vp build` writes a `.br` and a `.gz` beside every built file over 1 KB that compression helps, so whatever serves the
UI, basis-api or the template's image, sends the precompressed file the browser accepts rather than the raw one,
with `Cache-Control: immutable` for the hashed assets and `no-cache` for `index.html`. Brotli runs at quality 11, or 9
for files over 1 MB, where 11 took 7 s on parallax's wasm for 13% less; the step adds tenths of a second to a build.
The maintainer asked for it on 2026-11-08, finding the demos slow when served uncompressed.

An app loads only the parts of `@basis/ui` it uses. The package builds one module for each of its own, declares only
its stylesheets as side effects, and declares `cva` free of them, so an app's bundler drops every component the app
does not import. Built as one module, it had cost an app of one card all of it. Each app gives each route a budget, the
kilobytes of JavaScript and of CSS, gzipped, that opening it may load, and `vp run budget` opens each route of the
build in headless Chromium and fails the one that loads more, lazy chunks and workers included. The template loads
each page with a lazy import, so a page's code, and `@basis/parallax` with it, loads only when the page opens. The
review of 2026-11-09 asked for under 200 kB of JavaScript, before gzip, for `packages/consumer`'s one card, and it is
not met: the card loads 543 kB, 176 kB gzipped, where it loaded 558 kB, 180 kB gzipped, as one module, because React
DOM alone is 207 kB of it, and Zod, the router, Base UI and TanStack Query, which every app's shell uses, most of the
rest; `@basis/ui`'s own part fell from 60 kB to 47 kB.

## Gates without CI

Every UI repo has Node, so basis-ui uses Vite+'s own hooks: `vp config`, run from the repo's `prepare` script, installs
them on every `vp install`. The commit hook runs `vp staged`, which formats and lint-fixes the staged files, then `vp
check` and `vp test`; the push hook runs `vp run check-full`. `vp run review` writes the pull request's summary, so a
reviewer judges screenshots and the client's diff rather than lines of agent-written code; until step 6.8.5 compares
screenshots, the summary asks for a `vp run shot` of each page instead of a diff. A hook can be skipped with
`--no-verify`, so until CI exists the gates are only as strong as the hooks; the generated pipeline already runs `vp run
check-full`, and a branch policy on `main` that requires it turns the checks into the gate the day the firm builds CI.

## Parallax: @basis/parallax

Parallax runs only in the browser. Its Rust engine, compiled to WebAssembly, runs in a Web Worker so that pivots never
block the page on a shared Citrix CPU, and it loads Arrow that the app fetches from its API through the generated
client. Its server and connectors are deleted: the WebSocket server, the dataset registry and its hot reload, the expose
rules and the SQL registry, the SQL Server, Oracle, Mongo, Parquet and HTTP connectors, the NFS cache, ODBC and Oracle
Instant Client, and CI's three database containers. About 3,000 lines of Rust go, and about 15,000 stay: the engine, the
session layer, the protocol between the page and its worker, and the wasm wrapper. Excel export moves into the wasm
build, where each xlsx cell holds about 190 bytes of memory that is never returned, so xlsx stops at 1,000,000 cells
and larger exports are CSV, written in chunks.

The reason is that the browser can hold the data. A server that holds data the browser cannot is cost without benefit
when the engine alone holds the tables, and every app would have needed one deployed beside it. A documented limit
replaces it, and a larger load fails before it starts, with a message that names the limit. Spike 0.3 set it at 150,000
rows of a positions-shaped table and 70 MB of Arrow, whichever comes first: time follows rows and memory follows bytes.
At 150,000 rows the reference pivot met its 500 ms budget with the CPU held to a quarter, and the engine held 350 MB.

On 2026-11-09 the maintainer set the grid's target at 1,000,000 wide rows, fast, still with no server and no threads,
since the grid it replaces manages about 200,000 rows, so a limit of 150,000 is a step back from it. The review that
day lifted the limit in a copy of the built demo: the engine as it stood loaded 2,000,000 trades, and its time and
memory grew in a straight line with rows, so what bounds it is memory, the load and the first sort, each with a cause
that step 6.3 removes. The limit is restated in bytes of Arrow, since memory follows bytes: step 6.3.9 sets it from the
scale harness, expected near 500 MB, and drops the row limit or sets it far above. Until then it stays at 150,000 rows
and 70 MB. The budgets are stated against a Citrix session of about 4 virtual CPUs and 16 GB, the maintainer's figure,
until step 6.10 measures a desktop; that repeat of spike 0.3 also restates parallax's 300 MB memory budget, written for
views held on a server, for tables held in the browser. Threads, sharded workers, 64-bit memory and a remote engine
stay out: wide tables of 5,000,000 rows do not fit in 4 GB, and a session's 16 GB binds first. The session layer stays
independent of its transport, so a remote engine remains possible. A load past the engine's memory traps the wasm, so
the worker treats a trap as fatal: it fails every view with the reason and starts again.

The grid gains cells that draw data bars, heat, badges, sparklines and links, a context menu at the pointer, and saved
views, by the maintainer's choice on 2026-11-09, so that a desk reads magnitude and status at a glance and keeps the
layouts it builds (steps 6.6.1 to 6.6.3, not yet). The cells are kinds a layout declares for a column and the canvas
draws, not React renderers, since a canvas cannot host one for each cell. Live updates with flashing cells, and cell
editing, stay deferred; the engine already applies a keyed reload as a diff, so the door stays open.

React components replaced the 44 Angular component files of its web layer in step 2.6, the canvas renderers, the
formatter, the charts and the technical-analysis tools ported unchanged and checked pixel for pixel against the Angular
layer's, and the DuckDB comparisons that test the engine's numbers stayed. Each column is formatted by the display
format its Arrow field carries, as [Numbers](#numbers) describes. App developers install one npm package with the wasm
built into it, and Rust stays inside this repo's build. Parallax keeps its Apache-2.0 license.

Step 2.7 deleted the Angular layer, `packages/parallax/web`: the Angular library, its demo app, their own pnpm
workspace, ESLint, Prettier and unit tests, their Playwright specs and screenshots, CI's two Angular jobs, and the
script that recorded the Angular pivot's canvas, about 25,000 lines with the lockfile left out. The Angular
screenshots and the pivot canvas that the React layer's parity specs compare with are kept beside those specs, so
they go on guarding the canvases against drift. The protocol's TypeScript is generated in the package itself, by `buf
generate`. The demo is now a React app on `@basis/ui`, `packages/parallax-demo`, which runs the package's build as an
app does: the grid, pivot and charts over generated positions, trades, prices and bonds, with the performance overlay
and the theme studio, served as static files and screenshotted in light and dark.

## Versions

TypeScript 7.0.2 is the stable release and 7.1 is in beta. The 7.1 plan schedules its release candidate for 2026-11-10
and its stable release for 2026-11-24, but its beta shipped two weeks behind that plan. The workspace pins 7.0.2: the
tsdown inside Vite+ 1.5.0 makes declaration files only with TypeScript 7.0, which it detects by the version's prefix, so
on the 7.1 beta a package build fails. The pin moves to 7.1 stable once a Vite+ release accepts it. orval brings
TypeScript 6 with it, which a pnpm override replaces with the workspace's version (spike 0.2). Node is the current LTS,
managed by `vp env`.

## Decided against

| Option                                                                | Why not                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staying on Angular                                                    | The maintainer's call. The measured evidence is thin either way: in DesignBench, Claude 3.7's Angular compiled less often than its React when writing a page from scratch (0.69 against 0.95), and almost as often when editing one (0.91 against 1.00).                           |
| A UI inside basis, or a UI in an API's repo                           | Each repo has one toolchain, and each project one language.                                                                                                                                                                                                                        |
| A command of basis-ui's own                                           | Vite+'s `vp` already runs checks, tests and tasks; the preset adds the rest as `vp run` tasks.                                                                                                                                                                                     |
| typescript-eslint                                                     | It does not support TypeScript 7, which ships no compiler API; its maintainers closed the request as not planned until TypeScript 7.1's API lands.                                                                                                                                 |
| Oxlint JS plugins other than `@shadcn/lint` and Vite+'s own           | Alpha. basis-ui uses the rules Vite+ ships, including the `vite-plus/oxlint-plugin` its template enables, plus the one plugin that checks the design system.                                                                                                                       |
| Copying components into each app, shadcn's usual model                | The copies drift apart, and a fix reaches none of them. The package ships the components, and `no-restyle` keeps them alike.                                                                                                                                                       |
| Recharts, and shadcn's Chart on it                                    | Parallax draws every kind of chart needed, by the grid's number and time rules; a second chart library means a second look and a second formatter. It stays the fallback if spike 0.3 finds chart-only pages too slow.                                                             |
| React Hook Form                                                       | It is on the React Compiler's list of incompatible libraries.                                                                                                                                                                                                                      |
| Sonner                                                                | Base UI ships a toast, and shadcn added one for Base UI in July 2026.                                                                                                                                                                                                              |
| React Aria as a second component base                                 | shadcn has supported it since July 2026, but one base keeps every component alike, and Base UI is shadcn's default.                                                                                                                                                                |
| A theme per app, and themes a user edits                              | Every app looks alike: the themes are the library's, and the user picks among them. Several themes left this row on 2026-11-09, when the maintainer chose to ship them.                                                                                                            |
| Blur and backdrop filters                                             | Citrix desktops draw on the CPU.                                                                                                                                                                                                                                                   |
| Rust for components, forms or JSON                                    | No win to measure: the page's DOM work stays in JavaScript either way, and `JSON.parse` is native.                                                                                                                                                                                 |
| Prettier                                                              | Oxfmt ships with Vite+.                                                                                                                                                                                                                                                            |
| Bun                                                                   | Vite+ already installs packages (`vp install`) and manages Node (`vp env`); `bun test` has no browser mode; Vitest under Bun has open worker failures.                                                                                                                             |
| MCP servers                                                           | Every agent reads MCP settings from a different file.                                                                                                                                                                                                                              |
| Rejecting unknown fields in API responses                             | A UI and its API deploy separately; a UI that rejected a new field would break on every additive change.                                                                                                                                                                           |
| Parallax's server                                                     | The engine alone holds the tables in the browser: it loaded 2,000,000 trades with its limit lifted on 2026-11-09, and its target is 1,000,000 wide rows. Every app would have deployed a server beside it.                                                                         |
| Decimal strings for API numbers, and rates in percent or basis points | The maintainer's call on 2026-11-07, for the whole firm: one number type, a double that the UI rounds once at display by parallax's 15-digit rule, and one unit for rates, the fraction. Exact decimals stay inside parallax's sums, and `@basis/ui`'s `Decimal` class is deleted. |
| Storybook visual tests, Argos, Lost Pixel                             | Storybook's visual tests send stories to Chromatic's cloud, Argos's maintainers do not support self-hosting, and Lost Pixel was archived in April 2026. Playwright compares screenshots locally.                                                                                   |
| @hey-api/openapi-ts                                                   | It lists `typescript` as a peer, and TypeScript 7 ships no compiler API. orval also depends on TypeScript 6 since 8.45, but runs with it overridden to 7 (spike 0.2); hey-api was not tried that way.                                                                              |
| Starting fixture mode from each app's entry module                    | Every app would carry the same lines, and one without them would call nothing in `vp dev`; the preset starts it from `index.html`.                                                                                                                                                 |

## Facts behind the decisions

Each fact was checked on 2026-11-06 against the source named, unless it says secondhand.

| Fact                                                                                                                                                                                                                                                                                   | Source                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| typescript-eslint 8.72 peers on `typescript <6.1.0`; its maintainers closed TypeScript 7 support as not planned (issue #12518) while TypeScript 7.1's API is in progress (issue #10940)                                                                                                | npm registry; GitHub issues                                     |
| TypeScript 7.0.2 is npm's `latest` (2026-07-08); 7.1.0-beta shipped 2026-10-20; the 7.1 plan dates the RC 2026-11-10 and stable 2026-11-24                                                                                                                                             | npm registry; microsoft/TypeScript#63703                        |
| Oxlint's type-aware mode needs TypeScript 7 and covers 59 of typescript-eslint's 61 type-aware rules; its JS plugins are alpha and cannot use type information                                                                                                                         | oxc.rs docs                                                     |
| Vite+ is MIT-licensed and bundles Vite, Rolldown, Vitest, Oxlint, Oxfmt, tsdown and a task runner; it ships commit hooks through `vp config` and `vp staged`                                                                                                                           | viteplus.dev; GitHub release v1.5.0                             |
| Cloudflare announced on 2026-06-04 that it was acquiring VoidZero, which says its tools remain open source and MIT-licensed                                                                                                                                                            | voidzero.dev; the acquisition date is secondhand                |
| React Compiler 1.0 was released 2025-10-07                                                                                                                                                                                                                                             | react.dev                                                       |
| orval 8.46 generates TanStack Query hooks, Zod schemas and MSW mocks; since 8.45 its `@orval/zod` and `@orval/hono` depend on `typescript` 6.0.3, which a pnpm override replaces; @hey-api/openapi-ts 0.99, which FastAPI's own full-stack template uses, lists `typescript` as a peer | npm registry; fastapi/full-stack-fastapi-template               |
| Playwright's docs warn that rendering varies by operating system, version, settings and hardware, and advise making baselines where they are compared                                                                                                                                  | playwright.dev                                                  |
| Bun has no browser mode in `bun test`; Anthropic acquired Bun on 2025-12-03                                                                                                                                                                                                            | bun.com; anthropic.com                                          |
| shadcn/ui made Base UI its default in July 2026, with Radix still supported                                                                                                                                                                                                            | ui.shadcn.com changelog                                         |
| shadcn/ui added React Aria as a component base, and a Toast for Base UI projects, in July 2026; its theme tokens are OKLCH CSS variables, redefined under `.dark`                                                                                                                      | ui.shadcn.com changelog and theming page                        |
| `@shadcn/lint` 0.2.5 (2026-11-02) runs on ESLint or as an Oxlint JS plugin on Oxlint 1.80 or later; its rules are `no-restyle`, `no-raw-colors`, `no-arbitrary-values`, `no-inline-styles`, `no-unknown-classes` and `require-static-classes`                                          | npm registry; github.com/shadcn-ui/lint                         |
| Vite+ 1.5.0 pins `oxlint` 1.91.0 and `@oxlint/plugins` 1.91.0; its lint configuration lives in `vite.config.ts`'s `lint` block, which takes `jsPlugins`, `typeAware` and `typeCheck`                                                                                                   | npm registry; viteplus.dev/guide/lint                           |
| Oxlint's JS plugins have been alpha since 2026-03-11; no stable release was found                                                                                                                                                                                                      | oxc.rs blog; the absence of a stable release is secondhand      |
| The React Compiler's lint lists React Hook Form's `useForm` as an incompatible library, because the compiler memoizes what `watch()` returns                                                                                                                                           | facebook/react issue #29144 and pull request #35465, secondhand |
| Parallax's wasm build was 5.0 MB, or 1.07 MB gzipped, before export moved in, and is 1.01 MB brotli with it; Recharts 3.10.1's line and bar charts bundle to 408 kB minified, or 118 kB gzipped, without React                                                                         | Measured here on 2026-11-06 and in spike 0.3                    |
| Chromium's CDP CPU throttling does not reach Web Workers, so throttled figures for a worker-held engine need a CPU quota on the whole browser                                                                                                                                          | Spike 0.3                                                       |
| Parallax's engine holds about four times a table's Arrow size in memory, and an xlsx written in wasm about 190 bytes a cell, which WebAssembly never returns                                                                                                                           | Spike 0.3                                                       |
| orval 8.46's MSW mocks pick an enum field's value from `Object.values` of its Zod schema, which is no value of the enum, so a generated response with an enum failed its schema until `client-pull` rewrote the picks to the enum's `options`; its Arrow mock is 1 to 64 random bytes  | Measured here on 2026-11-07, and in spike 0.2                   |
| With its limits lifted in a copy of the built demo, parallax's engine at commit `bda50ad` loaded 2,000,000 trades, 608 MB of Arrow; its time and memory grew in a straight line with rows, and scrolling held a 16.7 ms frame at every size                                            | Measured here on 2026-11-09, with the GPU off                   |
| 1,000,000 trades, 304 MB of Arrow, drew their first rows in 2.5 s with 1.9 GB of browser memory, and in 9.9 s with 1.7 GB under spike 0.3's CPU quota, where a first sort of a text column took 2.4 to 2.7 s                                                                           | Measured here on 2026-11-09, with the GPU off                   |
| The grid parallax replaces, DevExpress's, manages about 200,000 rows                                                                                                                                                                                                                   | The review of 2026-11-09, secondhand                            |
| A Citrix session has about 4 virtual CPUs and 16 GB                                                                                                                                                                                                                                    | The maintainer on 2026-11-09, secondhand                        |
| On a canvas, Inter's digits are proportional: `1111111111` is 50 pixels wide and `0000000000` 80, where the DOM's `tabular-nums` gives 80 for both                                                                                                                                     | Measured here on 2026-11-09                                     |

## Not yet verified

Each item is a spike in [Phase 0 of the roadmap](roadmap.md#phase-0-spikes), or step 6.10, which runs spike 0.3's
Citrix repeat on the new engine:

- that `vp` installs on a Citrix desktop without admin rights, on Windows and in WSL, and installs from the internal npm
  feed;
- that Vite+'s hooks install on a fresh clone on Windows and in WSL (they do on Linux; Vite+ issue #2252 reports a
  case where they do not on Windows);
- that screenshots of the same page match between two Citrix desktops' WSL setups;
- that a Citrix session has about 4 virtual CPUs and 16 GB, as the maintainer reports, and how much memory its tab may
  use;
- that 1,000,000 wide rows load, sort and scroll within the budgets on a Citrix desktop, and so the limit in bytes that
  step 6.3.9 sets (step 6.10);
- how long parallax's wasm takes to download, compile and draw a first chart on a Citrix desktop (the same repeat);
- whether a Citrix desktop's display scaling leaves the canvases' text and rules sharp, and whether Windows has its
  animations turned off there (step 6.10);
- that the firm's Chrome and Edge are version 139 or later, which the canvas's tabular digits need: they come from a
  `font-feature-settings` descriptor in `@font-face`, which Chromium honours from 139 (step 6.4.1; the probe page of
  step 6.10 reports the version);
- that the firm's apps share a parent domain, for the cookie that holds the mode, density, motion and theme.
