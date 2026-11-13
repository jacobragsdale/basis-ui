**Verdict: not ready for Windows desktops yet.** The area fails closed in most places, but I found one environment blocker to settle, two Windows defects that will hit on day one, one fail-open in `verify`, and an `upgrade` that cannot recover from a mid-way failure. Nothing was run with `vp`; "confirmed by running" means a small `node` probe against the real source. Paths are under `packages/ui/`.

## Findings

1. **`src/preset/shot-page.ts:23-34`, `budget.ts:139-150`, `installed.ts:101-105`, `doctor.ts:127-140`, `index.ts:260-271`** — `verify` needs Playwright's own Chromium, and the only install path offered downloads it from Playwright's public CDN, not the npm registry.
   - Scenario: a desktop with only the internal registry runs the pre-push hook. The tests stage can fall back with `BASIS_TEST_DOM=node`, but the budget stage always launches Chromium, and the template ships three budgets. The stage fails with "run `vp dlx playwright@X install chromium`", which cannot succeed.
   - Consequence: `verify` never passes, is never recorded for `review`, and `--no-verify` becomes the habit.
   - Not wired anywhere: `PLAYWRIGHT_DOWNLOAD_HOST`, or `channel: "msedge"` for the installed Edge.
   - Severity: release blocker if the CDN is unreachable; it is not on design.md's "Not yet verified" list.
   - Confidence: code path confirmed by reading; the firm's network is the unknown.

   Done in "Preset: the drift check holds what sits beside the framework's configuration, and the tasks name git's
   refusals", the smallest change that removes the outcome, as the plan leaves this open: on Windows, where Playwright's
   Chromium is not installed, `vp run shot` and the budget launch the Microsoft Edge every Windows desktop has
   (`channel: "msedge"`), and say so on stderr, so verify's budget stage can pass with no download; with
   `BASIS_TEST_DOM=node` for the tests stage, verify can pass on a desktop with only the internal registry. The line for
   a missing Chromium names `PLAYWRIGHT_DOWNLOAD_HOST` for a mirror of Playwright's downloads. `docs/design.md` says so,
   and its "Not yet verified" gains whether a desktop reaches Playwright's download site. `tests/shot.test.ts` holds the
   line; the Edge fallback can only be shown on Windows: on winbox, with `PLAYWRIGHT_BROWSERS_PATH` naming an empty folder, `vp run verify --stage budget` passed in Edge, saying so, and `vp run shot /` took its picture in Edge, which logged one 404 the headless Chromium does not, most likely for the `favicon.ico` no app has yet (step 7.8 adds an icon). `vp test`'s browser mode
   still needs Playwright's Chromium: `index.ts`'s test setup is not this step's.

2. **`src/preset/dev-server.ts:62-72` (with `:89-94`, `shot.ts:105-107`)** — the dev server that `vp run shot` starts is never stopped on Windows.
   - Scenario: `stopper` calls `process.kill(-child.pid, "SIGTERM")`. Windows has no process groups; libuv's `uv_kill` returns ESRCH for a negative pid, and the `catch` swallows it as "it ended already".
   - Consequence: the detached `vp dev` keeps running, its piped stdout/stderr keep the task's event loop alive, and `shot.ts` only sets `process.exitCode`. The first `vp run shot` without a running dev server prints its files and then hangs until the agent's tool times out, leaving an orphan on the port.
   - Severity: fix before release.
   - Confidence: confirmed by reading, relying on Node's documented lack of process-group kill on Windows.

   Done in "Preset: the vp dev that shot starts is stopped on Windows, and when shot is interrupted": `stopper` ends the
   tree with `taskkill /pid PID /T /F` on Windows and by its process group elsewhere, closes the child's pipes, and runs
   on `SIGINT`, `SIGTERM` and the task's exit too. Once the dev server answers, the child and its pipes are unref'd, so
   they never hold the task open. On Windows the child is no longer detached, which would give it a console window, and
   is started with `windowsHide`. `tests/dev-server.test.ts` starts a fake `vp dev` that starts a second Node to listen,
   and expects, after a stop and after a `SIGINT`, the task ended and no process or listener left; the interrupt failed
   before on Linux, and the stop holds Windows' case. A real `vp run shot /` in the example app, with no `vp dev`
   running, ended in 7 s with nothing left.

