# Plan: release readiness

This plan takes basis-ui from a demo to something tens of developers at the firm can build on. It comes from a review
of the whole repo on 2026-11-13: the checks were run, twelve reviewers each read one area, their leading findings were
checked against the code, and an app made from the packed template was run on `winbox`, the Windows machine that
stands in for the firm's desktop, on Windows and in WSL. It is Phase 7 of [the roadmap](roadmap.md), and it is written
for an agent that has not seen the review: everything a step needs is here, in the review file the step names, or in
the files this page names.

This page and `docs/review/` last as long as the phase does. When it closes they are deleted, and the roadmap's "Built
on" marks and the changelog keep what was done.

## Decisions, by the maintainer on 2026-11-13

1. **Sign-in is Windows authentication.** The browser signs the user in to a token endpoint with their Windows
   account, the endpoint answers with a JWT that holds the user's name and roles, the app keeps the token in the
   browser's local storage, and every API request carries it as a bearer token, so that backends share the one
   system. `@basis/ui` ships the adapter. The firm's endpoint and its claim names are set when basis-ui is brought to
   the firm, so they are options, with nothing of the firm's in this repo.
2. **An app writes its own Dockerfile and pipeline.** The deploy path is out of scope. `vp run sync` stops managing
   the `Dockerfile`, the `Caddyfile`, `.dockerignore` and `azure-pipelines.yml`, so an app may edit or replace them;
   the template keeps the Dockerfile and Caddyfile as a starting point the app owns.
3. **A rate field refuses a bare number.** `25` in a field that takes `%` and `bp` committed 2,500% with no hint. The
   maintainer left the choice to the review, which chose the smallest rule that cannot misread: a rate needs its
   unit, `5.25%` or `525bp`, and a bare `0` stands.
4. **The open reviews of look pass.** The rows of `PLAN.md`'s "Found while building" that wait "for the maintainer's
   review" are closed as they stand: the themes, the limits and the choices of look.
5. **The UI runs on Windows only.** Users run Chrome or Edge on Windows, and developers work on Windows. WSL keeps
   working where that is cheap, and is not a target.

Left as they are: the name, still a placeholder, and the pilot at the firm, the maintainer's.

## How to work

These hold for every step. They follow Phase 6's, and the rules written after this host ran out of memory on
2026-11-10.

- One step, one agent, in the lane's git worktree, `~/dev/basis-ui-worktrees/LANE`, on a branch named after the lane.
  The steps of a lane run in order; lanes run at the same time.
- A failing test first, for each finding that a test can hold: one that fails for the reason the finding gives.
  Then the fix, then the checks. A finding that reading the code shows to be wrong is recorded as such, with the
  reason, and not "fixed".
- Fix what the review file lists, most severe first, including what it calls polish where the fix is small. A
  finding that needs a decision the plan does not make: take the smallest change that removes the wrong outcome,
  and record it.
- Commit a few findings at a time, not the whole step at once. After each commit: `git fetch origin && git rebase
  origin/main`, the checks below, and `git push origin HEAD:main`. Never hold more than a few findings uncommitted.
- Checks before a push: `vp run @basis/ui#build` after a change to `@basis/ui`; `vp check`; the unit tests of what
  changed; the browser tests of what changed; and what the step names. The commit hook runs the build, `vp staged`
  and `vp check`. A change to `@basis/parallax`'s public types, or to a component's props, needs `vp run
  @basis/ui#catalogue` and `vp test tests/catalogue.test.ts` in `packages/ui`.
- On a rebase conflict in a generated file (the catalogue, a lockfile, a screenshot baseline, `theme.css`),
  regenerate it; never merge it by hand.
- Record what was done in the step's review file, `docs/review/NAME.md`: under each finding, a line that starts
  `Done in COMMIT:` and says what changed, or `Not done:` with the reason. Add to its end a section "Changelog", the
  entries an app's agent needs, in `CHANGELOG.md`'s form; the release step folds them into `CHANGELOG.md`, so that
  lanes do not collide there. Do not edit `CHANGELOG.md`, this page or the roadmap: the orchestrator does.
- A decision the design records changes only where this plan says so, and then `docs/design.md` changes in the same
  commit.
- Memory: every command that builds Rust or the wasm, starts Docker, or runs a whole package's browser tests, a
  bench or `vp run -r` goes through `heavy -- COMMAND`, the host's one heavy slot. `CARGO_BUILD_JOBS=1`. No watch
  mode or dev server left running. Scratch files go under `$TMPDIR`, never `/tmp`, which is memory here.
