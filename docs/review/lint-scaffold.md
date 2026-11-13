# Pre-release review: lint rules, scaffolding, shot and fixture tooling

Fifteen real defects, one of them a release blocker on native Windows. I did not run Oxlint, so the rule findings come from driving the rules' own visitors over `oxc-parser` ASTs with a fake context, or from reading. Nothing in the repo was changed. Scratch scripts are in `(a scratch folder)`.

## Findings, most severe first

**1. `vp run shot` cannot stop the `vp dev` it starts on native Windows, so it hangs and leaks the server.**

- Where: `packages/ui/src/preset/dev-server.ts:62-72` and `:89-94`.
- Defect: `stopper` calls `process.kill(-child.pid, "SIGTERM")`, a POSIX process-group kill. On Windows it throws ESRCH, which the `catch` swallows as "It ended already".
- Scenario: on Windows with no dev server running, `vp run shot /positions` prints its report and never exits, because the detached child's pipes keep Node alive. `vp dev` stays on the port.
- Related:
  - Neither `shot.ts` nor `dev-server.ts` handles SIGINT or SIGTERM, so an interrupted or timed-out shot leaks the detached server on Linux and WSL too.
  - `spawn("vp", …)` relies on PATH, where `verify-tools.ts:28-53` deliberately runs the bin script through `process.execPath`.
