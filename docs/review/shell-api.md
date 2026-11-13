# Review: app shell, API layer, fixture mode, testing helpers, preferences

One release blocker, four fix-before-release defects, and a tail of polish. The security design holds up; the confirmed bugs sit at the HTTP boundary and on the dataset path, which the shell's handling never sees.

## Findings, most severe first

**1. `packages/ui/src/api/fetch.ts:77-82` (called at `:120`, `:140`) — release blocker**

- **Defect:** `readBody` calls `response.json()` whenever the content type says JSON, so a 204 from a basis API throws.
- **Scenario:** A DELETE or PUT route answers 204. FastAPI sends `content-type: application/json` with an empty body, and basis registers routes on that default path (`routes.py:418`). `apiFetch` throws `SyntaxError: Unexpected end of JSON input` after the server has committed. The mutation shows "Something went wrong", `onSuccess` never runs, and the user repeats a write that succeeded.
- **Why tests miss it:** orval's MSW handlers and fixture records answer 204 with no content type.
- **Same root cause on errors:** a 502 with a JSON content type and empty body, or a truncated `invalid-token` 401, becomes a `SyntaxError`. It is then neither retried nor answered as a sign-in problem.
- **Confidence:** confirmed by running. A FastAPI `TestClient` 204 returned `{'content-type': 'application/json'} b''`; a node script against `fetch.ts` reproduced the throw. The FastAPI check was one Python snippet in basis's venv, outside the node-only rule, and wrote nothing.

Done in Shell: an empty body reads as none, and only a failed fetch is a network failure: `readBody` reads no body for a 204 or a 205, and none for any empty body whatever its content type,
so `data` is undefined; a JSON content type is read from the text, and on a failure a body that is not the JSON it
claims is kept as text, so an empty 502, a 500 of plain text and a truncated `invalid-token` 401 each become an
`ApiError` with their status, which the retry rule sees. A success whose JSON cannot be read still throws. Tested in
`tests/api-boundary.test.ts` with responses as FastAPI and an ingress send them; not run against a live FastAPI.

**2. `packages/ui/src/shell/sign-in-problems.ts:139-159`, `session-state.ts:81-84`, `packages/parallax/src/react/dataset-load.ts:73-87` — fix before release**

- **Defect:** the documented dataset path, `useDataset(name, async () => arrowResponse(url))`, bypasses everything the shell does for requests.
- **Scenario:** A grid page's only call is a dataset route. On `invalid-token` or `sign-in-required` the `ApiError` is reduced to a string inside parallax. There is no sign-out, no sign-in toast, no telemetry, and no retry of `keys-unavailable` or 502/503/504.
- **Sign-out gap:** `forgetResponses` resets only the query and mutation caches. After sign-out, or sign-in as someone else, the previous user's rows stay in the engine, on screen and exportable. A dataset that failed 401 stays failed after sign-in.
- **Where it is recommended:** `packages/create/templates/app/.claude/skills/show-data/SKILL.md:23` and `packages/showcase/src/data/datasets.ts`.
- **Confidence:** confirmed by reading; nothing in parallax or the shell links the two.

Done in Shell: a dataset's request is answered as a query's, and the user's change is announced, the shell's side: `arrowResponse` runs through a request runner the shell installs while
`BasisApp` is mounted (`setRequestRunner`, `src/shell/outside-queries.ts`): a network failure or a 502, 503 or 504 is
asked again twice with TanStack Query's backoff, the last failure is reported to telemetry as `source: "request"`, and
the same sign-in answer as the caches' handles it, so an ended session signs out once however many requests it fails.
The shell raises `basis:sessionchange` on `window` (`{ userId }`) whenever the settled user becomes another or nobody.
Left to 7.9: `ParallaxProvider` dropping its datasets and views on that event. `invalid-token` renewed and retried
comes with the Windows adapter.

**3. `packages/ui/src/shell/session-state.ts:33` — fix before release**

- **Defect:** `setTokenSource(signIn.token)` detaches `token` from its adapter, while `currentUser`, `signIn` and `signOut` are called as methods.
- **Scenario:** The firm's adapter (step 1.9, not yet written) is a class whose `token()` reads `this`. Every request rejects with `TypeError: Cannot read properties of undefined`. The shell shows "The server could not be reached. Check the network connection" and retries twice.
- **Confidence:** confirmed by running a class adapter through `setTokenSource` and `apiFetch`.

Done in Shell: a dataset's request is answered as a query's, and the user's change is announced: the shell gives `apiFetch` `async () => signIn.token()`, so an adapter written as a class keeps
its `this`; reproduced first with a class adapter in `tests/basis-app.test.tsx`, which threw the review's `TypeError`.

