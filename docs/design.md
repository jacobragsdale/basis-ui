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
as little of its own as it can. A UI repo's command is Vite+'s `vp`, and the verbs a developer knows from basis repos
mean the same thing here.

## What a developer sees

| Command | What it does |
|---|---|
| `vp check` | Formatting, linting and type checking together, plus whether the generated client still matches the repo's `openapi.json` |
| `vp test` | The Vitest suites, in Vitest's browser mode with the Playwright provider |
| `vp dev` | The app in fixture mode, on a free port per git worktree, with no backend |
| `vp run check-full` | `check` and `test`, plus screenshot comparison in WSL |
| `vp run shot ROUTE` | A screenshot of a page, its accessibility tree and its console errors |
| `vp run client-pull` | Copies the API's `openapi.json` from the API repo at a tag, or from a deployed API, and regenerates the client |
| `vp run review` | A pull request's summary: screenshot diffs, the client's diff, the versions, and the commit that was checked |
| `vp run sync`, `vp run upgrade` | Rewrite the framework's files from the installed version; update `@basis/ui`, sync and check in one step |
| `vp run doctor`, `vp run docs` | Check the desktop's setup and print the fix for each problem; print the docs for the installed version |

The `vp run` tasks come from `@basis/ui`'s preset, which an app's `vite.config.ts` spreads in, so every UI repo has the
same ones. As in basis, every file `vp run sync` writes opens with a line saying that basis-ui manages it, the drift
check fails when someone edits one, and every failure is one line that starts with `ERROR`, gives the reason and ends
with the fix.

A UI repo is made with `vp create` and `@basis/ui`'s template, if Vite+ accepts a template from a package, and with
`pnpm create @basis/app` if it does not.

## The packages

| Package | What it is |
|---|---|
| `@basis/ui` | The runtime and the toolchain: React components, the app shell, the Vite+ preset with its tasks and lint configuration, fixture mode, the template, and the UI's skills and docs |
| `@basis/parallax` | The grid, pivot table and charts, running in the browser |

Both are published to the internal npm feed, from this repo, a pnpm workspace. They release together, under one version
and one tag, such as `v0.4.0`, and `@basis/parallax` depends on `@basis/ui` at exactly its own version. basis-ui's
version line is its own, apart from basis's: the two meet at the contract, not at a shared version.

## A UI repo

| Path | Holds |
|---|---|
| `src/` | The app's routes, pages and components |
| `openapi.json` | The pinned copy of the API's document, which the client is generated from |
| `fixtures/` | Synthetic responses for fixture mode, in git |
| `.fixtures/` | Records exported from a basis API's run store by `basis records export`, which git ignores because they hold client data |
| `Dockerfile`, `azure-pipelines.yml` | An image that serves the built files with a static file server, and the deploy pipeline that calls the maintainer's team's templates |
| `AGENTS.md`, `CLAUDE.md`, `.agents/skills/`, `.claude/skills/` | The agent files, as basis writes them: `AGENTS.md` a short map, `CLAUDE.md` containing `@AGENTS.md`, and the skills copied for Claude Code |
| `.vite-hooks/`, `.gitattributes` | Vite+'s commit and push hooks, and LF line endings on Windows and in WSL alike |

## The toolchain, at its strictest

The UI is React 19.3 with the React Compiler 1.0. Its toolchain is Vite+, VoidZero's MIT-licensed `vp` command, which
bundles Vite 8 with Rolldown, Vitest 5, Oxlint, Oxfmt, tsdown and a task runner, configured in one `vite.config.ts`.
basis-ui adds no lint plugins of its own:

- TypeScript 7, the native compiler, with `strict` and every further check: `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `noImplicitOverride`, `noImplicitReturns`,
  `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `allowUnreachableCode: false`,
  `allowUnusedLabels: false`, `verbatimModuleSyntax`, `isolatedModules`, `erasableSyntaxOnly` and
  `noUncheckedSideEffectImports`.
- Oxlint with type-aware linting and type checking on, its built-in typescript, react, jsx-a11y, unicorn, import,
  promise, vitest and oxc plugins (the spike settles the exact list), and its correctness, suspicious, pedantic, perf,
  style and restriction categories at error. Its experimental nursery category stays off. Where two rules conflict, one
  is turned off, with a one-line reason beside it. A warning fails the check.
- Oxfmt with its defaults.

Dropping lint plugins costs two guarantees. Components the React Compiler cannot optimize used to show up as lint
errors; the compiler's `panicThreshold: "all_errors"` makes them build errors instead. The design-system rules (no raw
colours, no arbitrary values) have no built-in replacement; a Tailwind theme that defines only the firm's colours
removes off-palette classes from the CSS, which fails silently, so the screenshot tests are what catch it.