- Screenshots: prove behaviour with unit and DOM tests. Record a baseline only where the canvas's pixels are the
  product, only the specs the change touches, and look at the picture.
- Write "the firm", never a firm's real name. This repo is public.

## Steps

| Step | Lane            | What                                                                                     | Review file                                           |
| ---- | --------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 7.1  | `ui-shell`      | The API layer and the shell, as a real server and ingress behave                         | `review/shell-api.md`                                 |
| 7.2  | `ui-shell`      | Sign-in by Windows authentication, roles on the user, and no fake sign-in in production  | this page, "Sign-in"                                  |
| 7.3  | `ui-components` | Inputs and forms                                                                         | `review/inputs.md`                                    |
| 7.4  | `ui-components` | Tables, saved views, shortcuts, overlays and navigation                                  | `review/data-nav.md`                                  |
| 7.5  | `ui-shell`      | The utilities and the file readers                                                       | `review/utilities.md`                                 |
| 7.6  | `ui-preset`     | The preset's tasks, on Windows as on Linux                                               | `review/preset-tasks.md`, and "On winbox" below       |
| 7.7  | `ui-preset`     | Lint rules, scaffolding, `shot` and the fixture tooling                                  | `review/lint-scaffold.md`                             |
| 7.8  | `ui-preset`     | The template, the synced files and the docs a person starts from                         | `review/onboarding.md`, and "Template and docs" below |
| 7.9  | `parallax`      | Parallax's React layer and engine client                                                 | `review/parallax-core.md`                             |
| 7.10 | `parallax`      | The grid and the pivot                                                                   | `review/grid-pivot.md`                                |
| 7.11 | `parallax`      | The charts                                                                               | `review/charts.md`                                    |
| 7.12 | `engine`        | The Rust: the engine, the session, the wasm boundary and the export                      | `review/engine.md`, `review/session-wasm-export.md`   |
| 7.13 | `ui-preset`     | CI: the template proven on Windows, and the wasm built as it ships                       | this page, "CI"                                       |
| 7.14 | orchestrator    | The proof on winbox again, the end-to-end suites, the changelog, the version and the tag | this page, "Release"                                  |

Where two steps meet:

- **A session's end and parallax's data** (`review/shell-api.md`, finding 2). 7.2 gives the shell one event for "the
  signed-in user changed or signed out", a `basis:sessionchange` event on `window` beside `basis:themechange`, and
  sends a dataset's failed request through the shell's own handling of sign-in problems when the app passes
  `arrowResponse`. 7.9 makes `ParallaxProvider` drop every dataset and view on that event, so one user's rows are
  never shown to the next, and load again for the new user.
- **A view the engine refuses to open** is in both parallax reviews (`parallax-core.md` 1, `grid-pivot.md` 7): 7.9
  fixes it, with `onError` on `Grid`, `Pivot` and `Chart`.
- **The date filter's time zone** is in both component reviews (`inputs.md` 8, `data-nav.md` 10): 7.3 fixes it.
- **A `TypeError` shown as a network failure** is in `shell-api.md` 7 and `data-nav.md` 15: 7.1 fixes it.
- **A panic's message** (`session-wasm-export.md` 4): 7.12 adds the hook in Rust and carries the message through
  `src/engine/serve.ts` and `limits.ts` to the page; 7.9 leaves those two files to it.
- **`cn`** (`lint-scaffold.md` 2, `onboarding.md` 12): 7.7 exports `cn` from `@basis/ui`, since the lint's own
  advice names it, and fixes the rule's false positive.
- **`vp run shot` on Windows** is in three reviews: 7.6 fixes it.

### Sign-in (7.2)

`windowsSignIn(options)`, a `SignIn` adapter exported from `@basis/ui` beside `fakeSignIn` and `anonymousSignIn`:

- `tokenUrl`: the endpoint that signs the browser in with the user's Windows account and answers with the token. The
  request goes with `credentials: "include"`, so the browser's own Windows authentication (Negotiate or NTLM) answers
  the endpoint's challenge; the endpoint may be on another origin of the firm's.
- The answer is the token as text, or JSON holding it, under `token`, `access_token` or the name `tokenField` gives.
- The token is kept in local storage under `storageKey`, so a reload or another tab of the app does not sign in
  again. Its payload is read, never verified, since the API verifies it: `exp`, and the claims `claims` names for the
  user's id, name, email and roles, with defaults a port changes in one place.