**4. `packages/ui/src/preset/fixture-bodies.ts:17-26` — fix before release (dev and test servers only)**

- **Defect:** the body-file middleware decodes each path part after splitting, so `%2F` (and `%5C` on Windows) smuggles `..` past the check.
- **Scenario:** `GET /__basis/fixture-body/fixtures/..%2F..%2F..%2F..%2Fetc%2Fpasswd` resolves to `/etc/passwd` and is streamed. Any file the developer can read is exposed, including `.env`, `.git/config` and `.fixtures/` client data.
- **Reach:** any local process, another user on a shared session host (loopback is per machine), or the network under `vp dev --host`. Vite's host check runs before the middleware, so DNS rebinding is blocked.
- **Confidence:** the function was confirmed by running (`bodyFileAsked` returned `fixtures/../../../../etc/passwd`); reachability is by reading. The existing test covers only `%2E%2E`.

Done in Fixtures: vp dev serves a body file only from inside a fixture folder: `bodyFileAsked(root, url)` decides by the path the request resolves to: the path is decoded once, an
encoded `%2F` or `%5C` is refused, and the rest is resolved against the fixture folder it names and must stay inside
it, by `path.relative`, with the platform's separators; it returns the file on disk. Tested with `path.posix` and
`path.win32` (the review's `..%2F` and `..%5C` paths, a drive letter, `%2E%2E`); the WHATWG URL parser folds an
encoded `%2E%2E` segment itself, so `fixtures/%2E%2E/.fixtures/x` reaches `.fixtures/x`, inside a fixture folder,
which is allowed. Not run on Windows.

**5. `packages/create/templates/app/src/main.tsx:16`, `packages/ui/src/shell/sign-in.ts:34-41` — fix before release**

- **Defect:** every scaffolded app ships `fakeSignIn()` in its production entry, and nothing in build, verify, doctor or lint flags it.
- **Scenario:** An app is deployed before 1.9. The UI shows "Dev User" and signs every request with the published development key. Safety rests entirely on each API refusing that key; one environment configured to accept it gives anyone a forgeable identity.
- **Confidence:** confirmed by reading, plus a grep of built output: the private key is in `example/dist`, `showcase/dist` and `parallax-demo/dist`. No guard exists in `src/preset`.

**6. `packages/ui/src/api/fetch.ts:90-103`, `shell/describe-error.ts:52` — fix before release**

- **Defect:** a non-problem error body always gets a synthesized title, and a 422 is parsed only by the strict validation schema.
- **Scenario A:** An ingress answers 403 or 404 with HTML over HTTP/2, where `statusText` is empty. The user sees only "Request failed", with no status. The "You do not have access" and "Not found" titles are unreachable for these responses.
- **Scenario B:** A 422 with no `errors`, or one entry of a third kind such as `{detail, header}`, loses its whole title, detail and fields.
- **Confidence:** confirmed by running both cases.

Done in Shell: an empty body reads as none, and only a failed fetch is a network failure: a body that is not problem details becomes one with no title, so `describeError` takes the
status's own words ("You do not have access to this", "Not found", "The request failed with status 503"), and the
`ApiError`'s message is `Request failed with status N`; the status text is no longer borrowed, since HTTP/2 has none.
A 422 that is not the validation shape is read as problem details, keeping its title and detail, and `fieldErrors`
reads each entry of `errors` on its own, so one of a kind the contract does not name, such as `{ detail, header }`,
keeps its detail under the whole request (`""`) and the rest keep their fields.

**7. `packages/ui/src/shell/query-client.ts:32`, `describe-error.ts:67-73` — polish**

- **Defect:** every `TypeError` is treated as a network failure.
- **Scenario:** A bug in a `queryFn` or `select` (`x.map is not a function`), or finding 3, is retried twice with backoff and shown as "The server could not be reached".
- **Confidence:** confirmed by running.

Done in Shell: an empty body reads as none, and only a failed fetch is a network failure: `apiFetch` and `arrowResponse` throw what `fetch` itself threw as a `NetworkError`, a
`TypeError` that holds the original as its `cause`, exported with `isNetworkError`. The query client retries only it,
and `describeError` says "The server could not be reached" only for it; any other `TypeError`, such as a bug in a
`select` or a token source that throws, is "Something went wrong" with its message, and is not retried. The gallery's
"unreachable" sample is a `NetworkError`. This also closes `data-nav.md` finding 15.

**8. `packages/ui/src/api/fetch.ts:59`, `api/mutator.ts:16` — polish, but a public type that is hard to change later**

- **Defect:** a hook's error type is `ApiError<the operation's declared problems>`, narrower than what is thrown.
- **Scenario:** An operation declares only 422. `mutation.error.problem.errors.map(...)` type-checks under the strictest settings, then crashes on a 502 (no `errors`) or a network failure (no `.problem`).
- **Confidence:** confirmed by reading the generated client (`TError = ErrorType<ValidationProblem>`) against what `apiFetch` throws. `ErrorAlert`, `describeError` and `submitErrors` take `unknown` and are safe.

Done in Shell: a hook's error type is what the client throws, and telemetry cannot stop a toast: `ErrorType<TProblem>`, which orval reads from `@basis/ui/mutator`, is now
`ApiError<TProblem | AnyProblem> | Error`, so `mutation.error.problem` does not type-check until `isApiError` narrows
it, and a narrowed problem's `errors` is `unknown`, read through `fieldErrors`. The mutator keeps its literal `export
type ErrorType` line, which orval looks for, as an alias of `@basis/ui`'s. The example's generated client and pages
type-check unchanged; a type test in `tests/api-boundary.test.ts` holds it.

**9. `packages/ui/src/shell/basis-app.tsx:67-95` — polish**

- **Defect:** telemetry is called unguarded inside the cache subscribers, and nothing listens for `error` or `unhandledrejection`.
- **Scenario:** A collector that throws once aborts the subscriber before `toastError`, so failed saves show nothing. Errors in event handlers and un-awaited promises never reach telemetry.
- **Confidence:** confirmed by reading.

Done in Shell: a hook's error type is what the client throws, and telemetry cannot stop a toast: `BasisApp` wraps the telemetry it is given in `guardedTelemetry`, so a call that throws is
written to the console and returns; the components inside get the guarded one. A throwing collector had done worse
than the review said: the subscriber's throw replaced the mutation's own error. `reportPageErrors` reports the
window's `error` (`source: "page"`) and `unhandledrejection` (`source: "unhandled-rejection"`). Tested in
`tests/basis-app.test.tsx`, in happy-dom.

**10. `packages/ui/src/preset/fixture-page.ts:38-48`, `fixtures/start.ts:41-45` — polish**

- **Defect:** the page's inline script awaits `startFixtureMode` with no catch.
- **Scenario:** A fixture build or `vp dev` is opened over plain HTTP by hostname, where there is no service worker API. MSW's invariant throws, the entry is never imported, and the page is blank with only a console error.
- **Confidence:** confirmed by reading MSW 3.0.4 (`lib/browser/index.js:228`). Nothing in the docs mentions a secure context.

Done in Fixtures: a page that cannot start fixture mode says why, not blank: `startFixtureMode` refuses at once on a page with no service worker, naming the address to
open (`http://localhost:PORT`, or HTTPS), and the page's inline script catches whatever it throws, calls
`fixtureModeFailed`, which writes "Fixture mode could not start" and the reason on the page as text and to the console,
and imports none of the app's modules. The README says fixture mode needs a secure page. Tested in happy-dom; not
opened over plain HTTP by hostname in a browser.

**11. `packages/ui/src/theme/preferences-cookie.ts:64-81`, `:107-109`, `preferences.ts:156-165` — polish**

- **Defect:** both readers take the first cookie of the name, and the comment's premise that a host-only cookie is listed first is wrong; equal paths are ordered oldest first (RFC 6265 §5.4).
- **Scenario:** App A sets `preferencesDomain`; app B on a sibling host does not, which is the template's default. B's own choice is written host-only behind the older shared cookie, so it reverts on the next cookie, focus or visibility event.
- **Confidence:** the parse order was confirmed by running; the browser ordering is by spec, not observed.

Done in Theme: an app's own preferences cookie is read before a shared one: the review is right that order cannot tell the cookies apart, in either direction: a browser
also keeps a cookie's first creation time when it is rewritten. Decision, the smallest that removes the wrong outcome:
the cookie an app keeps for itself, written without a domain, carries a fifth part, `.host`, and both readers,
`parsePreferences` and the head script, take a marked cookie first, else the first listed. The shared cookie is
unchanged, and an unmarked host-only cookie written before reads as it did until the next choice. `docs/design.md`'s
account of the cookie says so. Tested with the cookie-jar fake in both orders, and the head script held to
`parsePreferences` on both; the browser's ordering is still by spec, not observed.

**12. `packages/ui/src/testing/check-routes.ts:114-117`, `testing/index.ts:65-68`, `page-load.ts:14-25` — polish**

- **Defect:** `checkRoutes` and `renderApp` build their own router from the route tree, and "loaded" watches only the router and query client.
- **Scenario:** A router `context`, `basepath` or search serializer the app sets is never under test, and a loader reading `context.queryClient` cannot be tested at all. A dataset load that fails after the 100 ms still-window is not reported.
- **Confidence:** the first is confirmed by reading; the second is plausible.

Done in Testing: route tests make the router with the app's own options: `checkRoutes` and `renderApp` take `router`, the app's own router options, or a function of the
query client `BasisApp` holds that makes them, so a context carrying that client reaches a loader; both make the
router through one `testRouter`, and `renderApp` now gives `BasisApp` its query client. The README says what a route
test does not cover: a dataset loaded through `useDataset`, a failure after the 100 ms still-window, the page as drawn,
and the shipped sign-in adapter. Not done: the "loaded" rule still watches only the router and the query client;
watching parallax's datasets would need `@basis/ui/testing` to know parallax, which 7.9's lane owns.

**13. `packages/ui/src/api/problem.ts:39`, `basis-app.tsx:159-165` — polish**

- **Defect:** `pointerPath` lets `decodeURIComponent` throw.
- **Scenario:** A 422 with pointer `#/discount%` throws `URIError` inside `describeError`. If that happens in `PageError`, the outer boundary's own fallback, nothing is left to catch it.
- **Confidence:** the throw was confirmed by running; the blank page is by reading. A contract-compliant basis percent-encodes, so this is rare.

Done in Shell: an empty body reads as none, and only a failed fetch is a network failure: `pointerPath` returns `undefined` for a pointer `decodeURIComponent` refuses, so its error
sits under the whole request (`""`) and `describeError` cannot throw on it.

**14. `packages/ui/src/preset/dev-server.ts:62-72` — polish**

- **Defect:** `process.kill(-pid)` is the only stop for the detached `vp dev` that `vp run shot` starts, and the catch treats any failure as "ended already".
- **Scenario:** On Windows there are no process groups, so the server is likely left running after every shot.
- **Confidence:** plausible; not run on Windows.

## Checked and sound

- **Token scope:** the token cannot leave the origin. Every URL is prefixed with `/api`; an absolute URL becomes `/apihttps://…` (confirmed by running).
- **Token leakage:** none found in `ApiError`, telemetry, toasts or URLs. Fixture records refuse JWTs.
- **Concurrent 401s:** one sign-out, guarded by a flag and a null-user check. Only a single failing request is tested.
- **Retries:** two, with TanStack's default backoff. Mutations retry only on `keys-unavailable`.
- **Sign-out:** `resetQueries` silently cancels in-flight fetches and resets inactive queries (query-core 5.106.1).
- **Focus refetch:** driven by `visibilitychange` only, so no focus storms.
- **Production builds:** `vp build` carries no MSW or fixtures; `example/dist` has neither. A fixture build never reads `.fixtures/`.
- **Stale service worker:** MSW 3's worker passes through for any page that never activates it.
- **XSS:** no `innerHTML`. Problem text renders as React text, and the head script and cookie parse against allow-lists.
- **Cookie:** no `Secure` flag, but it holds only a theme choice.

## Overall quality

The area is in better shape than a week of agent work would suggest: small files, clear contracts, and careful security design. Pure functions are well tested (fixture format, cookie and head-script twins, retry predicates, route sampling), and the `invalid-token`, `sign-in-required` and `keys-unavailable` flows have real browser tests in `packages/example`. The gap is the HTTP boundary as a real server and ingress behave. No test covers a 204, an empty or non-JSON body, HTTP/2's empty status text, a failing token source, concurrent 401s, or sign-out with a dataset loaded. `BasisApp` itself is tested only through the example app.

## The sign-in adapter

- **What exists:** only `fakeSignIn` and `anonymousSignIn`. The firm's adapter is roadmap step 1.9, marked (work), with no code.
- **How it is wired:** an object of four functions passed to `<BasisApp signIn>`. `currentUser()` runs once at start and may redirect, `token()` runs per request and is expected to renew, and `signIn()` / `signOut()` may leave the page.
- **Open questions before writing it:**
  - What `token()` does when renewal fails. Throwing gives a generic error; returning `null` gives anonymous requests under a header that still shows the user.
  - The interface has no way to tell the shell the user changed.
  - Whether an expired session on `/api` is a 401 problem or an ingress redirect. A redirect surfaces as a `TypeError`, shown as a network error.
  - Whether `signOut()` on `invalid-token` should end the firm-wide session. That flow is a recorded decision, but one API with a wrong audience would then sign users out everywhere.

## Not read

- **Theme generator:** `check.ts`, `colours.ts`, `css.ts`, `declarations.ts`, `inputs.ts`, `levers.ts`, `pairs.ts`, `parallax-charts.ts`, `ramps.ts`, `theme-file.ts`, `tokens.ts` (outside the brief).
- **Skimmed only:** `testing/workbook-file.ts`, `testing/zip-file.ts`; `user-menu.tsx` was grepped.
- **Preset neighbours:** `fixture-document.ts`, `fixture-new.ts`, `orval.ts`.
- **Tests:** read in full were `api.test.ts`, `check-routes.test.tsx` and `sign-in-problems.browser.test.ts`; parts of `shell.test.ts` and `fixture-mode.test.ts`; test names only for the rest.
- **Example app:** its pages were not read.

Throwaway scripts are in `(a scratch folder)`.

## Changelog

- A 204, a 205, or any response with an empty body, whatever its content type, gives a generated hook `data`
  undefined, where a 204 that FastAPI sends as `application/json` used to fail after the write had happened. A failed
  response whose body is not the JSON it claims, or is empty, is an `ApiError` with its status, so it is retried or
  answered as any other. What to do: nothing.
- An error page with no problem details, such as an ingress's 403 over HTTP/2, is shown by its status ("You do not have
  access to this"), not "Request failed", and an `ApiError`'s message says the status. A 422 that is not the
  validation shape keeps its title and detail. What to do: nothing.
- Only a request that never reached the API is a network failure: `apiFetch` and `arrowResponse` throw it as a
  `NetworkError`, a `TypeError` whose `cause` is what `fetch` threw, and `isNetworkError` tells it. Any other
  `TypeError`, such as a bug in a query's `select`, is no longer retried or shown as "The server could not be
  reached". What to do: a test that stands for a lost connection with `new TypeError(...)` makes a `NetworkError`.
- A generated hook's `error` is typed as what the client throws: `ApiError` of any problem, or another `Error`, where
  it was an `ApiError` of the operation's declared problems alone, which a 502 or a lost connection broke at run time.
  What to do: narrow with `isApiError(error)` before reading `error.problem`, and read a 422's fields with
  `fieldErrors`; the compiler names each place.
- A telemetry collector that throws no longer stops a failed mutation's toast, or replaces the mutation's error: the
  shell writes it to the console and carries on. `BasisApp` reports the page's uncaught errors (`source: "page"`) and
  unhandled rejections (`source: "unhandled-rejection"`). What to do: nothing.
- `vp dev`'s body-file route, `__basis/fixture-body/`, serves only a file inside `fixtures/` or `.fixtures/` by the
  path it resolves to, where an encoded `/` or `\` let a request read any file the developer could. What to do:
  nothing.
- A page in fixture mode that the browser gives no service worker, such as `vp dev --host` opened over plain HTTP by
  hostname, says "Fixture mode could not start" and the address to open instead, where it was blank. What to do:
  nothing.
- The preferences cookie an app keeps for itself, with no `preferencesDomain`, ends in `.host`, as
  `dark.compact.full.default.host`, and is read before a shared one, so an app on a host under another app's shared
  domain keeps its own choice. What to do: nothing; a test that reads the cookie's value expects the mark.
- `checkRoutes` and `renderApp` take `router`, the app's own router options, as its `router.ts` gives `createRouter`,
  or a function of `BasisApp`'s query client that makes them: `{ router: (queryClient) => ({ context: { queryClient }
  }) }`. What to do: an app whose router sets a `context`, a `basepath` or a search serializer passes them, so that
  its route tests run the router it ships.
- A `User` holds `roles`, the token's, empty for `fakeSignIn` and `anonymousSignIn` unless given; `fakeSignIn`'s user
  may leave them out, and its token carries them. `useUser()` returns the signed-in user. A role decides what a page
  shows; the API stays the judge. What to do: an adapter of the app's own returns `roles` on its user.
- `basis:sessionchange` (`sessionChangeEvent`) is raised on `window` whenever the signed-in user becomes another user or
  nobody, with `{ userId }` as its detail. What to do: nothing.
- `arrowResponse` inside `BasisApp` is retried, reported and answered as a generated hook's request is, where a dataset's
  failure reached only its grid. What to do: nothing.
- A sign-in adapter written as a class works: the shell calls `signIn.token()` through the adapter. What to do: nothing.
