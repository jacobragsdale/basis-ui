# Agent guide

This is the example app of the basis-ui repo: an app on the app shell and a generated client, built the way a
basis-ui app is, which proves the shell. It sits in the repo's workspace, so the repo's own `AGENTS.md`, and its
checks, apply too.

<!-- basis-ui:begin (written by vp run sync; edit outside the markers) -->

## basis-ui

This repo's `vite.config.ts` is `@basis/ui`'s preset, so it checks, builds and tests as every basis-ui app does, and
`vp run docs` lists the docs of the installed version, `vp run docs PAGE` printing one. Every task's failure is one
line that starts with `ERROR`, gives the reason and ends with the fix.

### Checks

```sh
vp install              # once per clone: installs dependencies and the hooks in .vite-hooks/
vp run verify           # every check, then one summary; --stage NAME for one, --json for the report
vp test                 # the tests in headless Chromium; BASIS_TEST_DOM=node vp test runs them in a Node DOM
vp build                # dist/, with FILE.br and FILE.gz beside each built file over 1 KB
vp run budget           # the build, then each route's JavaScript and CSS against its budget in vite.config.ts
vp run doctor           # this machine's setup, and the fix for each problem
```

`vp run verify` runs every stage to its end, whatever fails, then prints a line for each stage and, under it, one
`ERROR` line for each failure, with its file and line where the tool gives them, and its fix. `vp run verify --stage
lint --stage types` runs those stages alone, and `--json` prints the report as one line of JSON, the line that starts
with `{`: `{ok, stages: [{name, ok, ms, errors: [{file, line, rule, message, fix}]}]}`, `file`, `line` and `rule`
`null` where none is known.

The commit hook runs `vp staged`, then the stages that take seconds: sync, config, lint, types and suppressions. The
push hook runs `vp run verify`, every stage, the tests in the browser, the build and the budget among them. Never
skip either with `--no-verify`: fix what each `ERROR` line says, and commit or push again.

### The framework's files

`vp run sync` writes the files every basis-ui app shares from the installed `@basis/ui`: the `Dockerfile`, `Caddyfile`
and `.dockerignore`, `azure-pipelines.yml`, `.gitattributes`, `pnpm-workspace.yaml`, the hooks in `.vite-hooks/`,
`CLAUDE.md`, the skills in `.agents/skills/` and their copies in `.claude/skills/`, and this block of `AGENTS.md`. Each
opens with a line saying basis-ui manages it, and `vp run verify` fails when one differs, so never edit them: a
change one needs belongs in `@basis/ui`. Write the repo's own notes in `AGENTS.md`, outside this block's markers. `vp run upgrade` moves
`@basis/ui` and `@basis/parallax` to their latest release, or `vp run upgrade VERSION` to that one, then runs
`vp run sync` and `vp run verify`.

### The API and fixture mode

- `openapi.json` is the pinned copy of the API's document, and `src/api/generated/` the client generated from it,
  which the app imports through `src/api/client.ts`. `vp run client-pull PATH TAG` copies the document from a clone of
  the API repo at a tag, and `vp run client-pull URL` from a deployed API; both regenerate the client. Never edit
  either by hand.
- `vp dev` serves the app on a port of its own, derived from the folder, in fixture mode: no backend, `/api` answered
  from the records in `.fixtures/`, then the synthetic responses in `fixtures/`, then the generated client's handlers.
  `BASIS_API_URL=http://127.0.0.1:8000 vp dev` calls a live API instead, with `/api` removed from each path.
- `vp run shot ROUTE`, such as `vp run shot /` or `vp run shot "/positions?book=rates" --dark`, pictures a route of
  the running `vp dev` in headless Chromium and writes its screenshot, accessibility tree and console errors to
  `.shots/`. The drive-the-app skill says how to click through the app with Playwright CLI.

### Writing the app

- A page is a route in `src/routes.ts`; its `staticData` title and icon put it in the sidebar, the breadcrumbs and the
  command palette. Its component loads with `lazyRouteComponent`, so a page's code, and `@basis/parallax` with it,
  loads only when the page opens; give a new route a budget in `vite.config.ts` for `vp run budget`.
- `vp run new table|page|form NAME --operation ID` starts a page from an operation in `openapi.json`: the page, its
  test, a fixture and its route, which pass `vp run verify` as written. `vp run fixtures new OPERATION [--status 404]`
  writes a fixture whose body the schema accepts, and `vp run fixtures check` checks every fixture against it.
- Numbers stay as the API sends them until they are displayed: never round, scale or format a value before the
  component that shows it, which formats it with `@basis/ui`'s display formats.
- Tests are written with `@basis/ui/testing`, so they run in Chromium and in a Node DOM. A test that needs a real
  browser, such as one of layout or canvas, is named `*.browser.test.tsx`, and runs only in Chromium.
- `src/routes.test.ts` calls `checkRoutes(routeTree)`: one test for each route, rendered on the fixtures in
  `fixtures/` as `vp dev` answers them, failing with an `ERROR` line on a request nothing answers, an error the page
  reports, raises as a toast or logs, and what axe finds. A route with a parameter opens at a fixture's value for it,
  or at the sample `checkRoutes(routeTree, { params })` names, and is skipped without one. `expectAccessible()` runs
  the same axe check in any test. Colour contrast and target sizes need the page drawn: `vp run shot` checks them.
- `.fixtures/` holds records exported from an API's run store, which hold client data: it is never committed.

### Review

`vp run review` prints a pull request's summary, to paste into it: the commit `vp run verify` passed on, the
versions, the API's operations the change adds, removes or changes, and the client's diff. `vp run review BRANCH`
compares with the branch the pull request merges into, `origin/main` unless named.

<!-- basis-ui:end -->
