**Verdict: not ready for Windows desktops yet.** The area fails closed in most places, but I found one environment blocker to settle, two Windows defects that will hit on day one, one fail-open in `verify`, and an `upgrade` that cannot recover from a mid-way failure. Nothing was run with `vp`; "confirmed by running" means a small `node` probe against the real source. Paths are under `packages/ui/`.

## Findings

1. **`src/preset/shot-page.ts:23-34`, `budget.ts:139-150`, `installed.ts:101-105`, `doctor.ts:127-140`, `index.ts:260-271`** — `verify` needs Playwright's own Chromium, and the only install path offered downloads it from Playwright's public CDN, not the npm registry.
   - Scenario: a desktop with only the internal registry runs the pre-push hook. The tests stage can fall back with `BASIS_TEST_DOM=node`, but the budget stage always launches Chromium, and the template ships three budgets. The stage fails with "run `vp dlx playwright@X install chromium`", which cannot succeed.
   - Consequence: `verify` never passes, is never recorded for `review`, and `--no-verify` becomes the habit.
   - Not wired anywhere: `PLAYWRIGHT_DOWNLOAD_HOST`, or `channel: "msedge"` for the installed Edge.
   - Severity: release blocker if the CDN is unreachable; it is not on design.md's "Not yet verified" list.
   - Confidence: code path confirmed by reading; the firm's network is the unknown.

2. **`src/preset/dev-server.ts:62-72` (with `:89-94`, `shot.ts:105-107`)** — the dev server that `vp run shot` starts is never stopped on Windows.
   - Scenario: `stopper` calls `process.kill(-child.pid, "SIGTERM")`. Windows has no process groups; libuv's `uv_kill` returns ESRCH for a negative pid, and the `catch` swallows it as "it ended already".
   - Consequence: the detached `vp dev` keeps running, its piped stdout/stderr keep the task's event loop alive, and `shot.ts` only sets `process.exitCode`. The first `vp run shot` without a running dev server prints its files and then hangs until the agent's tool times out, leaving an orphan on the port.
   - Severity: fix before release.
   - Confidence: confirmed by reading, relying on Node's documented lack of process-group kill on Windows.

3. **`src/preset/verify-tools.ts:164-165, 177-204`** — the `tsc` line parser matches nothing when lines end in CRLF.
   - Scenario: `output.split("\n")` leaves a `\r`, and `(?<message>.*)$` cannot consume it. With CRLF output, zero errors parse, so the stage falls to `unread`.
   - Consequence: one finding with `file: null`, `line: null`, only the first error quoted, and the fix "run tsc --noEmit", a command that is not on an app's PATH. The verdict is still FAIL, but the JSON loses every location.
   - Severity: fix before release.
   - Confidence: regex confirmed by running (LF: 2 of 2 lines matched; CRLF: 0 of 2). That `tsc` 7 prints CRLF on Windows is from memory of TypeScript's platform newline; one run on winbox settles it.

4. **`src/preset/upgrade.ts:128-137` (with `:83-93`, `codemods.ts:163-172, 216-235`, `changelog.ts:67-79`)** — a failure after `vp add` leaves a half-applied upgrade whose codemods can never be run.
   - Order is install → parse changelog → sync → codemods → verify. Three things abort after the install:
     - a line the old parser rejects in the new `CHANGELOG.md`;
     - `vp run sync` exiting 1 for what it cannot write (a `vite.config.ts` shape or dependency the new version refuses);
     - one file a codemod throws on, which discards every codemod's changes, since they are written only at the end.
   - Re-running is refused for the dirty tree; after a commit it says "nothing to upgrade". The sync failure's message says "run vp run sync and vp run verify" and omits the codemods.
   - A codemod meant to rewrite `vite.config.ts` can never run, because sync's check fails on the old shape first.
   - Severity: fix before release.
   - Confidence: confirmed by reading. `tests/upgrade.test.ts` cannot see it: its fake `vp run sync` always passes.

5. **`src/preset/verify.ts:76-82`** — the client stage ignores the child's exit status and passes when it crashes.
   - Scenario: it keeps only stderr lines starting `ERROR `. A child that dies any other way (bad `NODE_OPTIONS`, out of memory, a failed import, an uncaught async error) yields no findings.
   - Severity: fix before release.
   - Confidence: confirmed by running. With `openapi.json` holding invalid JSON and the child unable to start, `verify --stage client` returned `ok client … passed 1 of 1 stages`.

6. **`src/preset/upgrade-steps.ts:24-29, 46-51`, `dev-server.ts:59`** — `vp` is spawned by bare name with no shell.
   - Scenario: on Windows, Node finds only `vp.exe` or `vp.com`. If `vp` is reachable only as the `.cmd` shim (local CLI, or a global npm install from the internal feed), `upgrade` and `shot` fail with ENOENT and the advice "check that vp is on the PATH", where it is.
   - `verify-tools.ts:28-53` already avoids this by running `vite-plus/bin/vp` through `process.execPath`; these two did not follow.
   - Severity: fix before release, conditional on how `vp` is installed (itself unverified).
   - Confidence: confirmed by reading. `tests/upgrade/fixture.ts:85` fakes `vp` as a `#!/bin/sh` script, so the suite cannot see it.