3. **`src/preset/verify-tools.ts:164-165, 177-204`** — the `tsc` line parser matches nothing when lines end in CRLF.
   - Scenario: `output.split("\n")` leaves a `\r`, and `(?<message>.*)$` cannot consume it. With CRLF output, zero errors parse, so the stage falls to `unread`.
   - Consequence: one finding with `file: null`, `line: null`, only the first error quoted, and the fix "run tsc --noEmit", a command that is not on an app's PATH. The verdict is still FAIL, but the JSON loses every location.
   - Severity: fix before release.
   - Confidence: regex confirmed by running (LF: 2 of 2 lines matched; CRLF: 0 of 2). That `tsc` 7 prints CRLF on Windows is from memory of TypeScript's platform newline; one run on winbox settles it.

   Did not hold on winbox, as the release plan records: `tsc`'s lines were read on Windows, a type error named at its
   file and line. Not done, then. A CRLF line would still not parse, so a `\r` before the end would be a cheap guard,
   but no Windows run printed one.

4. **`src/preset/upgrade.ts:128-137` (with `:83-93`, `codemods.ts:163-172, 216-235`, `changelog.ts:67-79`)** — a failure after `vp add` leaves a half-applied upgrade whose codemods can never be run.
   - Order is install → parse changelog → sync → codemods → verify. Three things abort after the install:
     - a line the old parser rejects in the new `CHANGELOG.md`;
     - `vp run sync` exiting 1 for what it cannot write (a `vite.config.ts` shape or dependency the new version refuses);
     - one file a codemod throws on, which discards every codemod's changes, since they are written only at the end.
   - Re-running is refused for the dirty tree; after a commit it says "nothing to upgrade". The sync failure's message says "run vp run sync and vp run verify" and omits the codemods.
   - A codemod meant to rewrite `vite.config.ts` can never run, because sync's check fails on the old shape first.
   - Severity: fix before release.
   - Confidence: confirmed by reading. `tests/upgrade.test.ts` cannot see it: its fake `vp run sync` always passes.

   Done in "Preset: an upgrade that stops part-way says how far it got, and --continue finishes it": each step of
   install, sync, codemods and verify that passes is recorded in the clone's git folder, `basis-ui-upgrade.json`, which
   `git status` never shows. A step that fails ends the task with its own lines and one more, "the upgrade of @basis/ui
   from A to B stopped at STEP, after X ran", naming the steps `vp run upgrade --continue` would run and how to undo the
   upgrade with git, since it began on a clean tree. `--continue` runs the steps left, in the version the upgrade
   installed, and refuses when that version is no longer installed, as after an undo. A changelog the running version
   cannot parse no longer stops the upgrade: it is named, with `vp run docs ui/changelog` to read it. A codemod that
   throws on one file leaves that file's line and writes the other files' changes, and `--continue` runs the codemods
   again once the file is fixed. The order stays install, sync, codemods, verify, as `docs/design.md` records it: a
   codemod meant to rewrite a `vite.config.ts` that sync refuses is reached by fixing what sync names and `--continue`.
   `tests/upgrade-stopped.test.ts` holds each case; all failed before. The fake `vp` can now fail sync, and logs what
   sync saw.