## The stack

TanStack Router, whose search parameters are typed and validated, serves apps that keep their filters and layouts in the
URL; TanStack Query holds server state; Tailwind 4 and Base UI, which shadcn/ui made its default in July 2026, make the
components; and Zod 4 guards every boundary.

The client is generated by orval from the repo's `openapi.json`: the types, a Zod schema per model, a TanStack Query
hook per operation, and MSW handlers for fixture mode. Generated types are not validation, so every response is parsed
by its schema before a component sees it. A response's schema checks every field it knows and drops the ones it does
not, so that an API can add a field without breaking a UI already deployed, as basis's contract promises.

The app shell owns startup, sign-in (it attaches the user's JWT to every request through orval's custom fetch), routing,
the generated client, telemetry, and how errors are shown, reading RFC 9457 problem details. Feature code reaches the
backend only through the generated client, which Oxlint's built-in `no-restricted-imports` and `no-restricted-globals`
(for `fetch`) enforce.

A UI and its API sit behind one host on the AKS cluster, the ingress routing `/api` to the API, so the browser makes no
cross-origin calls. Where that routing is not possible, the API declares the UI's origin as one it allows.

## Seeing the UI

Agents need to see what they build, so the UI runs without a backend. Fixture mode serves the MSW handlers orval
generates, the synthetic responses in `fixtures/`, and any records exported into `.fixtures/`. `vp dev` starts the app
on fixtures on a free port per git worktree, and `vp run shot ROUTE` writes a screenshot, the page's accessibility tree
and its console errors. Agents drive the browser with Playwright CLI, which Microsoft built for coding agents.

Screenshots differ between operating systems, as Playwright's docs warn, and the desktops run no Docker to pin a Linux
image in. So visual baselines are made and compared only in WSL, with the Chromium build Playwright pins and the fonts
`@basis/ui` bundles, and on Windows `vp run check-full` says it skipped the comparison and to run it in WSL. An agent on
Windows still takes screenshots to look at.

## Gates without CI

Every UI repo has Node, so basis-ui uses Vite+'s own hooks: `vp config`, run from the repo's `prepare` script, installs
them on every `vp install`. The commit hook runs `vp staged`, which formats and lint-fixes the staged files, then `vp
check` and `vp test`; the push hook runs `vp run check-full`. `vp run review` writes the pull request's summary, so a
reviewer judges screenshots and the client's diff rather than lines of agent-written code. A hook can be skipped with
`--no-verify`, so until CI exists the gates are only as strong as the hooks; the generated pipeline already runs `vp run
check-full`, and a branch policy on `main` that requires it turns the checks into the gate the day the firm builds CI.

## Parallax: @basis/parallax

Parallax runs only in the browser. Its Rust engine, compiled to WebAssembly, runs in a Web Worker so that pivots never
block the page on a shared Citrix CPU, and it loads Arrow that the app fetches from its API through the generated
client. Its server and connectors are deleted: the WebSocket server, the dataset registry and its hot reload, the expose
rules and the SQL registry, the SQL Server, Oracle, Mongo, Parquet and HTTP connectors, the NFS cache, ODBC and Oracle
Instant Client, and CI's three database containers. About 3,000 lines of Rust go, and about 15,000 stay: the engine, the
session layer, the protocol between the page and its worker, and the wasm wrapper. Excel export moves into the wasm
build.

The reason is the data's size. The firm's tables are not millions of rows, so a server that holds data the browser
cannot is cost without benefit, and every app would have needed one deployed beside it. A documented row limit, measured
on a Citrix desktop, replaces it: a larger load fails with a message saying so. React components replace the 44 Angular
files of its web layer; the canvas renderers, the formatter, the charts and the technical-analysis tools stay, as do the
DuckDB and Perspective comparisons that test the engine's numbers. App developers install one npm package with the wasm
built into it, and Rust stays inside this repo's build. Parallax keeps its Apache-2.0 license.

## Versions

TypeScript 7.0.2 is the stable release and 7.1 is in beta. The 7.1 plan schedules its release candidate for 2026-11-10
and its stable release for 2026-11-24, but its beta shipped two weeks behind that plan. Work starts on the 7.1 beta,
since tsdown recommends 7.1, and releases pin 7.1 stable if it has shipped by then, or 7.0.2 if not. Node is the current
LTS, managed by `vp env`.

## Decided against