- Severity: release blocker for native Windows; WSL is unaffected.
- Confidence: confirmed by reading (libuv's `uv_kill`), plus a simulation where a no-op stop kept the parent alive until the child exited. Not run on Windows.

**2. `basis/theme-classes` reports a comparison inside `cn()` as "a class built at run time", and its fix names a `cn` no app can import.**

- Where: `packages/ui/src/preset/lint-classes.ts:119` (any `BinaryExpression`), `:148` (reads `&&`'s left side), `:80-81` (message), and `packages/ui/README.md:815`.
- Scenario: `<td className={cn("tabular-nums", pnl < 0 && "text-loss")}>` is reported at `pnl < 0`, with advice to write `cn("p-2", wide && "p-4")`, the form already written. `selected === row.id && "bg-muted"` and `rows.length > 0 && "border-b"` fail the same way.
- `cn` is not in `dist/index.d.mts`, `catalogue.json` or `dependencies.ts`'s allowed list, so an agent that follows the message first hits a missing import, writes its own helper, then hits the false positive.
- Severity: fix before release.
- Confidence: confirmed by running the rule's visitors; no test lints a `cn(...)` call.

**3. The class rules only read literals written inline on a lowercase element.**

- Where: `lint-classes.ts:92-99` and `:141-149`; `@shadcn/lint` `dist/index.js:5584` (`require-static-classes` returns unless the site is a component) and `:3446-3451`.
- These all pass with no report:
  - `const tone = { bad: "bg-black text-white dark:bg-[#111] !p-4" }` used as `className={tone[status]}`
  - `className={toneOf(status)}`
  - `const cell = "dark:bg-muted !p-4 grayscale"` used as `className={cell}`
  - `{...{ className: "…" }}`
  - `"dark:bg-muted" as string`
  - `<Panel className="dark:bg-muted bg-black !p-4">` for a local component that forwards to a `div`
- The comment at `:140` says a constant "is read where it is written", but nothing reads it there.
- With a computed key or a helper call, the `@shadcn/lint` colour and arbitrary-value rules see nothing either, so `bg-[#16a34a]` in a status-to-class map ships.
- Severity: fix before release.
- Confidence: confirmed by running `theme-classes` and by reading `@shadcn/lint`.

**4. A multi-line block comment ending in `@ts-expect-error` or `@ts-ignore` evades both `basis/no-suppressions` and verify's text scan.**

- Where: `packages/ui/src/preset/suppressions.ts:34`; the pattern is anchored at the start of the whole comment.
- Scenario: `/* the API sends a string here\n * @ts-expect-error */\nconst hidden: number = "1";` returns `undefined` from `suppressionIn`.
- TypeScript honours it: the installed 7.0.2 reported only an unsuppressed control line. `typescript/ban-ts-comment` is off in app code, so nothing catches it.
- Severity: fix before release.
- Confidence: confirmed by running both the scanner and the compiler.

**5. Scaffolded pages pass the router's string path parameter straight to the generated hook.**

- Where: `scaffold-view.ts:48-55`, `scaffold-form.ts:87-111`, `scaffold.ts:115-121`.
- Scenario: `GET /trades/{trade_id}` with an integer parameter produces `const { tradeId } = useParams(…); const detail = useGetTrade(tradeId);`. orval types it `tradeId: number`, so the page fails `tsc` as written. An enum path parameter fails the same way.
- The example document has only string parameters, so `scaffold.test.ts` never meets this.
- Severity: fix before release.
- Confidence: confirmed by running the scaffolder's functions and reading orval's `getParams`.

**6. `vp run new form` imports `@tanstack/react-form`, which a template app does not have.**

- Where: `scaffold-form.ts:78`; `packages/create/templates/app/package.json`.
- The package is missing from the template, from `packages/consumer`, and from `@basis/ui`'s dependencies and peers. Only `packages/example` and `packages/showcase` list it.
- Scenario: in a fresh app the form page fails with TS2307, and the task's "Next, run" names no `vp add`. `scaffold.test.ts` passes because it copies `packages/example`.
- Severity: fix before release.
- Confidence: confirmed by reading.

**7. The form scaffold writes schema strings into JSX unescaped.**

- Where: `scaffold-form.ts:26-33` (attributes via `JSON.stringify`), `:139-141` and `:149-152` (button text).
- Scenario A: a field description `The side of the trade, "BUY" or "SELL".` becomes `description="…\"BUY\"…"`. JSX attributes take no backslash escapes, so the page is a syntax error and the task ends "vp fmt could not format …, which were written".
- Scenario B: a summary `Book the desk's trade` lands raw in JSX text and should fail `react/no-unescaped-entities` (the showcase writes `&apos;` for the same reason); `{`, `<` or `>` break the syntax.
- Cosmetic: `buttonText` lower-cases the summary ("Book FX trade" becomes "Book fx trade") and `wordsOf` turns the title "P&L Book" into "P l book".
- Severity: fix before release.
- Confidence: scenario A confirmed by running (oxc reports parse errors); the lint failure in B is by reasoning.

**8. The fixture check and the generated client disagree on `format: time`, and the example generator cannot satisfy several formats.**

- Where: `schema-example.ts:22-30`, `schema-check.ts:54`, `scaffold.ts:130`.
- `"14:30:00"`, as Pydantic sends it, passes the client's `zod.iso.time({})` and fails the check. `"14:30:00Z"` passes the check and fails the client.
- The generator's own `"14:30:00"` fails its own check, so `vp run fixtures new` and `vp run new` cannot work for any operation with a time field, and the advice to give the field an example does not help.
- `format: duration`, `ipv4`, an integer `multipleOf: 1000` and `uniqueItems` with `minItems: 2` also fail generation.
- `planOf` builds a fixture even when one already answers the request, so "write the fixture by hand" does not unblock `vp run new`.
- Severity: fix before release.
- Confidence: confirmed by running.

**9. The table scaffold picks a non-unique column as `getRowId`.**

- Where: `scaffold-view.ts:81-94`.
- Scenario: rows `{side: enum, book, quantity}` give `getRowId={(row) => row.side}`. By the same rule, positions with `book_id` and `security_id` get `row.book_id`.
- Real data then has duplicate row ids, which become duplicate React keys: rows duplicated or omitted on re-render and selection hitting several rows. The one-row fixture hides it from the generated test.
- Severity: fix before release.
- Confidence: confirmed by running.

**10. The form's generated test asserts fields the form never sends.**

- Where: `scaffold-tests.ts:95-131`, `schema-example.ts:44-51`.
- Scenario: a body schema with its own `examples: [{side, quantity, notes}]` and `required: [side, quantity]`. The test fills two fields and expects `sent` to equal all three, so it fails as written.
- Severity: fix before release.
- Confidence: confirmed by running.

**11. `basis/no-fetch` has easy evasions, and `apiFetch` is an unlinted bypass.**

- Where: `lint-plugin.ts:45-67`; `packages/ui/src/index.ts:645`; `src/api/fetch.ts:119-131`.
- Not reported: `const { fetch: send } = globalThis`, `const w = window; w.fetch(url)`, `(window as Window).fetch(url)`, `globalThis.window.fetch(url)`.
- More likely from a cooperative agent: `apiFetch<Trade[]>("/trades")` from `@basis/ui`. Its `schema` is optional and it returns `result as TResponse`, so a hand-typed, unvalidated call passes lint and types.
- Severity: fix before release for `apiFetch`; polish for the aliases.
- Confidence: confirmed by reading; the scope-dependent cases were not run.

**12. Verify's text scan is not string-aware.**

- Where: `suppressions.ts:88`.
- Scenario A: `const help = "https://wiki.example/help"; // eslint-disable-line` is consumed as a comment starting inside the URL, so no directive is found. The JSX form with `href="https://…"` fails the same way.
- Scenario B: any string containing `/*`, such as `"src/*"` or `accept="image/*"`, swallows the next real block comment.
- This scan exists as the backstop for blanket disables.
- Severity: polish.
- Confidence: confirmed by running the scanner; whether Oxlint's own `no-abusive-eslint-disable` still fires on a blanket `disable-line` was not checked.

**13. Route arguments are rewritten by Git Bash on Windows.**

- Where: `shot-options.ts:181-186`.
- Scenario: `vp run shot /positions` reaches the task as `C:/Program Files/Git/positions`, and the error says "a route starts with /, such as /positions". No doc or skill mentions this.
- Severity: fix before release for native Windows.
- Confidence: plausible; this is standard MSYS argument conversion, not run here.

**14. `vp run shot` reports `ok: true` for a path no route matches.**

- Where: `shot-route.ts:209-234`.
- Scenario: `vp run shot /positons --json`. `RouteNotFound` logs nothing, so the task exits 0 with a picture of "Page not found".
- Also: one route's 30 s load timeout under `--all` throws out of `shootEach`, and the report drops every earlier shot and its problems.
- Severity: polish.
- Confidence: confirmed by reading.

**15. Smaller scaffolder defects.**

- `api-operations.ts:209-211`: `modelName` keeps underscores and capitals where orval's `pascal` does not, so `Page_Trade_` is imported where the client exports `PageTrade`.
- `scaffold-route.ts:70-86`:
  - With `rootRoute.addChildren([home, adminRoute.addChildren([users]), audit])`, the new route is added inside `adminRoute`'s list while its `getParentRoute` says `rootRoute`.
  - A trailing `// comment` after the last child yields a syntax error.
- Severity: polish.
- Confidence: confirmed by running, with orval's own `pascal` for the first.

## Checked and found sound

- **Numeric separators**: Oxlint does not require grouped fraction digits, so `99.515625` in generated tests is fine.
- **Check versus client**: the fixture check and the generated client agree on `date-time` and `oneOf`.
- **Nested configs**: nested `.oxlintrc` files are disabled in Vite+ mode.
- **Message names**: every component, function and token the lint messages name exists, apart from `cn`.

## Overall quality

The area is better than its age suggests: modules are small and pure, every failure carries its fix, and Windows path separators and CRLF are handled nearly everywhere I looked. The weakness is that the tests prove what was built against one sample.

- **Lint tests**: all are "must refuse" probes plus one page that must pass, so false positives on ordinary idioms are invisible.
- **Scaffold tests**: they run only on `packages/example`, which has string path parameters, no quoted descriptions, no body examples, and a dependency the template lacks.
- **`devServer` tests**: none starts a server and stops it.
- **Narrow rules**:
  - `theme-classes` and `no-hand-rounding` are syntactic patterns for the single probe that motivated them.
  - `no-hand-rounding` misses `Math.floor(scaled) / 100` and flags `Math.floor(index / pageSize) / pages`.
- **Chromium**: the missing-browser message sends agents to `vp dlx playwright@X install chromium`, which downloads from Playwright's public CDN. It names neither `PLAYWRIGHT_DOWNLOAD_HOST` nor the installed Edge; I could not judge the firm's network.

## Not reached

- Not read: `fixture-page.ts`, `fixture-build.ts`, `tasks.ts`, the preset's `index.ts`.
- Read only as far as `devPort`: `fixture-mode.ts`.
- Test names only, not bodies: `shot-parts`, `shot-steps`, `shot-options`, `fixtures`, `fixture-check`, `fixture-files`, `display-formats`, `route-samples`.
- Read in full: the lint files, `suppressions.ts`, every `scaffold*.ts`, `schema-*.ts`, `fixture-new.ts`, `fixture-document.ts`, `fixture-files.ts`, `fixture-bodies.ts`, `display-formats.ts`, `api-operations.ts`, every `shot*.ts`, and `dev-server.ts`.