5. **`src/preset/verify.ts:76-82`** — the client stage ignores the child's exit status and passes when it crashes.
   - Scenario: it keeps only stderr lines starting `ERROR `. A child that dies any other way (bad `NODE_OPTIONS`, out of memory, a failed import, an uncaught async error) yields no findings.
   - Severity: fix before release.
   - Confidence: confirmed by running. With `openapi.json` holding invalid JSON and the child unable to start, `verify --stage client` returned `ok client … passed 1 of 1 stages`.

   Done in "Preset: verify fails a client check or a lint that failed without a report": the client stage reads the
   child's exit status, and a child that fails with no `ERROR` line is one finding, "vp run client-check failed (exit N)
   with no report to read", with what it said. `tests/verify-tools.test.ts` starts the check with a `NODE_OPTIONS` that
   cannot load, which passed before. The tools' environment is now read at each run, not when the module loads.

6. **`src/preset/upgrade-steps.ts:24-29, 46-51`, `dev-server.ts:59`** — `vp` is spawned by bare name with no shell.
   - Scenario: on Windows, Node finds only `vp.exe` or `vp.com`. If `vp` is reachable only as the `.cmd` shim (local CLI, or a global npm install from the internal feed), `upgrade` and `shot` fail with ENOENT and the advice "check that vp is on the PATH", where it is.
   - `verify-tools.ts:28-53` already avoids this by running `vite-plus/bin/vp` through `process.execPath`; these two did not follow.
   - Severity: fix before release, conditional on how `vp` is installed (itself unverified).
   - Confidence: confirmed by reading. `tests/upgrade/fixture.ts:85` fakes `vp` as a `#!/bin/sh` script, so the suite cannot see it.

   Did not hold on winbox, as the release plan records: Vite+'s installer puts a `vp.exe` on the `PATH`. Done in
   "Preset: the vp dev that shot starts is stopped on Windows, and when shot is interrupted": `shot` runs `vp dev` from
   the app's own `vite-plus/bin/vp` through Node. Not done for `upgrade`: the app's `vp` script has no `add`, `install`
   or `info`, which only the global Vite+ command has, so `upgrade` still spawns `vp` by name.

7. **`src/preset/sync.ts:196-206, 244-253`** — `vp run sync` overwrites any file at a framework path, whether or not it carries the header, with no clean-tree check.
   - Confirmed by running in a never-synced app: an own `.gitignore` (with `.idea/`, `.env`), `Dockerfile`, `CLAUDE.md` and `pnpm-workspace.yaml` (with `patchedDependencies`) were all replaced, reported only as "Wrote X."
   - The config stage's fix line for `tsconfig.json` or `src/styles.css` sends a hand-configured app to this command, which then also drops in the pipeline, hooks and skills.
   - Rewriting managed files is a recorded decision; the defect is the silent overwrite of files it did not write and of uncommitted work. `retiredFiles` already protects an app's own file; `stale` does not.
   - Severity: fix before release.

   Done in "Preset: sync keeps an app's own files and uncommitted work, and reads CRLF": `vp run sync` keeps a file at a
   framework path that does not open as it wrote it, and a `CLAUDE.md` other than its own one line, with one `ERROR`
   line each saying it is the app's own and how to take basis-ui's; and it keeps a file it would rewrite that holds
   changes git has not committed (changed since the index, or untracked), with an `ERROR` line to commit or discard
   them. It writes the rest and says so, and exits 1. `--check` and verify's sync stage name an own file the same way.
   Outside a git clone no change can be told, and none is held back. Which files sync manages is unchanged: decision 2's
   change waits for step 7.8. `tests/sync-own-files.test.ts` holds both; both failed before.

8. **`src/preset/verify-tools.ts:153-161`** — the lint stage ignores `vp lint`'s exit status whenever its JSON parses.
   - Scenario: a non-zero exit with no `error`-severity, non-compiler diagnostics reports ok. That covers a type-aware pass that fails after the report is printed, or compiler errors in a file outside `tsconfig`'s `include`, which the types stage never sees.
   - Severity: fix before release.
   - Confidence: plausible; the code path is read, but I could not produce the trigger without running `vp`.

   Done in "Preset: verify fails a client check or a lint that failed without a report": a `vp lint` that exits non-zero
   with no error in its report is the stage's `unread` finding. A report that holds only compiler errors still leaves
   them to the types stage, which runs `tsc` on the same `tsconfig.json`. `tests/verify-tools.test.ts` holds it with a
   fake `vp` whose lint prints an empty report and exits 1.

