# @basis/ui

The firm's React design system and toolchain: the theme, the components and their icons, the Vite+ preset, the app
shell (`BasisApp`, sign-in, telemetry and error display), the generated API client's configuration and tasks, and the
numbers, dates, securities and utils modules.

This README is for an app built on `@basis/ui` and the agent that writes it. `vp run docs` prints it, a section at a
time, and every component, hook, function and type the package exports, as [Looking things up](#looking-things-up-vp-run-docs)
says. What changed in each version is in `CHANGELOG.md`, which `vp run docs ui/changelog` prints. How the package
itself is built, and how a component is added to it, is in basis-ui's repo, in `packages/ui/CONTRIBUTING.md`.

## How to build an app on @basis/ui

An app takes its checks, its plugins, its stylesheet, its components and its icons from this one package, and declares
no styles of its own.

Prerequisites: an app repo, in git, with `react` and `react-dom` 19.3, `@tanstack/react-query` 5, `@tanstack/react-router`
1 and `zod` 4 as dependencies, and `vite-plus` 1.5.0, TypeScript 7.0, `msw` 3 and `@faker-js/faker` 10 as dev
dependencies. Until `@basis/ui` is published to the internal feed, install it from a tarball made with `vp pm pack`
in basis-ui's `packages/ui`. Those, `@basis/parallax`, `@tanstack/react-form`, `apache-arrow`, `@types/react`,
`@types/react-dom` and `vitest-browser-react` are the packages an app may depend on: `vp run sync --check` refuses any
other, and names what replaces one basis-ui decided against, such as `recharts` or `react-hook-form`. A new one is
added to `@basis/ui`'s list by basis-ui's maintainer.

orval, which generates the client, brings TypeScript 6 with it, through `@orval/zod` and `@orval/hono`. Keep one
TypeScript in the tree by overriding it in `pnpm-workspace.yaml`, then reinstall and check that `pnpm why typescript`
finds one version, again after each orval upgrade. orval also brings esbuild, whose install script pnpm refuses to run
unless told; it only checks the binary pnpm installs anyway, so tell pnpm not to run it:

```yaml
overrides:
  typescript: 7.0.2 # the app's own TypeScript
allowBuilds:
  esbuild: false
```

To set the app up:

1. Make `vite.config.ts` the preset, its plugins and its tests:

   ```ts
   import { basisPlugins, basisPreset, basisTest } from "@basis/ui/preset";
   import { defineConfig } from "vite-plus";

   export default defineConfig({
     ...basisPreset({ budget: { "/": { css: 25, js: 180 } } }),
     plugins: basisPlugins(),
     test: await basisTest(),
   });
   ```

   `basisPreset()` brings the lint, format and staged-file configuration, with `@shadcn/lint`'s design-system rules,
   and the `vp run` tasks. Its `budget` is what each route may load, which `vp run budget` checks, as
   [Weighing the build](#weighing-the-build-vp-run-budget) says. `basisPlugins()` adds React with the React Compiler, which fails the build on a component
   that breaks the rules of React with an `ERROR` line naming the fix above the compiler's own text, Tailwind, and the head script: an inline `<script>` that `vp dev` and `vp build`
   write at the end of `index.html`'s `<head>`, which applies the stored mode, density, motion and theme before the first paint. Its
   text is `headScript`, exported from `@basis/ui`; the app keeps no copy of it. In `vp test` it also has Vite
   pre-bundle what every module under `src/` imports before the tests start, so no dependency that only app code
   imports is found mid-run, which would reload the test pages under the tests. In `vp dev` it serves the app on a
   port of its own and in fixture mode, as [Running the app in fixture mode](#running-the-app-in-fixture-mode) says.
   `basisTest()` runs `vp test` in headless Chromium through Playwright.

2. Install the Chromium that the preset's Playwright pins:

   ```sh
   vp dlx playwright@1.65.0 install chromium
   ```

3. Make `src/styles.css` this one line, and import it from the entry module, `src/main.tsx`, as `import "./styles.css";`:

   ```css
   @import "@basis/ui/styles.css";
   ```

   It brings Tailwind, the theme with its fonts, and the classes the components use, which Tailwind would otherwise
   miss, since it does not scan `node_modules`. An app that uses `@basis/parallax` adds
   `@import "@basis/parallax/styles.css";` below it, and nothing else: an app declares no colour, utility, variant or
   class, and `vp run sync --check` fails on a stylesheet, a `tsconfig.json` or a `vite.config.ts` that holds more than
   the lines this list shows, a budget and `basisTest({ browser: false })` aside.

4. Make `tsconfig.json` extend the strict tsconfig, which also sets JSX and Vite's client types:

   ```json
   {
     "extends": "@basis/ui/tsconfig.json",
     "include": ["src", "vite.config.ts"]
   }
   ```

5. Import the components and icons from the package's root:

   ```tsx
   import { Badge, Button, ButtonLink, Card, CardContent, ChevronDownIcon } from "@basis/ui";
   ```

6. Name `.fixtures/` in the app's `.gitignore`. It holds the records `basis records export` writes for fixture mode,
   which hold client data and are never committed. In an app made from the template, `vp run sync` writes the
   `.gitignore` and the drift check keeps it.

`vp build` also writes `FILE.gz` and `FILE.br` beside each built file over 1 KB that compression helps (scripts,
styles, HTML, JSON, SVG, wasm, Arrow), so the server sends the smaller one the browser accepts without compressing on
each request: Brotli at quality 11, or 9 for a file over 1 MB, and gzip at 9. It adds about 0.1 s to the example's
build and 0.3 s to parallax's demo's, whose 5 MB of wasm ships as 1.1 MB. A server should send `Cache-Control:
public, max-age=31536000, immutable` for the hashed files in `assets/` and `no-cache` for `index.html`.

To confirm the setup, run `vp check`, `vp test` and `vp build`. The built `dist/index.html` holds the head script, in
a `<script>` before `</head>`.

## Looking things up: `vp run docs`

`vp run docs` prints the docs of the `@basis/ui` and `@basis/parallax` the app has installed, so what it says is true of
the code the app runs. They come from this README and from `@basis/ui/catalogue.json`, the catalogue of everything the
two packages export, which is read from their source and checked against it in every release.

```sh
vp run docs                        # the pages, the modules, and each family's main component
vp run docs Select                 # one component: what it is for, when to use it, what goes with it, its props and an example
vp run docs numberText             # a hook or function, with its signature; a type, with its fields; or a module, such as dates
vp run docs --search "date range"  # the components, functions, types and pages whose name or purpose holds the words
vp run docs ui/calling-the-api     # a section of this README; calling-the-api alone finds it too
vp run docs Select --json          # any of the above as JSON
```

A component lists the props it declares and the ones it takes from Base UI, with their defaults, and the element whose
props it also takes, such as a `<div>`'s. A name the docs do not have fails with the names closest to it.

The catalogue, as JSON, holds for each module what it is for; for each component its family, what it is for, when to
use it (`use`) and what goes with it (`with`), its props with their types, docs and defaults, its variants, and one
example for each family, which compiles in an app set up as this README says; each hook, function, class and constant
with its signature; each type that any of those names, with its fields; and the icons, by name. An agent that cannot run
the task reads the file.

## Starting the app

`BasisApp` is the app: it signs the user in, then renders the router's routes inside the providers every app shares.
An app's entry point and router are these two files:

```tsx
// src/router.ts
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routes.ts";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export { router };
```

```tsx
// src/main.tsx
import "./styles.css";
import { BasisApp, fakeSignIn } from "@basis/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { router } from "./router.ts";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("index.html has no #root element for the app to render into.");
}
createRoot(root).render(
  <StrictMode>
    <BasisApp router={router} signIn={fakeSignIn()} />
  </StrictMode>,
);
```

`BasisApp` takes:

| Prop                | What it is                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `router`            | The app's TanStack Router. Its routes render once the user is known.                                                                           |
| `signIn`            | The sign-in adapter: the firm's, when it is built, `anonymousSignIn()` for an app with no sign-in, or `fakeSignIn()` in tests and development. |
| `telemetry`         | Where errors, events and timings go; `consoleTelemetry` by default.                                                                            |
| `queryClient`       | The TanStack Query client, for a test that reads its cache; one from `createQueryClient()` by default.                                         |
| `preferencesDomain` | The parent domain the firm's apps share, such as `apps.example.com`. None by default, so the user's choice is this app's alone.                |

Inside it, in order: the telemetry, the query client, the toasts (`Toaster`), an error boundary round the whole app,
the signed-in session, and the router. It keeps the page in the user's mode, density, motion and theme as they change
them (`followPreferences`), and gives `apiFetch` the adapter's token, so every request carries the user's JWT.

- **Preferences.** The user's mode, density, motion and theme live in the `basis-ui-preferences` cookie, which the user
  menu writes and the head script reads before the first paint. Without `preferencesDomain` the cookie is the app's
  alone. With it, as `<BasisApp preferencesDomain="apps.example.com" ...>`, the cookie sits on that domain, so a choice
  made in one app holds in every app under it, and a page left open in another app follows: at once through the cookie
  store's change event on a page served over HTTPS, and otherwise when the user comes back to the page. A choice the
  app kept for itself before is moved onto the domain. On a host outside the domain, such as `localhost` in
  development, the cookie stays the app's alone, since the browser would refuse it. Give the same domain in every app.

- **Queries.** `createQueryClient()` keeps data fresh for 30 seconds and retries a query twice, but only after a
  network failure or a 502, 503 or 504, which basis's contract says may pass; a 4xx, a 500 or a response its schema
  refused shows at once. A mutation retries twice only after a `keys-unavailable` 503, which basis answers before any
  handler runs; after any other failure the write may have happened, so it is the user's to repeat.
- **Routes.** Unless the router sets its own, `BasisApp` gives it an error component, which shows the error on an
  `ErrorAlert` with "Try again", and a not-found page that links to `/`.
- **Session.** `useSession()` returns `{ user, signIn, signOut }`. `signIn()` and `signOut()` go through the adapter,
  then drop every cached response, which was the last user's, and ask again for what the page shows.
- **Sign-in problems.** A query or mutation that fails with a 401 of type `invalid-token` means the session has ended:
  `BasisApp` signs the user out through the adapter and raises a toast, "Your session has expired", whose "Sign in"
  signs them in again. One of type `sign-in-required` raises a toast that asks the user to sign in. A failed mutation
  raises that toast instead of its error toast. A `keys-unavailable` 503 is retried, as above, and never signs the
  user out.
- **Telemetry.** `useTelemetry()` returns `{ error, event, timing }`. `BasisApp` reports each error its boundary, the
  router or a failed query or mutation meets, with a `source` attribute (`render`, `route`, `query`, `mutation`,
  `sign-in`), and each navigation's time as `navigation`. An app reports its own: `useTelemetry().event("position.booked",
  { book })`. The firm's collector will be a `Telemetry` of its own; `consoleTelemetry` writes to the console.

A sign-in adapter is four functions, `{ currentUser, token, signIn, signOut }`: `currentUser()` resolves the signed-in
`User` (`{ id, name, email? }`) or `null`, and `BasisApp` shows nothing of the app until it does; `token()` resolves the
JWT for the next request, or `null`; `signIn()` signs in a user who is anonymous or whose session ended, and may leave
the page for the sign-in system's; `signOut()` ends the session. `fakeSignIn({ user, issuer, audience, claims })`
signs in `user` at once (a placeholder user by default, `null` for an anonymous one, whom `signIn()` signs in as the
placeholder user) and signs each token with the development key basis publishes, so a basis API on a developer's
desktop, such as `basis dev`'s, accepts it when `issuer` and `audience` match its `BASIS_IDENTITY__ISSUER` and
`BASIS_IDENTITY__AUDIENCE` (`basis-development` by default). Every other API refuses it.

An app with no sign-in system, such as a ctzd dashboard, passes `anonymousSignIn()`: every user is anonymous, requests
carry no token, and the adapter's `offersSignIn: false` tells the shell never to ask anyone to sign in. If an API answers
`sign-in-required` or `invalid-token` anyway, the shell says the page can't load, with no sign-in button, and reports
why through telemetry: the API's route must allow anonymous users.

## Calling the API

The client is generated by orval from the app's `openapi.json`, the pinned copy of its API's document, into
`src/api/generated`, which no one edits. Copy the document and generate the client with `vp run client-pull`:

```sh
vp run client-pull ../positions-api v1.4.0                         # from a clone of the API repo, at a tag
vp run client-pull https://positions.example/api/openapi.json      # from a deployed API
vp run client-pull                                                 # regenerate from the openapi.json already here
```

`vp dev` runs the app in fixture mode, with no API, as [Running the app in fixture mode](#running-the-app-in-fixture-mode)
says. To run it against a live API instead, such as `basis dev`'s on the desktop, set `BASIS_API_URL` to its address,
as in `BASIS_API_URL=http://127.0.0.1:8000 vp dev`: the preset sends `/api` to it with the prefix removed, as the
ingress does, `fakeSignIn()`'s tokens sign the user in, and fixture mode is off.

`vp run client-check`, which `vp run verify` runs as its client stage, fails when `src/api/generated` is not what
`openapi.json` generates, one line for each file. Its fix is `vp run client-pull`, which keeps the repo's `openapi.json`
when the client cannot be generated from the copy it pulls. `vp run verify` also checks each fixture in `fixtures/`
against `openapi.json`, as `vp dev` does, so one the document has left behind fails, and type-checks the whole app with
the installed TypeScript's `tsc --noEmit`, the generated client included, since `vp check` lints around it, as
[Checking the app](#checking-the-app-vp-run-verify) says. `@basis/ui/orval` exports `basisOrval()`, the
configuration both tasks use, from spike 0.2: a Zod 4 schema for each model, which drops fields it does not know, a
TanStack Query v5 hook for each operation, with every response parsed by its schema, and MSW handlers for each
operation and status. Two settings never change: `zod.strict` stays off, since it would make every response refuse a
new field, and `override.zod.schemaExtension` is never set, since it is the one path on which orval calls TypeScript's
compiler API, which TypeScript 7 does not have.

Code outside `src/api` imports the client through two files of the app's own, which re-export the generated ones:

```ts
// src/api/client.ts
/* oxlint-disable oxc/no-barrel-file -- the generated client's whole surface, which changes on every pull. */
export * from "./generated/client.ts";
export * from "./generated/model/index.ts";
```

```ts
// src/api/mocks.ts: the MSW handlers, for tests and fixture mode
// oxlint-disable-next-line oxc/no-barrel-file -- the generated handlers, which change on every pull.
export * from "./generated/client.msw.ts";
```

The preset's lint keeps feature code on them: outside `src/api`, `axios` and any import of `api/generated` fail with the
import to use instead, and everywhere, `src/api` included, so do `fetch` (also as `globalThis.fetch`),
`XMLHttpRequest`, `WebSocket`, `EventSource` and `navigator.sendBeacon`; a value that changes is polled through the
operation's hook with `refetchInterval`.

Those two comments are the only ones an app may write to turn a check off. `basis/no-suppressions` refuses any other
`oxlint-disable` or `eslint-disable` comment, which only `oxc/no-barrel-file` in `src/api` passes, and every
`@ts-expect-error`, `@ts-ignore` and `@ts-nocheck`: fix what the rule or the compiler reports instead, and parse a
value of unknown shape with a zod schema. A comment that turns off every rule hides from the lint as well, so
`vp run verify` reads `src/` as text for them, and `vp run review` counts them.

A hook returns the response as `{ data, status, headers }`, so a component reads `query.data.data`, and its error is an
`ApiError` holding the API's problem details. Show it with `ErrorAlert`, which renders nothing while there is no error:

```tsx
import { ErrorAlert } from "@basis/ui";
import { useGetPositions } from "#api/client.ts";

const positions = useGetPositions();

<ErrorAlert
  error={positions.error}
  onRetry={() => {
    positions.refetch().catch(reportError);
  }}
/>;
```

`ErrorAlert` shows the problem's title, its detail, each field a 422 names (`legs[0].price: Must be positive`) and the
request's reference, and words of its own for a lost connection or a response that broke its schema. A failed
mutation raises a toast of the same words through `toastError`, unless the mutation says otherwise, as a form that puts
the errors on its fields does:

```ts
useCreatePosition({ mutation: { meta: { errorToast: false } } });
```

`describeError(error)` gives the same words, `{ title, detail, fields, reference }`, for a display of an app's own.

A dataset route, one whose success lists Arrow, is generated to ask for Arrow, and its hook's data is a `Blob` of the
Arrow IPC stream.

In tests, MSW stands in for the API: `basisPlugins()` serves its service worker's script in `vp dev` and `vp test`
only, and `mockApi` from `@basis/ui/testing` starts it, or MSW's Node server where there is no browser, as [Testing the
app](#testing-the-app) shows, in Chromium and in a Node DOM alike.

## Starting a page from an operation: `vp run new`

`vp run new` writes a page from an operation in `openapi.json`, so an agent starts from code that passes the app's
checks rather than from a blank file:

```sh
vp run new table positions --operation list_positions   # a DataTable of the rows a GET answers
vp run new page bond --operation bond                   # a card of the fields a GET answers
vp run new form new-trade --operation book_trade        # a form for the body an operation takes
```

Each writes four things: `src/pages/NAME.tsx`; its test, `src/pages/NAME.test.ts`, written with `@basis/ui/testing`
and served the fixture's body by the generated client's handler; `fixtures/NAME.json`, whose body the schema accepts,
unless a fixture in `fixtures/` answers that request already; and the route `/NAME` in `src/routes.ts`, with a segment
for each path parameter, as `/bond/$security`, its page loaded with `lazyRouteComponent`. Each page is a `Page`, titled by
NAME. A table has a column for
each field of a row, and a page a line for each field, each number shown by the display format the API declares,
through `displayFormats`. A form has a field for each one the body requires: an amount in `AmountInput`, a date in
`AsOfDatePicker`, a choice in `NativeSelect`, a flag in `Checkbox`, text in `Input`; its schema is the generated one,
a 422 lands on the fields it names, and a success raises a toast. A field that holds an object or a list is left out,
and the page's opening comment names it. Then it prints what to run next:

```text
Wrote src/pages/positions.tsx, src/pages/positions.test.ts and fixtures/positions.json, and added the route /positions to src/routes.ts.
Next, run:
  vp run verify
  vp run shot /positions
```

It never overwrites a file: run it again with `--force` to replace the page, its test and its fixture. An operation the
document lacks fails with the closest ids it has, and one a scaffold cannot make that kind of page from, such as a
table of one object, a dataset route, whose rows are parallax's grid's, or an operation that requires query parameters,
fails with what to do instead. Give the new route a budget in `vite.config.ts` for `vp run budget`.

## Running the app in fixture mode

`vp dev` runs the app with no API. MSW's service worker answers every request under `/api`, from three sources in this
order:

1. **Records** in `.fixtures/`: exchanges with a real API, which `basis records export` writes. They hold client data,
   so the app's `.gitignore` names `.fixtures/`, and a record is never committed.
2. **Fixtures** in `fixtures/`: synthetic responses the app writes and commits, in the same format as a record.
3. **orval's generated handlers**, one for each operation, which answer with made-up data.

The first record or fixture whose method, path and query match the request answers: the records first, then the
fixtures, each folder's files in the order of their names, subfolders included. The request's body is not matched, so
one fixture answers every `POST` to its path. A request that neither holds goes to orval's handlers, except a request for
Arrow: orval's handlers make random bytes, not Arrow, so fixture mode answers it with a `501` problem of type
`fixture-missing`, which says to add a fixture, as it does a request nothing answers.

The app writes no code for it. In `vp dev`, the preset's plugin rewrites `index.html` so that a script starts the
worker, with the fixtures it read and the handlers in `src/api/generated/client.msw.ts`, before the app's entry module
runs. `vp build` and `vp test` leave the page alone, and `BASIS_API_URL` turns fixture mode off.

`vp dev` serves each app on a port of its own, from 20000 to 29999, derived from the app's folder: the same port on
every run, and another in another git worktree, so worktrees running at once never collide. If another program holds
the port, Vite takes the next free one. `vp dev --port 5173`, or `server.port` in `vite.config.ts`, chooses one. It
prints the address and what answers `/api`:

```text
  ➜  Local:   http://localhost:28765/
  ➜  Fixture mode: /api is answered by 0 records in .fixtures/, then 5 fixtures in fixtures/, then orval's generated handlers. Set BASIS_API_URL to call a live API instead.
```

In the browser's console, each answer is a telemetry event, `fixture.answered`, written by `consoleTelemetry`, whose
`source` is `record`, `fixture`, `generated` or `none`, and whose `file` names the record or fixture:

```text
[telemetry] event fixture-mode.started {fixtures: 5, generated: 7, records: 0}
[telemetry] event fixture.answered {request: GET /bonds/US91282CRF04, source: fixture, status: 200, file: fixtures/bond-US91282CRF04.json}
```

Commit a fixture for each request a page makes. orval's made-up data passes the response's schema but rarely looks like
the API's: names are random letters and amounts random numbers. (orval 8.46 picks an enum's value from `Object.values`
of its Zod schema, which is no value of it; `vp run client-pull` rewrites those picks to the enum's `options`.)

### Writing a fixture

A fixture is one JSON file holding one exchange, and an app commits one for each request its pages make:

```json
{
  "format": "basis-ui-fixture/1",
  "operation_id": "bond",
  "recorded_at": "2026-11-07T12:00:00Z",
  "request": { "method": "GET", "path": "/bonds/US91282CRF04" },
  "response": {
    "status": 200,
    "media_type": "application/json",
    "body": {
      "security_id": "US91282CRF04",
      "coupon_rate": 0.04125,
      "convention": "30/360",
      "frequency": 2,
      "issued": "2026-05-15",
      "maturity": "2036-05-15"
    }
  }
}
```

`vp run fixtures new OPERATION` writes one, `fixtures/OPERATION.json`, with a body the schema accepts: the schema's
examples where it gives them, and the smallest values of each field's type, format and pattern otherwise.
`vp run fixtures new OPERATION --status 404` writes `fixtures/OPERATION-404.json`, a problem details body whose type and
title come from the response's description, at another path parameter than the success's, so both answer. It never
overwrites a file but with `--force`. Replace the made-up values with ones that look like the API's.

A problem is a fixture too: a `404` with `"media_type": "application/problem+json"` and the problem as its body. A
dataset route's fixture holds an Arrow IPC stream, in base64, as `body_base64`, with `"media_type":
"application/vnd.apache.arrow.stream"`: write the table with apache-arrow's `tableToIPC(table, "stream")`, or pyarrow's
`ipc.new_stream`, with the column types basis's contract gives a dataset (`date32` for a date, `float64` for a
number, and so on), and encode the bytes in base64.

When `vp dev` starts, and whenever a file in `fixtures/` or `.fixtures/`, or `openapi.json`, changes, every file is
checked and the page reloads. Each problem is one `ERROR` line in the terminal, ending with its fix, and the page shows
them over itself until they are fixed:

```text
ERROR fixtures/bond.json: GET /api/bonds/US91282CRF04 is not operation bond, which is GET /bonds/{security}, and a path leaves out /api; correct it by the record format in @basis/ui's README, under Running the app in fixture mode, or delete it.
```

A file must be in the record format below, name an operation in `openapi.json`, have that operation's method and a
path its template matches, and, when it has a body, a media type the operation declares for its status and a body
that status's schema accepts, read as the generated client reads it: each field it declares checked, and a field it
does not declare passing. `vp run fixtures check`, which `vp run verify` runs, checks every file in `fixtures/`. A dataset
route's success must be Arrow, since the generated client asks a dataset route only for Arrow.

### The record format

One file holds one exchange, as one JSON object:

| Member                 | Holds                                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`               | `"basis-ui-fixture/1"`, the format and its version                                                                                                                    |
| `operation_id`         | The operation's id in the API's document, such as `bond`                                                                                                              |
| `recorded_at`          | When the API answered, or when a fixture was written, with its offset: `2026-11-06T14:30:00Z`                                                                         |
| `request.method`       | `GET`, `POST`, `PUT`, `PATCH` or `DELETE`                                                                                                                             |
| `request.path`         | The path as the request's URL holds it, percent-encoded, without `/api`: `/bonds/US91282CRF04`                                                                        |
| `request.query`        | Optional. Each query key with its values in the URL's order: `{"security": ["A", "B"]}` for `?security=A&security=B`. None, or `{}`, is no query                      |
| `request.body`         | Optional. The request's JSON body, kept for reading; fixture mode does not match on it                                                                                |
| `response.status`      | 200 to 599                                                                                                                                                            |
| `response.headers`     | Optional. The headers that matter to a UI, by lower-case name, such as `www-authenticate`, `x-request-id`, `vary`, `location` and `retry-after`                       |
| `response.media_type`  | The body's media type, with no parameters; absent when there is no body                                                                                               |
| `response.body`        | A JSON body, under a JSON media type such as `application/json` or `application/problem+json`                                                                         |
| `response.body_base64` | Any other body, such as an Arrow IPC stream, in base64 (RFC 4648, section 4); a response has `body`, `body_base64` or neither, and 204, 205 and 304 never have a body |

A record never holds the bearer token. A request keeps no headers; a response refuses `authorization`,
`proxy-authorization`, `cookie` and `set-cookie`, as well as `content-type`, which is `media_type`, and the
transport's `content-length`, `content-encoding`, `transfer-encoding`, `connection` and `keep-alive`; and no string
anywhere in a record may hold a JWT, nor may a key, the path, `operation_id`, or the bytes of `body_base64`. Every
object refuses a member the table does not name.

The format's JSON Schema ships as `@basis/ui/fixture-record.schema.json`, and basis tests `basis records export`
against it. A change that refuses a record the format accepted before is a new version, `basis-ui-fixture/2`.

### Fixture mode in tests

Tests never read `.fixtures/`, whose records differ from one desktop to the next. `@basis/ui/fixtures` exports what a
test needs to run pages on the committed fixtures: `loadFixtureFiles(source, files)`, which parses files as fixture
mode does, in the order of their names, with an `ERROR` line for each problem, and `fixtureHandlers({ records,
fixtures, generated, telemetry })`, the handler that answers in fixture mode's order. A test support module loads
`fixtures/` with `import.meta.glob("../fixtures/**/*.json", { eager: true, import: "default" })` and adds the handler to
`mockApi`'s.

## Testing the app

An app's tests run in headless Chromium (`vp test`), and on a machine with no browser in a Node DOM, happy-dom
(`BASIS_TEST_DOM=node vp test`, or `test: await basisTest({ browser: false })`). Write them with `@basis/ui/testing`,
which works in both: Testing Library's `render`, `screen`, `within`, `waitFor` and `userEvent`, `renderApp` for the app
at an address, `workbookFile` for an Excel workbook to upload, and `mockApi` for the API, which starts MSW's service worker in Chromium and its Node server otherwise.

```ts
import { mockApi, renderApp, screen } from "@basis/ui/testing";
import { afterAll, afterEach, expect, test } from "vite-plus/test";

import { getConventionsMockHandler } from "#api/mocks.ts";
import { routeTree } from "#routes.ts";

const api = await mockApi(getConventionsMockHandler([{ convention: "ACT/365F", year_days: 365 }]));
afterEach(() => {
  api.reset();
});
afterAll(async () => {
  await api.close();
});

test("the conventions page lists each convention", async () => {
  renderApp(routeTree, "/");
  expect(await screen.findByRole("cell", { name: "ACT/365F" })).toBeTruthy();
});
```

A test that needs a real browser, for layout, focus or pixels, goes in a file named `*.browser.test.tsx`, which may use
Vitest's browser API (`vitest-browser-react`, `expect.element`) and which the Node run leaves out. The lint refuses that
API in every other test, with the fix in its message. Under a Node DOM, parallax's charts and grids render their text
alternative, not pixels.

## Checking the app: `vp run verify`

`vp run verify` runs every check of the app, each stage to its end whatever an earlier one found, then prints one
summary: a line for each stage, and under it one `ERROR` line for each failure, with its file and line where the tool
gives them, its rule, and its fix. The stages, in order:

| Stage          | What it checks                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| `sync`         | the framework's files against the installed `@basis/ui`, as `vp run sync --check`, in an app that has them |
| `client`       | `src/api/generated` against `openapi.json`, as `vp run client-check`                                       |
| `fixtures`     | each fixture in `fixtures/` against `openapi.json`                                                         |
| `config`       | `vite.config.ts`, `tsconfig.json`, `src/styles.css` and `package.json`'s dependencies                      |
| `lint`         | formatting, and the lint's rules                                                                           |
| `types`        | `tsc --noEmit` on the whole app, the generated client included                                             |
| `tests`        | `vp test`, in Chromium unless the app runs with no browser                                                 |
| `build`        | `vp build`, which fails on what only the React Compiler or the bundler finds                               |
| `budget`       | each route of `basisPreset({ budget })` against its budget, as `vp run budget`                             |
| `suppressions` | the comments that turn a check off, read as text                                                           |

```sh
$ vp run verify
ok    sync            0.0 s
ok    client          0.4 s
ok    fixtures        0.0 s
ok    config          0.0 s
FAIL  lint            1.4 s
ERROR src/pages/positions.tsx:2: `debugger` statement is not allowed (eslint(no-debugger)): Remove the debugger statement.
FAIL  types           0.4 s
ERROR src/pages/positions.tsx:9: Type 'string' is not assignable to type 'number' (TS2322): make the code agree with the types the compiler names, ...
ok    tests          13.4 s
...
ERROR vp run verify failed 2 of 10 stages, lint and types: fix each ERROR line above, then run vp run verify --stage lint --stage types to check them again.
```

`--stage NAME`, given once for each, runs those stages alone, in their order. `--json` prints the report instead, as
one line, the one that starts with `{`, of the type `VerifyReport` that `@basis/ui/preset` exports:

```ts
interface VerifyReport {
  ok: boolean;
  stages: {
    name:
      | "sync"
      | "client"
      | "fixtures"
      | "config"
      | "lint"
      | "types"
      | "tests"
      | "build"
      | "budget"
      | "suppressions";
    ok: boolean;
    ms: number;
    errors: {
      file: string | null;
      line: number | null;
      rule: string | null;
      message: string;
      fix: string;
    }[];
  }[];
}
```

`file`, `line` and `rule` are `null` where none is known, as for a route over its budget. When every stage runs and
passes on a commit with nothing uncommitted, verify records it for `vp run review`. The commit hook runs `vp staged`,
then the stages that take seconds, `vp run verify --stage sync --stage config --stage lint --stage types --stage
suppressions`, and the push hook all of them. An app ctzd writes, which holds none of the framework's files, has
nothing for the `sync` stage to check; its configuration is still checked. `vp run check-full`, verify's former
name, says so and runs it.

## Using the components

A component's look comes from its props, `variant` and `size`, never from `className`. `className` places a component:
margin, width, and flex or grid placement. The lint rule `shadcn/no-restyle` rejects any other class, and its error
names the component's variants and sizes and `vp run docs NAME`, which shows each. When no variant fits, the variant is added to `@basis/ui` in a basis-ui pull
request, never restyled in the app. `@basis/ui` exports no `*Variants` helpers, so no plain element can take a
component's classes either.

A link that looks like a button is a `ButtonLink`, which takes Button's `variant` and `size` and stays a link, since
`Button`'s `render` prop swaps its element but keeps the button role. With `render`, `ButtonLink` becomes the router's
link component, such as TanStack Router's `Link`, which renders an `<a>` of its own:

```tsx
import { ButtonLink } from "@basis/ui";

<ButtonLink href="/trades" variant="outline">
  View trades
</ButtonLink>;

<ButtonLink render={<Link to="/trades" />} variant="outline">
  View trades
</ButtonLink>;
```

With `render` on any other component, put the rendered element's text inside it, as in
`<Badge render={<a href="/trades">Trades</a>} />`, which is where `jsx-a11y/control-has-associated-label` looks for
it.

`style` may set CSS variables and nothing else, and a class reads the variable: `style={{ "--fill": "40%" }}` with the
class `w-(--fill)`. `@basis/ui`'s types let `style` take a variable.

The density sets the spacing unit, 3 px in compact, the default, and 4 px in comfortable, so a page's own gaps and
paddings, such as `gap-4` or `p-6`, shrink by a quarter in the compact density. The controls take lengths of their own
for each density, in whole pixels, which no app sets. Button's `xs`, `sm`, default and `lg` are 24, 26, 28 and 30 px tall
in the compact density and 24, 28, 32 and 36 in the comfortable, and Input, Select and Toggle take the same heights;
an icon beside `text-sm` is 14 px in the compact density and 16 in the comfortable, never shorter than the capitals
beside it. A page's own control-sized element, such as a toolbar's spacer, reads them as variables:
`h-(--control-md-height)`, `px-(--control-md-inset)`, `size-(--control-md-icon)` and `gap-(--control-md-gap)`, for
the sizes `xs`, `sm`, `md` and `lg`.

The components keep WCAG 2.2's 24 px minimum target in either density: no control is shorter, and those that can be,
such as Button's `xs` and `sm` under another theme, carry `min-h-target` and `min-w-target`. A control drawn smaller
than that, such as Checkbox's box, Switch's track or Slider's thumb, is a 24 px target with its shape drawn inside it,
so it keeps shadcn's look.

### The theme's tokens

A plain element, such as a page's own panel, takes its colours from the theme's tokens, drawn whole: no class takes an
opacity modifier. A filled control hovered and pressed is `primary-hover` and `primary-active`, or
`secondary-hover` and `secondary-active`; a status's tint hovered is its `-subtle-hover`, and the outline of an alert
on it its `-edge`. The outline of a card or a popup is `ring-1 ring-edge`, the veil behind a dialog `bg-overlay`, a
control that is off `control-off` and a disabled field's fill `disabled`. A focus ring is an outline in the `ring`
colour, whose width and gap are the theme's: `focus-visible:outline-solid focus-visible:outline
focus-visible:outline-offset-(--focus-offset) focus-visible:outline-ring`. The scales are named for their use:
`duration-popup` and `duration-panel`, `z-raised` and `z-popup`, `rounded-pill`, `opacity-disabled`, and `shadow-sm`
and `shadow-md`.

On a plain element, `basis/theme-classes` refuses what would step outside the theme: a `dark:` variant, since every
token follows the mode; `!` for `!important`; a selector variant such as `[&>*]:`, which styles elements no check sees;
a filter such as `grayscale` or `brightness-50`; `black` and `white`, which are `foreground` and `background`; and a
class built from a template string, which no check can read, so `cn("p-2", wide && "p-4")` chooses between whole
classes.

Text takes its look from the Typography components (`TypographyH1` to `TypographyH4`, `TypographyP`, `TypographyLead`,
`TypographyMuted`, `TypographyInlineCode` and `TypographyList`), never from classes on a plain element. `render`
changes a heading's level and keeps its look, as in `<TypographyH2 render={<h3>Risk</h3>} />`. In a `Table`, a column
of numbers takes `variant="numeric"` on its `TableHead` and each `TableCell`, which aligns it right in tabular figures.

## Building a form

A form's state is TanStack Form's, its schema Zod's, and its look `Field`'s. Each field passes `data-invalid` to
`Field`, `aria-invalid` to its control, and its errors to `FieldError`, which shows them in words, as a line or a
list, so an invalid field is never told by colour alone:

```tsx
import { Field, FieldError, FieldLabel, Input, fieldErrors } from "@basis/ui";
import { useForm } from "@tanstack/react-form";

const form = useForm({
  defaultValues: { cusip: "" },
  validators: {
    onChange: orderSchema,
    // A 422's errors, on the fields their JSON Pointers name.
    onSubmitAsync: async ({ value }) => {
      const problem = await placeOrder(value);
      return problem === undefined
        ? undefined
        : { fields: Object.fromEntries(fieldErrors(problem)) };
    },
  },
});

<form.Field name="cusip">
  {(field) => {
    const invalid = field.state.meta.isTouched && !field.state.meta.isValid;
    return (
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor="cusip">CUSIP</FieldLabel>
        <Input
          id="cusip"
          value={field.state.value}
          onBlur={field.handleBlur}
          onChange={(event) => {
            field.handleChange(event.target.value);
          }}
          aria-invalid={invalid}
          aria-describedby="cusip-error"
        />
        <FieldError id="cusip-error" errors={invalid ? field.state.meta.errors : undefined} />
      </Field>
    );
  }}
</form.Field>;
```

`FieldError` takes a schema's issues, the strings `fieldErrors` returns, and the lists TanStack Form types a form
validator's field errors as. `fieldErrors` names each field as TanStack Form does, such as `legs[0].price` for the
pointer `#/legs/0/price`, so its entries go straight to the fields; `fieldName` does the same for one path.

## Using overlays and menus

Dialog, Alert Dialog, Sheet, Drawer, Popover, Hover Card, Tooltip, Dropdown Menu, Context Menu, Menubar and Command
are shadcn's, on Base UI, and open, close, trap and return focus as Base UI does. A trigger renders as a Button through
`render`, and the trigger keeps its own text:

```tsx
import { Button, Dialog, DialogContent, DialogTitle, DialogTrigger } from "@basis/ui";

<Dialog>
  <DialogTrigger render={<Button variant="outline" />}>Edit position</DialogTrigger>
  <DialogContent>
    <DialogTitle>Edit position</DialogTitle>
  </DialogContent>
</Dialog>;
```

Where these differ from what shadcn's documentation leads one to expect:

- `AlertDialogAction` is a button that does not close the dialog. Control `open`, and close it in the action's handler
  once the action has run; `AlertDialogCancel` closes it.
- `Command` is built on Base UI's Autocomplete, not cmdk. An item matches when its `value`, or its text without its
  `CommandShortcut`, or one of its `keywords` contains the search, ignoring case and accents, and the list keeps its
  order rather than sorting by a fuzzy score. The search cannot be controlled from outside; `shouldFilter={false}`
  shows every item, for a list the app filters itself. `onSelect` receives the item's value. Put a `Command` inside a
  `CommandDialog` for the palette, and close the dialog in `onSelect`.
- A `ContextMenuTrigger` should hold something focusable, such as a row's button or link, so a keyboard user can open
  the menu with the context-menu key or Shift+F10.
- A `Tooltip` names nothing for assistive technology, so an icon-only trigger still takes an `aria-label`, and a
  `HoverCard`'s content must also be reachable by following its link: neither reaches touch or screen reader users.
- A `Drawer` takes no snap points: placing the panel at one needs arbitrary values the theme does not allow.

Overlays animate with a short fade and scale, or a short slide for Sheet and Drawer, and an Accordion's or a
Collapsible's content slides open and shut over 150 ms through the height Base UI measures, all of which stop under
`prefers-reduced-motion` and under the user's `motion` preference set to reduced. The veil behind a Dialog, an Alert
Dialog, a Sheet or a Drawer appears and goes at once, and only the popup over it moves, since a fade the size of the
screen is the whole screen redrawn every frame on a desktop drawn on the CPU. A Collapsible's content clips what overflows it, as the motion needs, so a focus ring at its edge
needs a little padding inside it.

## Laying out an app

`AppShell` is the layout of an app's pages: make it the root route's component, and give each route a `title`, an
`icon` and, optionally, a `group` in its `staticData`. It builds the sidebar of the app's pages (`AppSidebar`), each
under its group's heading, the groups in the order of their first pages, the breadcrumbs (`RouteBreadcrumbs`) and
Ctrl+K's command palette (`CommandPalette`) from them, names the environment in a banner (`EnvironmentBanner`), puts the
user menu (`UserMenu`: mode, density, motion, the theme once more than one ships, sign in and out) in the sidebar's
footer, and keeps the keyboard shortcuts, which a component declares with `useShortcut(keys, description, run)` and
`?` lists. A route with path parameters, such as `/bonds/$security`, keeps its breadcrumb but stays out of the sidebar
and the palette; `inNavigation: false` leaves any route out.

```tsx
const commands: readonly PaletteCommand[] = [
  {
    group: "Prices",
    icon: RefreshCwIcon,
    id: "refresh",
    keywords: ["reload", "marks"],
    label: "Refresh prices",
    run: refreshPrices,
    shortcut: "mod+shift+r",
  },
];
const rootRoute = createRootRoute({
  component: () => (
    <AppShell
      appName="Positions"
      environment="qa"
      commands={commands}
      header={<Badge variant="outline">Close of 6 Nov</Badge>}
    />
  ),
});
const positions = createRoute({
  component: PositionsPage,
  getParentRoute: () => rootRoute,
  path: "/positions",
  staticData: { group: "Books", icon: TableIcon, title: "Positions" },
});
```

`AppShell` takes:

| Prop            | What it is                                                                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `appName`       | The app's name, at the top of the sidebar.                                                                                                                                                                          |
| `environment`   | `dev`, `qa` or `prod`, which a banner names; none unless set.                                                                                                                                                       |
| `commands`      | The palette's commands beside the pages: each `{ id, label, run }`, with `keywords`, `group`, `icon` and `shortcut`.                                                                                                |
| `header`        | What the header holds after the breadcrumbs, such as the data's as-of date.                                                                                                                                         |
| `sidebarHeader` | What the sidebar's header holds under the app's name, such as a choice of desk.                                                                                                                                     |
| `sidebarFooter` | The sidebar's footer in place of the user menu; put `<UserMenu />` in it to keep the menu.                                                                                                                          |
| `collapsible`   | `offcanvas` (the default) slides the sidebar away; `icon` folds it to a rail of icons, each named by a tooltip, and wants a `sidebarFooter` of `SidebarMenuButton`s, since the user menu needs the sidebar's width. |

Each route's content is a `Page`: its `title`, the page's one level-1 heading, a `description` under it and its
`actions` at the header's end, and below them its content. `layout="scroll"`, the default, scrolls the content under
the header, for cards, forms and small tables; `layout="fill"` gives it the window's height and no more, for a grid, a
pivot or a chart, which fills it and scrolls itself; other content takes the height with `flex-1`. Content that is not a `Page` scrolls in the shell's
padded column, as before.

```tsx
<Page
  title="Trades"
  description="The desk's trades today, newest first."
  actions={<Button variant="outline">Export</Button>}
  layout="fill"
>
  <Grid dataset={trades} />
</Page>
```

- **Breadcrumbs from data.** A route's `staticData.breadcrumb` titles its breadcrumb from its loader's data. A page
  whose data a query fetches gives its `Page` a `breadcrumb`, such as the bond's name once it has arrived, which
  titles the page's own breadcrumb, the last; the route's `title` shows until then.
- **The palette's commands.** A command is found by its label or its `keywords`, listed under its `group` ("Commands"
  unless set) with its `icon`, and its `shortcut`, such as `mod+shift+r`, shows beside it, is listed by `?`, and runs
  it with the palette closed. A page is found by its title or its group.
- **Shortcuts and scopes.** The page shown sits in a `ShortcutScope` named by its title, so a shortcut a page's
  component declares is the page's: it goes when the page does, `?` lists it under the page's title, and it wins over
  the app's for the same keys. `<ShortcutScope name="Quotes">` gives a part of a page keys of its own the same way. Two
  shortcuts that take the same keys in the same scope, or in two as deep, conflict: the first declared runs, and the
  second logs one line to the console, such as `ERROR two shortcuts take r on Trades: "Refresh the positions" runs
  and "Refresh the trades" never does. Give one of them other keys.` It is logged, not thrown, so a conflict between
  components that meet only in some state never takes the page down; the gallery's checks and `vp run shot` see the
  console. `Mod+K` and `mod+k`, or `shift+?` and `?`, are the same keys.
- **Tooltips.** One `TooltipProvider` holds every tooltip in the shell to a 400 ms delay: once one has opened, its
  neighbours open at once, as on the sidebar's icon rail.

The navigation and layout components keep shadcn's names, props and parts. Where they differ, it is here:

- **Sidebar.** `SidebarProvider` keeps whether the sidebar is open in the `basis-ui-sidebar` cookie for a week, and
  reads it back on load, so the user's last choice wins over `defaultOpen`; an app passes no cookie to it. Ctrl+B, or
  Cmd+B on a Mac, toggles it, and `SidebarTrigger`'s tooltip says so. It folds to its icon rail, or slides off the
  canvas, over 150 ms, but only the sidebar's own panel moves: the space it holds in the page changes at once, so the
  page lays out once rather than on every frame, and its grids and charts resize once. A sidebar on the
  right comes after `SidebarInset` in the provider, so its gap sits on the right. `SidebarInset` is the page's
  `<main>`; where a layout already has one, `render={<div />}` makes it a `<div>`.
- **Resizable.** It is @basis/ui's own build on the WAI-ARIA window splitter pattern, with no dependency, and sizes
  are percentages as plain numbers from 0 to 100: `defaultSize={30}` is 30 percent, where react-resizable-panels 4
  would read pixels. Give each `ResizableHandle` an `aria-label`, such as "Resize the trade list". To keep a layout,
  give each panel an `id`, store what `onLayoutChanged` reports after a drag or a key, and pass it back as
  `defaultLayout`:

  ```tsx
  <ResizablePanelGroup defaultLayout={stored} onLayoutChanged={store}>
    <ResizablePanel id="trades" defaultSize={40} minSize={20} maxSize={70}>
      …
    </ResizablePanel>
    <ResizableHandle withHandle aria-label="Resize the trade list" />
    <ResizablePanel id="detail" minSize={30}>
      …
    </ResizablePanel>
  </ResizablePanelGroup>
  ```

  Where a panel holds a grid or a chart, give the group `resizeOn="release"`: a drag then moves only the handle's
  line, and the panels resize once, when the pointer lets go, so the canvas lays out and redraws once rather than on
  every move. The keys resize at once either way.

- **Navigation Menu.** A top-level link takes `variant="trigger"` to look like the triggers beside it, where shadcn
  puts `navigationMenuTriggerStyle()` on it; give the menu an `aria-label`.
- **Links.** `BreadcrumbLink`, `PaginationLink`, `PaginationPrevious`, `PaginationNext`, `SidebarMenuButton` and
  `SidebarMenuSubButton` take `render` for the router's link, as in `<BreadcrumbLink render={<Link to="/desks" />}>`.
  A page link is a `ButtonLink`, and takes Button's `size`.
- **Keys.** Tabs move focus with the arrow keys and open the focused tab on Enter or Space. Accordion triggers are
  buttons in the tab order, without arrow-key movement between them, as Base UI 1.9 follows the WAI-ARIA authoring
  practices.

## Raising a toast

Render `<Toaster />` once, around the app or beside its routes, and raise a toast from anywhere, inside React or out,
with `toast`:

```tsx
import { Toaster, toast } from "@basis/ui";

<Toaster />;

toast.add({ title: "Trade booked", description: "Bought 5,000 par at 99-16.", type: "success" });
toast.promise(save(), { loading: "Saving", success: "Saved", error: "Not saved" });
```

`type` picks the look: `success`, `warning`, `info` and `destructive` (or `error`, which `toast.promise` sets) each
show their status colour and icon, `loading` a turning loader, and anything else the plain toast. A toast closes
itself after five seconds unless `timeout` says otherwise; `timeout: 0` keeps it until the user closes it. Its
`actionProps`, such as `{ children: "Undo", onClick: restore }`, add a button. `priority: "high"` announces it to a
screen reader at once, for what the user must act on now. F6 moves the keyboard into the toasts, and Escape closes the
focused one.

`toastError(error)` raises the toast `BasisApp` raises for a failed mutation: the problem's title, its detail, each
field a 422 names and the request's reference. The same error again, its title, detail and fields alike, within 10
seconds of the last while its toast is open, raises no new toast: that one shows the latest reference and "This
happened 3 times.", and `toastError` returns its id. Once the toast is closed, the error raises a new one.

## Showing numbers and dates

`Num`, `Money`, `Pct`, `Bps`, `Price32` and `DateTime` show a value through the formatter, by parallax's rules, so it
reads the same in a card as in the grid. Pass `value` as the API sends it, a number, and for `DateTime` a Temporal value
or ISO 8601 text. `null` shows the formatter's null text, which is empty, and NaN its `—`. The formatter rounds once,
for display: to 15 significant digits, half away from zero, then to the decimals shown, two for a double unless
`decimals` says otherwise. For a number inside text, such as a toast's, `numberText(value, { decimals })` gives the same text. Never
round a number yourself: the lint refuses `toFixed`, `toPrecision`, `toLocaleString`, `Math.round`,
`Intl.NumberFormat` and `Math.ceil(n * 100) / 100` in an app, and each error names the component to use, or
`roundToTick` from `@basis/ui/numbers` for a value rounded to a step; an integer that is not shown, such as an index or
a pixel count, takes `Math.floor` or `Math.trunc`. Nor format a date: `toLocaleDateString`, `toLocaleTimeString`,
`Intl.DateTimeFormat` and `Intl.RelativeTimeFormat` are refused for `DateTime`, `relativeTime` from `@basis/ui/dates`,
or a Temporal value's `toString()` in text.

```tsx
import { Bps, DateTime, Money, Num, Pct, Price32 } from "@basis/ui";

<Num value={1234.5} />; // 1,234.50
<Num value={1_234_567} decimals={0} />; // 1,234,567
<Money value={-1234.5} />; // -$1,234.50
<Money value={2_500_000_000} abbreviate="B" />; // $2.5B
<Pct value={0.0525} />; // 5.25%
<Bps value={0.0025} decimals={0} />; // 25 bp
<Price32 value={99.515625} />; // 99-16+
<DateTime value="2026-11-06T14:30:00Z" />; // 2026-11-06 09:30:00, in New York time
<Num value={pnl} signed />; // +1,250.50 in the gain colour, -1,250.50 in the loss colour
```

- **Rates** and spreads are fractions, the one unit APIs send them in, as the formatter's `percent` and `bps` and
  `rateSuffixes` read them: 0.0525 is 5.25% and 0.0025 is 25 bp.
- **Money** takes an ISO 4217 `currency`, USD unless set, which gives the symbol, written after the sign, and the
  decimals: `€1,234.50`, `¥1,234`, `($1,234.50)` with `negative="parentheses"`.
- **`signed`** colours a gain and a loss with the `gain` and `loss` tokens and always writes the sign. The direction is
  the shown value's, so 0.001 at two decimals is `0.00`, in neither colour.
- **Figures** are tabular. `align="end"` makes a number a block aligned right, for a column of figures outside a
  table; in a `Table`, the cell's `variant="numeric"` aligns it.
- **`DateTime`** takes `zone`, `precision` (`seconds`, `milliseconds` or `microseconds`) and `show` (`date-time`,
  `date` or `time`). Text with an offset or `Z` is an instant, a bare date is a date, and a time without either is a
  wall-clock time shown as stored. It renders a `<time>` whose title gives the full instant with its offset and zone.
- Bad data never breaks a page: text that is not ISO 8601, a zone or currency that is none, and decimals no format
  takes show `—`, the formatter's text for an undefined result, as NaN does, and `DateTime`'s title gives the reason.
  The response's schema should have refused such text.

### Display formats

basis declares how each number shows: as `x-basis-format` on its property in the API's document, and in its Arrow
field's metadata under `basis.format`, as `{ kind, decimals, currency, step }` with `kind` one of `number`, `money`,
`pct`, `bps`, `price` and `price32`. A page shows a number by its format rather than choosing decimals:

```tsx
import { Formatted } from "@basis/ui";
import { displayFormats } from "#api/client.ts";

<Formatted value={row.interest} format={displayFormats.CouponRow.interest} />; // 2.0625, price at 4 decimals
```

- `vp run client-pull` writes `displayFormats` into `src/api/generated/formats.ts`, by schema and property; the app's
  `src/api/client.ts` re-exports it.
- `Formatted` shows the number through `Num`, `Money`, `Pct`, `Bps` or `Price32`, as the kind says, and through
  `Num`'s defaults without a format.
- A `DataTable` column with `variant: "numeric"` takes `format`, and its cells show by it.
- For Arrow a page reads itself, `readDisplayFormat(field.metadata.get(displayFormatMetadata))` gives a column's
  format. Parallax's grid, pivot and charts read it on their own, unless a layout sets the column's format.

## Taking amounts and dates

`AmountInput`, `AsOfDatePicker` and `DateRangePicker` each go in a `Field` with a `FieldLabel` whose `htmlFor` is
their `id`. The first two draw their field's error line themselves, so a form passes them the field's errors as
`errors` rather than drawing a `FieldError` of its own; while what was typed cannot be taken, their own reason replaces
those errors.

`AmountInput` reads what is typed through `parseAmount` with the suffixes it declares, `amountSuffixes` unless set,
and shows the number it read under the input, such as `= 1,500,000`. Bond markets write `M` for thousands, so a par
field declares `parSuffixes`, and a spread `rateSuffixes`, where `25bp` is 0.0025. The text is read exactly, the suffix
moving the decimal point, and only then converted to a number. Its value is that number, `null` while it is empty, and
the text itself while that reads as no number, which `amountSchema` refuses with the parser's reason and otherwise
turns into the number:

```tsx
import { AmountInput, Field, FieldLabel, amountSchema, parSuffixes, rateSuffixes } from "@basis/ui";

const ticketSchema = z.object({
  par: amountSchema(parSuffixes), // "Enter an amount." when empty
  spread: amountSchema(rateSuffixes).nullable(),
});

<form.Field name="par">
  {(field) => {
    const invalid = field.state.meta.isTouched && !field.state.meta.isValid;
    return (
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor="par">Par</FieldLabel>
        <AmountInput
          id="par"
          suffixes={parSuffixes}
          value={field.state.value}
          onValueChange={field.handleChange}
          onBlur={field.handleBlur}
          aria-invalid={invalid}
          errors={invalid ? field.state.meta.errors : undefined}
        />
      </Field>
    );
  }}
</form.Field>;
```

`AsOfDatePicker` holds a `Temporal.PlainDate`. It takes business days on its `calendar`, SIFMA's unless set, from
`min` to `max`, where `max` is today in New York unless set and `null` leaves the future open. Uncontrolled, it starts
at the last business day before today, which `defaultAsOfDate()` also gives a form's default values. A typed
`2026-11-06` or `11/06/2026` is taken when the field is left or Enter pressed; a date it cannot take leaves the value
`null` and names the reason, such as `2026-11-11 is not a business day on the SIFMA (US bond market) calendar: it closes
for Veterans Day.` Its calendar button opens a month grid on the WAI-ARIA date picker dialog pattern: the arrows move a
day or a week, Home and End to the ends of the week, PageUp and PageDown a month and, with Shift, a year; Enter picks
and Escape closes. Closed days are muted, holidays also struck through, and early closes dotted, with the reason in each
day's name and title and under the grid.

`DateRangePicker` holds a `DateRange` from `@basis/ui/dates`, and offers presets beside the same grid: month, quarter
and year to date, and the prior month, quarter and year, each from its period's first business day to a business day,
counted from `asOf`, the last business day before today unless set. `presets` picks and orders them, and
`rangeForPreset` gives the same ranges outside the picker. Two days picked in the grid, in either order, make a range.

Pass `today` to fix the date both pickers count from, as a test does.

## Showing and taking data

`DataTable`, `EntityPicker`, `SecurityPicker` and `FileImport` are the firm's components for small tables, searching
for an entity, and importing a CSV file.

### DataTable

`DataTable` is TanStack Table v9 drawn on `Table`'s parts, for a few hundred rows whose cells hold links and buttons.
Declare each column's `value`, which it sorts, filters, copies and exports by, and draw the cell with `cell` when the
value's text is not enough:

```tsx
import { DataTable, Money } from "@basis/ui";
import type { DataTableColumn } from "@basis/ui";

const columns: readonly DataTableColumn<Position>[] = [
  {
    id: "cusip",
    header: "CUSIP",
    value: (row) => row.cusip,
    cell: (row) => <Link to={`/bonds/${row.cusip}`}>{row.cusip}</Link>,
  },
  { id: "par", header: "Par", variant: "numeric", value: (row) => row.par },
  {
    id: "price",
    header: "Price",
    variant: "numeric",
    value: (row) => row.price,
    cell: (row) => <Money value={row.price} />,
  },
];

<DataTable
  label="Positions"
  columns={columns}
  data={positions.data?.data}
  getRowId={(row) => row.id}
  loading={positions.isPending}
  error={positions.error}
  onRetry={() => {
    positions.refetch().catch(reportError);
  }}
  selectable
  rowActions={(row) => [{ label: "Allocate", onSelect: () => allocate(row) }]}
  pageSize={25}
/>;
```

- **Columns.** A column with `variant: "numeric"` takes a number as the API sends it, and aligns right in tabular
  figures, its heading too; it sorts by value and exports as a number.
  Any other column's value is text, a boolean or a number. `sortable`, `hideable` and `filterable` are on unless set
  to `false`.
- **Sorting.** A heading sorts its column ascending, then descending, then not at all; Shift adds the column to the
  sort, and each sorted heading shows its place. Missing values sort last either way.
- **Selection.** `selectable` adds a checkbox to each row, named after the row (`rowLabel`, the first column's value
  unless set), and one to the heading, which selects every row the filter shows, on every page. Shift with a click
  selects a range. `onSelectionChange` hears the selected rows and their ids, and again when new data, such as a
  refetch's, drops or replaces a selected row; hold the ids, which outlast a refetch.
- **Toolbar.** The text filter searches the columns' values, ignoring case. The columns menu hides and shows
  columns. Copy puts the selected rows on the clipboard as TSV, which pastes into a spreadsheet's cells; Export CSV
  saves the rows the filter shows as `label.csv` (`exportName` to change it). Both write the columns showing, through
  `toTsv` and `toCsv`, which write a text cell that starts with `=`, `+`, `-` or `@` as text, not a formula.
- **States.** `loading` shows placeholder rows and marks the table busy; an `error` shows over the table, or alone
  while there are no rows; an empty table says so, in `empty`'s words when set.
- **The row cap.** A DataTable draws every row it holds into the page. Past its cap, 2,000 rows unless `rowCap` says
  otherwise, it draws nothing, shows one error that names the cap and says to use parallax's `<Grid>`, and reports
  the error to telemetry. Data that size belongs in the grid, which draws only the rows on screen.

### EntityPicker and SecurityPicker

`EntityPicker` is a combobox that searches through a function the app passes, normally the generated client's
function for a search route, with the `signal` passed on so that a search a newer text replaced is aborted:

```tsx
import { EntityPicker, Field, FieldLabel } from "@basis/ui";
import { searchIssuers } from "#api/client.ts";

<Field>
  <FieldLabel htmlFor="issuer">Issuer</FieldLabel>
  <EntityPicker
    id="issuer"
    search={async (text, signal) => (await searchIssuers({ q: text }, { signal })).data}
    itemKey={(issuer) => issuer.id}
    itemLabel={(issuer) => issuer.name}
    onValueChange={setIssuer}
  />
</Field>;
```

It searches once typing has stopped for `debounceMs`, 250 ms unless set, and at least `minLength` characters are
typed. Each text is a query on the app's query client, so a search retries, reports and signs the user out as every
other read does, a text searched a moment ago answers at once, and only the last text's results show. It needs a
`QueryClientProvider` above it, which `BasisApp` is. `queryKey` puts the searches under the generated client's key
for the route; unless set, each picker keeps its own. `validate` refuses a text before it is sent, with the reason the
picker shows. The popup's status line says what the picker is doing, politely to a screen reader: waiting for text,
searching, why the text cannot be searched, the error, or that nothing matched. The arrow keys move through the results
and Enter chooses one; `multiple` chooses several, shown as chips, each with a button that removes it.

`SecurityPicker` is an EntityPicker whose text is a CUSIP, an ISIN or a SEDOL (`kinds` narrows them). It reads the
text by its length with `parseSecurityIdentifier` from `@basis/ui/securities`, checks it, check digit and all, and
searches only for a valid identifier, which its `search` receives with its kind; otherwise it says why, such as
`"91282CRF1" is not a CUSIP: its check digit should be 0; look for a mistyped character.`

```tsx
<SecurityPicker
  id="security"
  search={async (identifier, signal) =>
    (await findSecurities({ [identifier.kind]: identifier.value }, { signal })).data
  }
  itemKey={(security) => security.cusip}
  itemLabel={(security) => security.description}
/>
```

### FileImport

`FileImport` takes a CSV file or an Excel workbook through its drop zone or its file button and reads it in the
browser: a CSV with `parseCsv` from `@basis/ui/utils` (RFC 4180: quoted fields, doubled quotes, line breaks inside
quotes, and a header row), a workbook (.xlsx, .xlsm, .xltx or .xltm) with `readWorkbook`. It maps the columns by their
headers to the app's Zod schema, and previews every row with each refused cell marked and its reason in words.
Confirming hands `onImport` only the valid rows, typed by the schema:

```tsx
import { FileImport, amountSchema, parSuffixes } from "@basis/ui";
import { isCusip } from "@basis/ui/securities";

const positionRow = z.object({
  cusip: z.string().refine(isCusip, "Not a CUSIP."),
  par: amountSchema(parSuffixes),
  book: z.enum(["Rates", "Credit"]).optional(),
});

<FileImport
  schema={positionRow}
  headers={{ par: ["Par", "Par amount"] }}
  onImport={async (rows) => {
    await createPositions.mutateAsync({ data: rows });
  }}
/>;
```

- **Headers.** A column matches a key by the key itself or a header `headers` gives it, ignoring case, spaces and
  punctuation, so `Par Amount` and `par_amount` match `"Par amount"`. The header is the first row, or the first of the
  first ten that holds every column the schema needs, so a report's title rows above it are left out. A column the
  schema lacks is ignored and named in the preview; a column it needs and the file lacks refuses the file.
- **Cells.** The schema reads text, as a CSV's cells are: `z.coerce.number()`, `amountSchema(...)`, `z.enum(...)`. An
  empty cell is a missing value, which an optional field takes and a required one refuses as empty.
- **Workbooks.** A workbook's cells read as the text Excel shows, without its display format: a number to its 15
  significant digits (a cell showing 5.00% reads 0.05), a date or time in ISO 8601 (`2026-11-09`,
  `2026-11-09T09:30:00`, `09:30:00`), a boolean as `TRUE` or `FALSE`, and a formula as its saved result. A cell holding
  an Excel error such as `#N/A`, or a formula Excel never calculated, refuses its row with the reason. The preview
  numbers rows as Excel does. The sheet is the one `sheet` names, ignoring case, or else the first visible sheet that
  holds the schema's columns; when several do, as a workbook with a tab a month does, the preview has a Sheet select.
- **Limits.** The drop zone states them: 5 MB and 10,000 rows unless `maxBytes` and `maxRows` say otherwise. A file
  over either, one that is neither CSV nor a workbook, or one that cannot be read is refused with the reason and what to
  do.
- **Other spreadsheets.** An .xls of Excel 97-2003, a binary .xlsb, an OpenDocument .ods and a workbook protected with
  a password are refused with how to save them as an .xlsx, since reading them would take a dependency of megabytes. A CSV's text is
  read as UTF-8, as Excel's "CSV UTF-8" saves it, or as Windows-1252, as its plain "CSV" does.
- **Importing.** While `onImport`'s promise is pending the button waits; if it rejects, its error shows over the
  preview, which stays for another try.
- **Testing.** `workbookFile` from `@basis/ui/testing` writes a workbook for a test, as Excel lays one out, so no .xlsx
  is committed: `await workbookFile({ Positions: [["CUSIP", "Par"], ["037833100", 1_000_000]] })` is a `File` to upload
  to the input labelled "CSV or Excel file".

## Seeing a page: `vp run shot`

`vp run shot ROUTE` pictures a route of the app in headless Chromium and writes five files to `.shots/`, named after
the route: the page as `NAME.png`, its accessibility tree as `NAME.aria.yml`, its console errors as
`NAME.console.txt`, each request to `/api` as `NAME.network.txt`, and axe's accessibility check as `NAME.axe.txt`. It
uses the app's running `vp dev`, or starts one in fixture mode and stops it after.

```sh
vp run shot /positions --mode dark --density comfortable
vp run shot /settlements/new --step 'type:Amount=1,000,000' --step 'click:Save' --step 'wait:Saved'
vp run shot /bonds/US91282CRF04 --all --compare baselines --json
```

| Option                           | What it does                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| `ROUTE...`                       | The routes to picture, each starting with `/`                                                |
| `--all`                          | Every route of the app's router as well; a route with a parameter only through a ROUTE of it |
| `--mode light\|dark`             | The mode, light by default; `--dark` is the same as `--mode dark`                            |
| `--density compact\|comfortable` | The density, compact by default; `--comfortable` is the same as `--density comfortable`      |
| `--theme NAME`                   | The theme, one of `themeNames`; `default` by default                                         |
| `--width N`, `--height N`        | The viewport, 1280 by 800 by default                                                         |
| `--wait MS`                      | How long to let the page settle, after it loads and its network is quiet, 500 by default     |
| `--selector CSS`                 | Picture the one element the selector picks, rather than the whole page                       |
| `--step STEP`                    | Click, hover, type, press or wait before the picture, in order                               |
| `--compare DIR`                  | Compare each picture with DIR's of the same name, pixel for pixel                            |
| `--json`                         | Print one line of JSON, the type `ShotReport` from `@basis/ui/preset`                        |

- **The mode, density and theme** are set through the preferences cookie the head script reads, as the user menu sets
  them, so the page is never edited. Their names join the files', as `positions-dark-comfortable.png`, a theme other
  than the default's before them, as `positions-high-contrast-dark.png`, and a selector's
  joins after two dashes, as `positions--exposure.png`.
- **The network file** has a line for each request to `/api`, with its status and what answered it, which fixture mode
  names in the `x-basis-fixture-source` and `x-basis-fixture-file` headers: `record` from `.fixtures/`, `fixture` from
  `fixtures/`, `generated` from orval's mocks, `none` when nothing did, or `live` from the API `BASIS_API_URL` names.

  ```text
  GET /api/bonds/US91282CRF04 200 fixture fixtures/bond-US91282CRF04.json
  ```

- **The axe check** runs WCAG 2.2's rules at levels A and AA and axe's best practices, as the gallery's shots do, with
  one `ERROR` line for each element at fault, naming the rule, the element and axe's fix. Four things Base UI does in
  every app are excepted, each by its rule and a selector the element or an ancestor matches: `region` in
  `[data-base-ui-portal]`, a popup portalled outside the landmarks; `aria-hidden-focus` at
  `[data-base-ui-focus-guard]`, a popup's focus guards; `aria-hidden-focus` and `page-has-heading-one` while a
  combobox's list is open, which hides the page; and `aria-hidden-focus` in a high-priority toast Base UI hides until
  it has focus.
- **A step** is `click:TARGET`, `hover:TARGET`, `type:TARGET=TEXT`, `press:KEY`, `wait:MS` or `wait:TARGET`. A TARGET is
  a control's exact name, label or placeholder, or an element's exact text, or a CSS selector when it starts with `#`,
  `.` or `[`, or after `css=`. It must pick one element that shows, within 5 s. Steps act on one route.
- **`--all`** reads the routes from the TanStack Router the page makes. A route with a parameter, as
  `/bonds/$security`, is pictured through a ROUTE that is one of its pages, and skipped, with a line that says so,
  without one.
- **`--compare DIR`** holds each picture to `DIR/NAME.png` with Playwright's comparator, as the gallery's shots are
  held, and one that differs gets `.shots/NAME.diff.png` with the changed pixels in red. A picture is made a baseline
  by copying it there. Text draws differently from one operating system to the next, so make and compare baselines in
  WSL.

A console error, an axe violation, a step that cannot be taken, a selector that picks no one element and a picture
that differs from its baseline, or has none, each fail the task with an `ERROR` line that ends in its fix, and the
files are still written, so the picture shows the page as it stood.

It needs the Chromium that `@basis/ui`'s Playwright pins, which `vp dlx playwright@1.65.0 install chromium` installs, as
`vp run doctor` says. It trusts only the `vp dev` that answers on the app's port with the app's own folder, and one it
starts writes its output to the task's, so a fixture's `ERROR` line shows there. The skill in
`skills/drive-the-app` says how an agent looks at its pages and clicks through them; the UI repo template copies it
into each app.

## Weighing the build: `vp run budget`

`vp run budget` builds the app, serves `dist/`, opens each route that `basisPreset({ budget })` names in headless
Chromium, and weighs the JavaScript and CSS the route loaded, gzipped: its lazy chunks and workers included, and nothing
from a cache. A budget is two numbers of kilobytes per route, `js` and `css`, and a route with path parameters is named
by an example, such as `"/bonds/US91282CRF04"`. It prints one line a route, and a route over its budget fails the task
with an `ERROR` line that says what to load lazily:

```sh
$ vp run budget
/  JS 174.0 of 180 kB, CSS 22.4 of 25 kB, gzipped
```

A route that its data never reaches still loads its code, since the task answers `/api` with 404. Split a page that
loads much of what it does not show at first, such as a chart behind a tab, through a lazy import; the template's
routes load each page with `lazyRouteComponent`, so `@basis/parallax` loads only on the pages that use it. `@basis/ui`
is built as one module for each of its own and declares only its stylesheets as side effects, so an app's bundle holds
only the components it imports. Most of what is left is the libraries every app shares: of an app of one card's
543 kB of JavaScript before gzip, React DOM is 207 kB, Zod 83 kB, the router 72 kB, Base UI and Floating UI 65 kB, and
`@basis/ui` 47 kB. The task needs the same Chromium as `vp run shot`.

## Showing a query's states and small charts

`QueryState` takes a query as `useQuery` returns it and shows whichever state it is in: a skeleton while it first
loads, an `Empty` with `idleTitle` while a disabled query waits for what it needs, such as the user's choice, an
`ErrorAlert` read from the API's problem details with a retry, an `Empty` when there is nothing to show, and
otherwise its children with the data, under the time it was current, in the warning colour once older than
`staleAfter`:

```tsx
<QueryState query={positions} emptyTitle="No positions" staleAfter={{ minutes: 15 }}>
  {(rows) => <PositionsList rows={rows} />}
</QueryState>
```

`Sparkline` draws a series too small for parallax, such as a KPI card's last 30 days, as an SVG line named by its
`label`; `trend` colours it gain or loss by its first and last values, and `rising="loss"` turns that round for a
yield. `CellBar` puts a bar of a value behind its text in a table cell, as a share of `max`, the column's largest
magnitude, growing both ways from the middle when `signed`:

```tsx
<Sparkline label="NAV over 30 days, up 2.1%" values={nav} trend />
<CellBar value={row.pnl} max={largestPnl} signed>
  <Money value={row.pnl} />
</CellBar>
```

## Using the icons

`@basis/ui` exports a set of lucide's icons under lucide-react's names with the `Icon` suffix: each icon's current
name, such as `TriangleExclamationPointIcon`, and its older aliases, such as `TriangleAlertIcon` and
`AlertTriangleIcon`. `@basis/ui/catalogue.json` lists every one under `icons`. An app installs no icon package.

- **Size.** A component sizes the icons inside it, as Button and Badge do. Beside text in a Button or Badge, an icon
  takes `data-icon="inline-start"` or `data-icon="inline-end"`, which adjusts the padding on that side. Outside a
  component that sizes it, an icon is 24 px square. `className` may resize or place it, as with `size-4` or `shrink-0`.
- **Colour.** An icon draws in the current text colour. `shadcn/no-restyle` rejects colour, opacity and motion classes
  on an icon, so a coloured icon sits in an element that sets the colour, such as `<span className="text-success">`.
- **Props.** An icon takes an `<svg>` element's props except `children`, `color`, `fill`, `stroke`, `strokeWidth`,
  `strokeLinecap`, `strokeLinejoin`, `viewBox` and `xmlns`. It has none of lucide-react's `size`, `color`,
  `strokeWidth` or `absoluteStrokeWidth`.
- **Names.** An icon is hidden from assistive technology unless an `aria-*` prop or `role` is set. An icon that carries
  meaning on its own, with no text beside it, takes an `aria-label`; inside an icon-only Button, the Button takes it.

An icon `@basis/ui` lacks is added to it, in a basis-ui pull request, never drawn in an app.

## Using the numbers and utils modules

`@basis/ui/numbers` and `@basis/ui/utils` hold what an app would otherwise add a decimal library or lodash for. Every
number an API sends is a double, and every rate a fraction. Import them by subpath:

```ts
import { formatThirtySeconds, percentChange, roundToTick, shares } from "@basis/ui/numbers";
import { debounce, sortBy, toCsv } from "@basis/ui/utils";
```

- Show a number through the number components, which round it once; don't round it first.
- `sumPrecise` adds doubles exactly, where adding them in turn would drift: a total on screen comes from it or from
  parallax's exact sums.
- `roundToTick` rounds a price or a rate to a tick exactly, reading each double at its shortest digits; `shares` gives
  each value's weight in a total, summing to exactly 1 at the scale asked for; `percentChange` divides by the base's
  size; `formatThirtySeconds` and `parseThirtySeconds` write and read Treasury prices in 32nds.
- Anything with a market convention, such as accrued interest, day counts, yields or risk, is the API's to compute.
- `utils` follows es-toolkit's signatures, and differs where the types would otherwise lie or lodash surprises:
  `keyBy`, `countBy` and `fromEntries` return `Partial` records, `zip` types the `undefined` it pads with, `throttle`
  never calls twice within its wait, and `sortBy` puts missing values last in either order.
- `parseCsv` reads CSV as RFC 4180 writes it, strictly: a quoted field that never closes, or a stray double quote,
  is an error naming its line, rather than a guess that shifts every column after it.
- `readWorkbook` reads an Excel workbook's sheets with no dependency, from the bytes of an .xlsx, .xlsm, .xltx or
  .xltm, and gives a sheet's rows as text records with their row numbers, as `parseCsv` gives a CSV's. A workbook it
  cannot read, such as an .xls under another name or one protected with a password, is refused with the reason.

## Dates and securities

`@basis/ui/dates` works on Temporal's types, with no date library: plain dates are `Temporal.PlainDate`, and instants
come back as `Temporal.ZonedDateTime` in New York time. Every query takes a calendar and uses SIFMA's, the US bond
market's, unless it names the NYSE's or TARGET2's:

```ts
import {
  addBusinessDays,
  marketStatus,
  nyse,
  settlementDate,
  sifma,
  target2,
} from "@basis/ui/dates";

const tradeDate = Temporal.PlainDate.from("2026-07-02");
settlementDate(tradeDate); // 2026-07-06: T+1 on SIFMA's calendar, over Independence Day
settlementDate(tradeDate, { calendar: target2, days: 2 });
addBusinessDays(tradeDate, -3, { calendar: nyse });
marketStatus(Temporal.Now.instant()).state; // "open", "early-close" or "closed"
sifma.day(Temporal.PlainDate.from("2026-11-27")); // an early close at 14:00, "After Thanksgiving Day"
```

| Calendar  | Rules from        | Tested against                                                            | Session                   |
| --------- | ----------------- | ------------------------------------------------------------------------- | ------------------------- |
| `sifma`   | sifma.org         | SIFMA's published recommendations for every year from 1996 to 2027        | 08:00 to 17:00, New York  |
| `nyse`    | parallax's Rust   | the fixtures the Rust writes, 2000 to 2050, and nyse.com for 2016 to 2028 | 09:30 to 16:00, New York  |
| `target2` | the ECB, Dec 2000 | the ECB's six closing days, 2000 to 2050                                  | 07:00 to 18:00, Frankfurt |

Each calendar is its rules plus a dated list of exceptions, each with the notice behind it, since markets close on days
no rule foresees. `publishedThrough` is the last year the publisher
had confirmed when the calendar was written; later years follow the rules. SIFMA publishes no regular session hours,
only closes, so its 8 a.m. to 5 p.m. session is the US bond venues' convention, as the calendar's `session.source` says.

`@basis/ui/securities` checks CUSIPs, ISINs and SEDOLs and their check digits. Its `Cusip`, `Isin` and `Sedol` types
are made only by `parseCusip`, `parseIsin` and `parseSedol`, which return the identifier or the reason it is not one,
so a ticker cannot reach a function that takes a `Cusip`:

```ts
import { cusipToIsin, parseCusip } from "@basis/ui/securities";

const reading = parseCusip(field.value);
if (reading.ok) {
  cusipToIsin(reading.value); // "US91282CRF04" for 91282CRF0
} else {
  showError(reading.reason);
}
```

`parseSecurityIdentifier` reads text that may be any of the three, telling them apart by their lengths, 9, 12 and 7,
and returns the identifier with its kind, as `SecurityPicker` does:

```ts
parseSecurityIdentifier("US91282CRF04"); // { ok: true, value: { kind: "isin", value: "US91282CRF04" } }
parseSecurityIdentifier("91282CRF1", ["cusip"]); // { ok: false, reason: '"91282CRF1" is not a CUSIP: ...' }
```