- `token()` answers the stored token until `renewBefore` seconds before it expires, then asks the endpoint again,
  once for however many requests wait. A token with no `exp` is kept until an API refuses it.
- An API that answers `invalid-token` means the stored token is no longer good: the adapter drops it and signs in
  again without a word to the user, and the request is retried once. Only when the endpoint itself refuses does the
  shell say that the session has ended, with its "Sign in again" action. Signing out drops the token; the user menu
  offers no sign-out for an adapter that signs in again at once, which the adapter says with a flag as
  `offersSignIn` says its own.
- `User` gains `roles`, the token's, empty for the other adapters, and the shell exports what a page needs to read
  them (`useUser`, if none exists). A role decides what a page shows; the API stays the judge of what a user may do,
  and the README says so.
- **No fake sign-in in production.** The template's entry uses `fakeSignIn()` only in `vp dev` and in a fixture
  build, and `windowsSignIn` otherwise, with the token endpoint named in one place; `vp run verify` fails, with an
  `ERROR` line that ends in the fix, on an app whose production build would sign users in with `fakeSignIn`.
- The README gains "Sign-in": the adapter, its options, what the firm's endpoint must answer, what to set when
  porting, and how to test a page that reads roles. `docs/design.md`'s account of sign-in changes in the same commit.
- Tests: the adapter against a fake endpoint (first sign-in, a stored token, renewal before expiry, one sign-in for
  many waiting requests, `invalid-token` renewed and retried, an endpoint that refuses, a token with odd claims), and
  the example app's browser tests for the flows the shell shows.

Also in 7.2, from `review/shell-api.md`: finding 3 (`signIn.token` passed detached), finding 5, and the adapter's
side of finding 2.

### On winbox (7.6, 7.8)

What the proof on `winbox` found on 2026-11-13, with an app made from the packed template and installed from the
packed packages. The Windows session was an elevated one, so "no admin rights" is still untested.

| #   | Where      | What happened                                                                                                                                                                                                                                                    | For             |
| --- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| W1  | Windows    | Behind a proxy that inspects TLS, Vite+'s installer and every Node tool fail until `NODE_EXTRA_CA_CERTS` names the proxy's CA. No doc says so, and `vp run doctor` does not look.                                                                                | 7.6 doctor, 7.8 |
| W2  | WSL        | With an older Node on the `PATH` (Ubuntu's is 18), Vite+ prefers it ("system-first"), `vp install` dies in `prepare` with a bare `SyntaxError`, and `vp run doctor` dies the same way. `vp env on` fixes it. The template pins neither Node nor pnpm.            | 7.8, 7.6 doctor |
| W3  | WSL, Linux | When Chromium cannot start, `vp run verify` prints its failure and never exits: `weighRoutes` in `src/preset/budget.ts` starts its server, then launches the browser outside the `try` that closes the server. The push hook hangs with it. Reproduced on Linux. | 7.6             |
| W4  | WSL        | A fresh Ubuntu lacks four libraries Chromium needs. `vp run doctor` says ok, since the browser is downloaded, and verify's `ERROR` line names `playwright install chromium`, where `install-deps` is what fixes it.                                              | 7.6 doctor      |
| W5  | Windows    | `vp run shot /` writes its files and never exits when it starts `vp dev` itself: `stopper` in `src/preset/dev-server.ts` kills a process group, which Windows lacks, and the detached child's pipes keep the task alive. With `vp dev` already running it works. | 7.6             |
| W6  | Git Bash   | `vp run shot /conventions` reaches the task as `C:/Program Files/Git/conventions`, MSYS's rewrite of a leading slash, and is refused as no route. `MSYS_NO_PATHCONV=1` avoids it. Claude Code on Windows runs commands in Git Bash.                              | 7.6             |
| W7  | WSL        | `vp run shot` was unreliable with no GPU: two of three shots passed Playwright's 30 s screenshot limit after the fonts loaded, and `--all` found no router within its 10 s. The cause is not known. Give it an hour; record what is found.                       | 7.6, if cheap   |
| W8  | Windows    | Passed: the install from tarballs, the hooks and the commit hook, all ten stages of `vp run verify` in 33 s, a type error and a lint error named at their file and line, `vp build`, the tests in a Node DOM, and a fresh clone that keeps its LF endings.       | nothing         |

Two of the reviews' predictions did not hold there, and need no fix: `tsc`'s lines are read on Windows
(`preset-tasks.md` 3), and Vite+'s installer puts a `vp.exe` on the `PATH` (`preset-tasks.md` 6; still run the bin
script through `process.execPath`, as `verify-tools.ts` does, where that is a small change).