9. **`src/preset/upgrade.ts:96-137`** — `upgrade` does not reinstall after sync, and moves only `@basis/*`.
   - Scenario: a release that changes `overrides` in the synced `pnpm-workspace.yaml` (TypeScript 7.1, say) is verified against the old `node_modules`. The commit it tells you to make then fails `vp install --frozen-lockfile`.
   - `@basis/ui` peers on `vite-plus` at an exact version, and the app's own pins on `vite-plus` and `typescript` are left behind with at most a pnpm warning.
   - Severity: fix before the first toolchain bump.
   - Confidence: code confirmed by reading; pnpm's lockfile behaviour is from memory.

   Done in "Preset: an upgrade that stops part-way says how far it got, and --continue finishes it": the sync step
   installs again after `vp run sync`, and moves the app's exact pins on `vite-plus`, to the version the new @basis/ui
   peers on, and on `typescript`, to the synced `pnpm-workspace.yaml`'s override, with `vp add --save-exact` (`-D` for a
   development pin), so verify runs on what the lockfile will install. A range the app wrote is its own, and left. Held
   by `tests/upgrade-stopped.test.ts`'s toolchain test. That pnpm's `vp add` keeps a development dependency in
   `devDependencies` with `-D` is from pnpm's documentation, not run here against a real feed.

10. **`src/preset/app-config.ts:89-101, 151-159`, `installed.ts:13-16, 94-99`, `verify.ts:88-92`** — the drift check has loopholes.
    - Only `vite.config.ts`, `tsconfig.json` and `src/styles.css` are held. A `vitest.config.ts`, `.oxlintrc.json`, `.oxfmtrc.json` or `vite.config.js` beside them is not noticed; Vite+'s docs only "do not recommend" the first three, and Vite prefers `.js` over `.ts`.
    - Only dependency names in `dependencies` and `devDependencies` are checked. `optionalDependencies`, an alias such as `"zod": "npm:other@1"`, or a git/file spec all pass.
    - Deleting the budget from `vite.config.ts` passes the pattern, and the budget stage then prints `ok`.
    - Severity: fix before release for `vitest.config.ts` (agents add one readily); polish for the rest.
    - Confidence: confirmed by reading; whether `vp` honours the sibling files is plausible, not tested.

    Done in "Preset: the drift check holds what sits beside the framework's configuration, and the tasks name git's refusals":
    the config stage refuses a `vitest.config.*`, a `vite.config.*` other than `vite.config.ts` (Vite prefers `.js`),
    and an `.oxlintrc*` or `.oxfmtrc*` in the app's root, each with an `ERROR` line naming the tool that reads it; holds
    `optionalDependencies` to the list as the others are; and refuses a dependency installed under an alias (`npm:`),
    from a file, a link, git, GitHub or a URL, with `vp add NAME@VERSION` as the fix. `workspace:` stays, as basis-ui's
    own apps use it. `tests/drift-check.test.ts` holds each; each failed before. Not done: a `vite.config.ts` with no
    budget passes, and the budget stage then prints `ok`, since `basisPreset()` with no budget is among the framework's
    lines, and the example has none; requiring one is a decision the plan does not make. That Vite+ reads each sibling
    file is from its docs, not run.