| Option | Why not |
|---|---|
| Staying on Angular | The maintainer's call. The measured evidence is thin either way: in DesignBench, Claude 3.7's Angular compiled less often than its React when writing a page from scratch (0.69 against 0.95), and almost as often when editing one (0.91 against 1.00). |
| A UI inside basis, or a UI in an API's repo | Each repo has one toolchain, and each project one language. |
| A command of basis-ui's own | Vite+'s `vp` already runs checks, tests and tasks; the preset adds the rest as `vp run` tasks. |
| typescript-eslint | It does not support TypeScript 7, which ships no compiler API; its maintainers closed the request as not planned until TypeScript 7.1's API lands. |
| Oxlint JS plugins | Alpha. basis-ui uses the rules Vite+ ships. |
| Prettier | Oxfmt ships with Vite+. |
| Bun | Vite+ already installs packages (`vp install`) and manages Node (`vp env`); `bun test` has no browser mode; Vitest under Bun has open worker failures. |
| MCP servers | Every agent reads MCP settings from a different file. |
| Rejecting unknown fields in API responses | A UI and its API deploy separately; a UI that rejected a new field would break on every additive change. |
| Parallax's server | The firm does not need million-row tables in the browser, and every app would have deployed one. |
| Storybook visual tests, Argos, Lost Pixel | Storybook's visual tests send stories to Chromatic's cloud, Argos's maintainers do not support self-hosting, and Lost Pixel was archived in April 2026. Playwright compares screenshots locally. |
| @hey-api/openapi-ts | It lists `typescript` as a peer, and TypeScript 7 ships no compiler API; orval depends on no `typescript` package. |

## Facts behind the decisions

Each fact was checked on 2026-11-06 against the source named, unless it says secondhand.

| Fact | Source |
|---|---|
| typescript-eslint 8.72 peers on `typescript <6.1.0`; its maintainers closed TypeScript 7 support as not planned (issue #12518) while TypeScript 7.1's API is in progress (issue #10940) | npm registry; GitHub issues |
| TypeScript 7.0.2 is npm's `latest` (2026-07-08); 7.1.0-beta shipped 2026-10-20; the 7.1 plan dates the RC 2026-11-10 and stable 2026-11-24 | npm registry; microsoft/TypeScript#63703 |
| Oxlint's type-aware mode needs TypeScript 7 and covers 59 of typescript-eslint's 61 type-aware rules; its JS plugins are alpha and cannot use type information | oxc.rs docs |
| Vite+ is MIT-licensed and bundles Vite, Rolldown, Vitest, Oxlint, Oxfmt, tsdown and a task runner; it ships commit hooks through `vp config` and `vp staged` | viteplus.dev; GitHub release v1.5.0 |
| Cloudflare announced on 2026-06-04 that it was acquiring VoidZero, which says its tools remain open source and MIT-licensed | voidzero.dev; the acquisition date is secondhand |
| React Compiler 1.0 was released 2025-10-07 | react.dev |
| orval 8.46 generates TanStack Query hooks, Zod schemas and MSW mocks, and depends on no `typescript` package; @hey-api/openapi-ts 0.99, which FastAPI's own full-stack template uses, lists `typescript` as a peer | npm registry; fastapi/full-stack-fastapi-template |
| Playwright's docs warn that rendering varies by operating system, version, settings and hardware, and advise making baselines where they are compared | playwright.dev |
| Bun has no browser mode in `bun test`; Anthropic acquired Bun on 2025-12-03 | bun.com; anthropic.com |
| shadcn/ui made Base UI its default in July 2026, with Radix still supported | ui.shadcn.com changelog |

## Not yet verified

Each item is a spike in [Phase 0 of the roadmap](roadmap.md#phase-0-spikes):

- that `vp` installs on a Citrix desktop without admin rights, on Windows and in WSL, and installs from the internal npm
  feed;
- which of Oxlint's rules conflict at the strictest settings, and that type-aware Oxlint and tsdown work on TypeScript
  7.1 beta;
- that the React Compiler's `panicThreshold` still exists and fails the build;
- that Oxlint has `no-restricted-imports` and `no-restricted-globals` built in;
- that a preset spread into `vite.config.ts` can add `vp run` tasks, and that `vp create` accepts a template from a
  package;
- that Vite+'s hooks install on a fresh clone on Windows and in WSL (Vite+ issue #2252 reports a case where they do
  not);
- that orval emits Zod 4 schemas that drop unknown fields, TanStack Query v5 hooks and MSW 3 handlers, and handles an
  Arrow response;
- that screenshots of the same page match between two Citrix desktops' WSL setups;
- that rust_xlsxwriter builds for wasm, and how many rows parallax holds on a Citrix desktop.