The proof's scripts are kept outside the repo, in `~/.cache/basis-ui-agents/winbox/`: `prove-win.mjs` for Windows and
`wsl-prove.sh` for WSL. `ssh winbox` reaches the machine, and `~/dev/winbox-corp-env/README.md` describes it. Only
the agent of 7.6, and the orchestrator, use it, one run at a time.

### Template and docs (7.8)

From `review/onboarding.md`, with the deploy path left out by decision 2:

- `packages/create/package.json`'s `createConfig` names its template with `path`, where Vite+ 1.5.0 reads `template`
  (finding 1). Fix it, and hold it with a test that reads the manifest as Vite+ does.
- The template pins Node and pnpm as the root does (finding 14, W2), and `packages/ui`'s manifest names its `engines`.
- Decision 2: `sync` stops managing the Dockerfile, the Caddyfile, `.dockerignore` and `azure-pipelines.yml`; an app
  that has them keeps them as its own, their first line no longer saying basis-ui manages them. The template keeps
  the Dockerfile, the Caddyfile and `.dockerignore`, and drops the pipeline, which was never run. `docs/design.md`
  changes in the same commit ("A UI repo", "Serving the build", "Gates without CI").
- The managed `.gitignore` names what the framework's own tools write and what an editor leaves (finding 13).
- A page that loads in a browser too old for it says so, instead of drawing nothing: the head script checks for
  `Temporal`, which Chrome and Edge ship from 144, and the page names the version it needs. The README states the
  browsers basis-ui supports, and the design's "Not yet verified" says 144, not 139.
- The docs a person starts from: a short "Getting started" at the head of `packages/ui/README.md` (make the repo,
  install, `vp dev`, a page, the client, sign-in, verify), "On Windows" (W1, W2, W4, W6, PowerShell's way to set a
  variable for one command), versions and how an upgrade goes, and where to ask for a component or report a fault.
- The README's samples that disagree with the code (finding 16), the skills' front matter (finding 11), the app's
  name and title (finding 17), the template's samples that its own skill steers away from (finding 18), and the
  repo's stale map (finding 19).
- The published `@basis/ui` carries culori's licence beside the code it bundles from it.
- No `index.html` names an icon (`PLAN.md`, "Found while building"): the template, the gallery, the demos and the
  showcase get one.

### CI (7.13)

- A Windows job runs the template proof, `vp run @basis/create#prove`, from packed packages, so that what winbox
  proved by hand is held on every change to the template or either package. The engine is built once, on Linux, and
  the Windows job takes the packed tarballs as an artifact, so it needs no Rust.
- The proof makes its app with `vp create` itself if Vite+ takes a template from a folder or a tarball, so that the
  manifest is proven and not only read.
- CI's global `RUSTFLAGS` hides the wasm target's own flags, so CI never builds the engine with SIMD, as it ships
  (`session-wasm-export.md` 7): set the warnings another way.

### Release (7.14)

The orchestrator's, once every lane has landed:

1. The proof on winbox again, on Windows and in WSL, from the packed packages of `main`, and the showcase's first
   look there.
2. The four end-to-end suites and the gallery's shots, on a fresh build.
3. `CHANGELOG.md`: each review file's "Changelog" entries, under a `## 0.1.0` heading; `src/codemods/unreleased/`
   becomes `src/codemods/0.1.0/`; every package and the template's pins at `0.1.0`.
4. The roadmap's Phase 7 marked built, this page and `docs/review/` deleted, CI green on `main`, the tarballs
   repacked for ctzd and its session told, and the tag `v0.1.0`.

## Status

| Step | State       | Commits |
| ---- | ----------- | ------- |
| 7.1  | not started |         |
| 7.2  | not started |         |
| 7.3  | not started |         |
| 7.4  | not started |         |
| 7.5  | not started |         |
| 7.6  | not started |         |
| 7.7  | not started |         |
| 7.8  | not started |         |
| 7.9  | not started |         |
| 7.10 | not started |         |
| 7.11 | not started |         |
| 7.12 | not started |         |
| 7.13 | not started |         |
| 7.14 | not started |         |