11. **`src/preset/git.ts:13-25` (used at `doctor.ts:57-65`, `upgrade.ts:49-55`, `review.ts:58-63`)** — git's stderr is discarded, so every failure reads as "not a git clone".
    - Scenario: "detected dubious ownership" (common in WSL under `/mnt/c` and on redirected folders) makes `doctor` advise `git init`, `upgrade` refuse, and `verify` quietly not record.
    - Severity: polish, likely to cost support time. Confidence: plausible.

    Done in "Preset: the drift check holds what sits beside the framework's configuration, and the tasks name git's refusals": `git.ts` keeps what
    git says when it fails, and `refusedClone` tells a clone git will not read from no clone: "detected dubious
    ownership" is an `ERROR` line naming the folder and `git config --global --add safe.directory FOLDER`, and another
    refusal is named with git's own words. `vp run doctor`, `vp run upgrade` and verify's record use it instead of "not
    a git clone". `tests/git-refusals.test.ts` holds doctor's line with a stand-in for git that refuses as git does; it
    advised `git init` before.

12. **`src/preset/verify-tools.ts:207-214`, `upgrade-steps.ts:115-117`, `client.ts:264-266`** — temp folders are removed in `finally` with no retries.
    - Scenario: an EBUSY or EPERM from a virus scanner replaces a passing tests or build stage with "the tests stage failed: EBUSY". In a dry run, the codemod imports `vite-plus` from the temp folder, which may leave a loaded native binding there; a failed `rm` then discards the whole preview.
    - Severity: polish. Confidence: plausible.

    Done in "Preset: the drift check holds what sits beside the framework's configuration, and the tasks name git's
    refusals": `scratch.ts` removes a task's scratch folder with five retries and never fails the task for it, leaving
    one it cannot remove to the system's temporary folder; verify's report folders, the dry run's install and the client
    check's folder use it. `tests/verify-tools.test.ts` holds a report folder that refuses to be emptied, which replaced
    the stage's result with the error before; on Linux, by a folder's mode, since a scanner's hold cannot be made here.

13. **`src/preset/sync.ts:37, 138-148`** — CRLF is mishandled in two places.
    - An `AGENTS.md` saved with CRLF gets a second basis-ui block appended instead of the first replaced, and the check then passes with both.
    - A CRLF `tsconfig.json` is reported as "an app loosens no check".
    - Severity: polish. Confidence: confirmed by running (two begin markers after sync, zero problems reported).

    Done in "Preset: sync keeps an app's own files and uncommitted work, and reads CRLF": the pattern that finds
    basis-ui's block in `AGENTS.md` takes a CRLF line ending, so a CRLF file's block is replaced, not doubled, and a
    file that differs from what sync writes only in its line endings is named as such, with the fix, rather than as a
    loosened check. A framework file checked out with CRLF still counts as one sync wrote.
    `tests/sync-own-files.test.ts` holds both; both failed before.

14. **`src/preset/upgrade.ts:49-62`, `review.ts:64`, `sync/gitignore`** — any untracked file blocks `upgrade` and stops `verify` being recorded, and an app cannot add an ignore.
    - `.idea/`, `.vscode/` or `.env` are not in the managed `.gitignore`. The only way out is `.git/info/exclude`, which no message names.
    - The managed `.gitignore` is a recorded decision; the interaction is not.
    - Severity: polish. Confidence: confirmed by reading.

    Done in "Preset: the drift check holds what sits beside the framework's configuration, and the tasks name git's refusals", the interaction only:
    `vp run upgrade`'s refusal of a dirty tree, and verify's "Not recorded" line, name the files not committed, the
    first five and how many more, and `.git/info/exclude` for a file git should never see, as an editor's. What the
    managed `.gitignore` names is step 7.8's (`onboarding.md` 13). `tests/git-refusals.test.ts` holds both lines.

## Quality of the area and its tests

The code is careful and consistent. `verify`'s tests, build, types and format paths fail closed through `unread`, and the tasks run tools through `process.execPath` with paths normalised to `/`. The tests are mostly real: they spawn `tasks.ts` in temp apps against the example app's actual tools.

The gaps are in what they never simulate:

- **Tool misbehaviour:** no test makes a tool crash or print something odd, which is why finding 5 stands.
- **CRLF:** no test feeds CRLF anywhere.
- **`vp run` itself:** the preset tests assert command strings, never running them through `vp run`.
- **`upgrade`:** it is tested against a shell-script `vp` whose sync always passes and whose install is a folder copy, so its real failure modes are untested.

## Windows risks

- **Task command quoting:** `node "C:\…\tasks.mjs"` goes through Vite Task's own parser (`index.ts:50-58, 90-103`). Bash-like rules would collapse the `\\` of a UNC path; forward slashes would be safer.
- **Git Bash path conversion:** a leading-slash argument such as `vp run shot /positions` is rewritten by MSYS to `C:/Program Files/Git/positions`. Claude Code on Windows runs commands in Git Bash.
- **Case-sensitive paths:** `devPort` hashes `path.resolve(root)` and `answering` compares roots exactly (`fixture-mode.ts:64-67`, `dev-server.ts:43-46`). A probe gave three different ports for `C:\Repos\app`, `c:\Repos\app` and `C:\repos\app`.
- **Console window:** `detached: true` may open one for each `vp dev` that `shot` starts.
- **Shared checkout:** one working copy used from both Windows and WSL has one platform's native bindings; the synced `pnpm-workspace.yaml` sets no `supportedArchitectures`.
- **Corporate TLS and proxies:** `client-pull URL` uses Node's `fetch`, which does not use the system CA store or proxy by default, and the message keeps only "TypeError: fetch failed" (`client.ts:91-100`). The URL, with any token in it, is written into `openapi.json` (`:115-121`).
- **Dry-run weight:** it installs all of `@basis/ui`'s dependencies into `%TEMP%`, which is a full copy if the pnpm store is on another drive.
- **Shared Citrix hosts:** if desktops are multi-session, `vp dev` on `127.0.0.1` with `.fixtures/` client data is reachable by other sessions.
- **POSIX-only content:** the hooks need Git for Windows' `sh`; the skills use bash syntax; `azure-pipelines.yml` and the drive-the-app skill fetch `vite.plus`, Chromium and Chrome-for-Testing from the public internet.
- **`client-check`:** it assumes orval emits identical bytes on Windows. I found no platform line-ending use in orval's build, but it has not been run there.

## Not read

- `docs-entry.ts`, `docs-search.ts`, `display-formats.ts`, `head-script.ts`, and the lint, scaffold, shot and fixture modules beyond `launch`, `devPort` and `rootPath`.
- Test bodies of `verify-report`, `codemods`, `changelog`, `precompress`, `docs-task`, `sync-workspace`, `budget` and `client-tasks`; I read only their titles and a few cases.

The probe scripts are in `(a scratch folder)`; nothing in the repo was touched.

## On winbox

What `docs/release-plan.md`'s "On winbox" gives step 7.6.

- **W3**, `vp run verify` never exits when Chromium cannot start.
  Done in "Preset: the budget ends when Chromium cannot start": `weighRoutes` launches the browser inside the `try`
  that closes its server, so a launch that fails ends the task with its `ERROR` line. `tests/budget.test.ts` runs the
  task with an empty `PLAYWRIGHT_BROWSERS_PATH` and expects it to exit 1 within 30 s; before, it was killed at 30 s. In WSL on winbox, from the packed packages, `vp run verify --stage budget` with no Chromium ended in 3 s with its `ERROR` line.
- **W5**, `vp run shot /` never exits on Windows when it starts `vp dev` itself.
  Done in "Preset: the vp dev that shot starts is stopped on Windows, and when shot is interrupted": finding 2's fix. `vp dev` is also run from the app's own Vite+, its `bin/vp` through Node, as
  verify runs its tools, so no `vp` on the `PATH` is needed. On winbox, from the packed packages, `vp run shot /` with no `vp dev` running wrote its files and exited in 8.3 s, leaving no listener on the app's port and no `node` but the proof's own.