7. **`src/preset/sync.ts:196-206, 244-253`** — `vp run sync` overwrites any file at a framework path, whether or not it carries the header, with no clean-tree check.
   - Confirmed by running in a never-synced app: an own `.gitignore` (with `.idea/`, `.env`), `Dockerfile`, `CLAUDE.md` and `pnpm-workspace.yaml` (with `patchedDependencies`) were all replaced, reported only as "Wrote X."
   - The config stage's fix line for `tsconfig.json` or `src/styles.css` sends a hand-configured app to this command, which then also drops in the pipeline, hooks and skills.
   - Rewriting managed files is a recorded decision; the defect is the silent overwrite of files it did not write and of uncommitted work. `retiredFiles` already protects an app's own file; `stale` does not.
   - Severity: fix before release.

8. **`src/preset/verify-tools.ts:153-161`** — the lint stage ignores `vp lint`'s exit status whenever its JSON parses.
   - Scenario: a non-zero exit with no `error`-severity, non-compiler diagnostics reports ok. That covers a type-aware pass that fails after the report is printed, or compiler errors in a file outside `tsconfig`'s `include`, which the types stage never sees.
   - Severity: fix before release.
   - Confidence: plausible; the code path is read, but I could not produce the trigger without running `vp`.

9. **`src/preset/upgrade.ts:96-137`** — `upgrade` does not reinstall after sync, and moves only `@basis/*`.
   - Scenario: a release that changes `overrides` in the synced `pnpm-workspace.yaml` (TypeScript 7.1, say) is verified against the old `node_modules`. The commit it tells you to make then fails `vp install --frozen-lockfile`.
   - `@basis/ui` peers on `vite-plus` at an exact version, and the app's own pins on `vite-plus` and `typescript` are left behind with at most a pnpm warning.
   - Severity: fix before the first toolchain bump.
   - Confidence: code confirmed by reading; pnpm's lockfile behaviour is from memory.

10. **`src/preset/app-config.ts:89-101, 151-159`, `installed.ts:13-16, 94-99`, `verify.ts:88-92`** — the drift check has loopholes.
    - Only `vite.config.ts`, `tsconfig.json` and `src/styles.css` are held. A `vitest.config.ts`, `.oxlintrc.json`, `.oxfmtrc.json` or `vite.config.js` beside them is not noticed; Vite+'s docs only "do not recommend" the first three, and Vite prefers `.js` over `.ts`.
    - Only dependency names in `dependencies` and `devDependencies` are checked. `optionalDependencies`, an alias such as `"zod": "npm:other@1"`, or a git/file spec all pass.
    - Deleting the budget from `vite.config.ts` passes the pattern, and the budget stage then prints `ok`.
    - Severity: fix before release for `vitest.config.ts` (agents add one readily); polish for the rest.
    - Confidence: confirmed by reading; whether `vp` honours the sibling files is plausible, not tested.

11. **`src/preset/git.ts:13-25` (used at `doctor.ts:57-65`, `upgrade.ts:49-55`, `review.ts:58-63`)** — git's stderr is discarded, so every failure reads as "not a git clone".
    - Scenario: "detected dubious ownership" (common in WSL under `/mnt/c` and on redirected folders) makes `doctor` advise `git init`, `upgrade` refuse, and `verify` quietly not record.
    - Severity: polish, likely to cost support time. Confidence: plausible.

12. **`src/preset/verify-tools.ts:207-214`, `upgrade-steps.ts:115-117`, `client.ts:264-266`** — temp folders are removed in `finally` with no retries.
    - Scenario: an EBUSY or EPERM from a virus scanner replaces a passing tests or build stage with "the tests stage failed: EBUSY". In a dry run, the codemod imports `vite-plus` from the temp folder, which may leave a loaded native binding there; a failed `rm` then discards the whole preview.
    - Severity: polish. Confidence: plausible.

13. **`src/preset/sync.ts:37, 138-148`** — CRLF is mishandled in two places.
    - An `AGENTS.md` saved with CRLF gets a second basis-ui block appended instead of the first replaced, and the check then passes with both.
    - A CRLF `tsconfig.json` is reported as "an app loosens no check".
    - Severity: polish. Confidence: confirmed by running (two begin markers after sync, zero problems reported).

14. **`src/preset/upgrade.ts:49-62`, `review.ts:64`, `sync/gitignore`** — any untracked file blocks `upgrade` and stops `verify` being recorded, and an app cannot add an ignore.
    - `.idea/`, `.vscode/` or `.env` are not in the managed `.gitignore`. The only way out is `.git/info/exclude`, which no message names.
    - The managed `.gitignore` is a recorded decision; the interaction is not.
    - Severity: polish. Confidence: confirmed by reading.

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