- **W1**, behind a proxy that inspects TLS, every Node tool fails until `NODE_EXTRA_CA_CERTS` names the proxy's CA.
  Done in "Preset: doctor checks Node, the registry's certificate and that Chromium starts, and shot reads Git Bash's routes" (doctor's part; the docs are step 7.8's): `vp run doctor` makes one `HEAD` request to the registry the
  app installs from, `.npmrc`'s `registry` or npm's, from a Node of its own with `NODE_USE_ENV_PROXY=1`, so it goes
  through `HTTPS_PROXY` as pnpm does. A certificate Node does not trust is an `ERROR` line naming its code and
  `NODE_EXTRA_CA_CERTS`, with `setx` on Windows; a registry that does not answer is one too; and a
  `NODE_EXTRA_CA_CERTS` that names no file is another. `tests/doctor.test.ts` serves a registry over HTTPS with a
  certificate made for the test, and expects the line, then `ok` once `NODE_EXTRA_CA_CERTS` names the certificate. On winbox, `vp run doctor` passed with `NODE_EXTRA_CA_CERTS` set, and without it named `UNABLE_TO_VERIFY_LEAF_SIGNATURE` from the proxy, with the fix.
- **W2**, an older Node on the `PATH`, which Vite+ prefers. Done in "Preset: doctor checks Node, the registry's certificate and that Chromium starts, and shot reads Git Bash's routes" (doctor's part): `vp run doctor` holds the
  Node that runs it to `vite-plus`'s `engines.node`, and `@basis/ui`'s once it has one (step 7.8), and names
  `vp env on`. Under Node 18 `vp run` itself fails before any task of `@basis/ui`'s runs, so nothing here can make
  that failure legible: step 7.8 pins Node. Held by `tests/doctor.test.ts`, with a `vite-plus` that needs Node 99.
- **W4**, a fresh Ubuntu lacks libraries Chromium needs, and doctor says ok. Done in "Preset: doctor checks Node, the registry's certificate and that Chromium starts, and shot reads Git Bash's routes": `vp run doctor` starts
  Chromium as the tasks do, headless, rather than looking for its file, which was the wrong one for headless runs
  anyway. A Chromium that cannot start for a missing library is an `ERROR` line naming the libraries and `sudo vp dlx
  playwright@VERSION install-deps chromium`; `vp run shot`'s and the budget's launch name the same fix, so verify's
  `ERROR` line does too. `tests/doctor.test.ts` puts a headless Chromium in place that fails as one missing
  `libnss3.so` does, on Linux.
- **W6**, Git Bash rewrites `vp run shot /conventions` to `C:/Program Files/Git/conventions`. Done in "Preset: doctor checks Node, the registry's certificate and that Chromium starts, and shot reads Git Bash's routes": on
  Windows, a route that arrives as a Windows path under Git's own folder, which `git --exec-path` gives, is taken
  back to the route; one under another folder is refused with an `ERROR` line naming `MSYS_NO_PATHCONV=1`.
  `tests/shot-options.test.ts` holds both with the root given. On winbox, in Git Bash, `vp run shot /conventions --json` reported `ok` with no `MSYS_NO_PATHCONV`.
- **W7**, `vp run shot` unreliable in WSL with no GPU. Not done: an hour, as the plan allows, found where the time
  goes but not why. In WSL on winbox (5 processors, 5 GB, no GPU, SwiftShader's Vulkan), against the template's
  `vp dev`, each of four launches loaded `/` or `/conventions` in under 300 ms with its fonts ready in under 100 ms;
  the time is all in `page.screenshot`, on no pattern of flag. On `/` and then `/conventions`: Playwright's headless
  shell passed the 30 s limit, then took 12 s; `--disable-gpu` passed it, then took 93 ms; `--use-angle=swiftshader`
  took 23 s, then passed it; the new headless mode (`channel: "chromium"`) took 105 ms, then passed it. Neither page
  draws a canvas, so it is the compositor's frame, not WebGL.
  The proof's `vp run shot /` in WSL failed so, after 35 s, and now ends, leaving nothing running. Still to try: a screenshot with `animations: "disabled"` and `caret: "hide"`, a smaller viewport, and the same run
  with Defender's real-time scanning off, which only the maintainer may change.

## Changelog

- `vp run verify` and `vp run budget` end, with their `ERROR` line, when Chromium cannot start; before, the budget's
  server held the task open and the push hook hung with it. What to do: nothing.

- `vp run verify`'s client and lint stages fail when their tool fails with no report to read, as a client check whose
  child cannot start, or a lint whose type-aware pass crashes; before, both passed. What to do: nothing.

- `vp run shot` stops the `vp dev` it started, and everything that one started, on Windows too, and when it is
  interrupted; before, on Windows, the task wrote its files and never exited, leaving a dev server on the port. It runs
  `vp dev` from the app's own Vite+. What to do: nothing.

- `vp run upgrade` that stops part-way names the steps that ran, of install, sync, codemods and verify, and those that
  did not, and `vp run upgrade --continue` runs the rest; the line also says how to undo it with git. A changelog the
  installed version cannot parse no longer stops an upgrade, and a codemod that cannot change one file still writes
  the others. Sync now installs again, and moves the app's exact pins on `vite-plus` and `typescript` to the versions
  the new release needs. What to do: nothing; when an upgrade stops, do as its last `ERROR` line says.

- `vp run sync` keeps an app's own file at a path where it writes basis-ui's, such as a `Dockerfile` or `CLAUDE.md` it
  did not write, and a file with changes git has not committed, naming each in an `ERROR` line; it writes the rest and
  exits 1. Before, it overwrote both and said only "Wrote X". What to do: when it names a file, do as its line says.
- `vp run sync` replaces the basis-ui block of an `AGENTS.md` saved with CRLF line endings, rather than adding a
  second, and `--check` names a file that differs only in its line endings as such. What to do: nothing.

- `vp run doctor` checks more of the desktop: the Node that runs the tasks against what Vite+ needs, with `vp env on`
  as the fix; one HTTPS request to the registry, through `HTTPS_PROXY`, naming `NODE_EXTRA_CA_CERTS` when Node does not
  trust the certificate it gets, as behind a proxy that inspects TLS; and that Chromium starts, naming
  `playwright install-deps chromium` when it lacks a system library, as a fresh Ubuntu in WSL does. `vp run shot` and
  verify's budget name the same fix. What to do: run `vp run doctor` on a new desktop, and do as each `ERROR` line says.
- `vp run shot /route` in Git Bash, which rewrites the route into a Windows path, takes the route back. What to do:
  nothing.

- `vp run verify`'s config stage refuses a `vitest.config.*`, a second `vite.config.*`, an `.oxlintrc*` or an
  `.oxfmtrc*` beside the framework's configuration, holds `optionalDependencies` to the list of packages an app may
  use, and refuses a dependency installed under an alias or from outside the feed. What to do: delete such a file, and
  install each named dependency with `vp add NAME@VERSION`.
- `vp run doctor`, `vp run upgrade` and verify's record name git's own refusal of a clone, such as one it holds to be
  another user's, with `git config --global --add safe.directory`, rather than calling it no clone; and the files not
  committed that stop an upgrade or a record, with `.git/info/exclude` for a file git should never see. What to do:
  nothing.
- A task whose scratch folder a virus scanner holds a moment too long no longer fails for it: the folder is removed
  with retries, and left to the system when it cannot be. What to do: nothing.
- On Windows, where Playwright's Chromium is not installed, `vp run shot` and the budget use the installed Microsoft
  Edge, and say so; the line for a missing Chromium names `PLAYWRIGHT_DOWNLOAD_HOST` for a mirror. What to do: on a
  desktop that cannot reach Playwright's download site, set `BASIS_TEST_DOM=node` for `vp test`.
