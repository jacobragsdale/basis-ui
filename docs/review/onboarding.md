# Day-one review: templates, docs and agent guidance

A new developer cannot get from nothing to a deployed, signed-in app today, and four of the breaks are not on the known-items lists. Local authoring on Linux (fixture-mode dev, scaffolding, verify, build) is in good shape and the API docs are accurate. Nothing was run; every finding is from reading docs against code, plus two small read-only node scripts.

## Findings, most severe first

1. **`vp create @basis:app` will fail on its manifest once published.**
   - Where: `packages/create/package.json:19` writes `"path": "./templates/app"`. Vite+ 1.5.0 requires `template` (`validateTemplateEntry` in `node_modules/vite-plus/dist/create/bin.js:611-632`) and exits with `createConfig.templates[0].template must be a non-empty string`.
   - Why it was missed: `packages/create/scripts/prove.ts:135-144` copies the folder by hand, so nothing ever runs `vp create`.
   - Who: every developer creating a repo, the day step 1.8 publishes.
   - Severity: release blocker (one-word fix). Confidence: confirmed in both files.

2. **There is no real sign-in, no example adapter, and nothing stops the fake one shipping.**
   - Where: `packages/create/templates/app/src/main.tsx:16` hard-codes `fakeSignIn()`. `packages/ui/src/shell/sign-in.ts` has only `fakeSignIn` and `anonymousSignIn`.
   - Docs: `packages/ui/README.md:213-220` describes the four-function interface in one paragraph, with no worked adapter (redirect, callback, token renewal).
   - No lint, verify stage or build check flags `fakeSignIn` in a production build.
   - Who: any team wiring the firm's JWT sign-in, or deploying the template as it is.
   - Severity: release blocker (step 1.9 is known; the missing example and tripwire are not). Confidence: confirmed.

3. **The pipeline does not deploy, and an app is forbidden to fix it.**
   - Where: `packages/ui/sync/azure-pipelines.yml:13-26` runs only `vp run verify`. It has no feed authentication, no image build or push, no deploy stage and no templates, though `docs/design.md:102` says it "calls the maintainer's team's templates".
   - It installs `vp` with an unpinned `curl https://vite.plus | bash` and downloads Chromium from a public CDN.
   - The file is managed (`packages/ui/src/preset/sync.ts:42-52`, byte-compared), so any local edit fails the commit hook's `sync` stage.
   - Who: the first team that tries to ship.
   - Severity: release blocker. Confidence: confirmed by reading; never run, as the file says.

4. **The image's base is public, unpinned, root, and equally locked.**
   - Where: `packages/ui/sync/Dockerfile:3` is `FROM caddy:2-alpine`: Docker Hub, a floating tag, no `USER`, port 80.
   - An app cannot point it at the firm's registry or change the user, because the file is managed. Nothing builds the image in CI or in `prove`.
   - Who: the pipeline's first image build, and any AKS namespace that refuses root.
   - Severity: release blocker. Confidence: file confirmed; the firm's registry and pod policy are plausible.

5. **Nothing documents the firm's network, and Chromium is mandatory.**
   - Missing: how to install `vp` on Windows, a Node mirror (`VP_NODE_DIST_MIRROR`), the registry (the template has no `.npmrc` or `_npmrc`), the Chromium download host, and CA certificates.
   - Where: `packages/ui/src/preset/doctor.ts` checks none of them. The `budget` stage always launches Chromium (`packages/ui/src/preset/budget.ts:141`), so without it the push hook can never pass.
   - Who: every developer on a Citrix desktop, at install.
   - Severity: release blocker if the CDN is blocked. Confidence: docs gap confirmed; network policy plausible.

6. **There is no way to make an app before the registry exists, and no release mechanics.**
   - Where: `packages/ui/README.md:19-20` says "install it from a tarball", but the template pins `"@basis/ui": "0.0.0"` and packed parallax depends on that exact version.
   - `pnpm-workspace.yaml` is managed, so an app cannot add overrides. The only working recipe is `prove.ts`'s pnpmfile outside the app, which also needs Rust and `wasm-bindgen`.
   - Every package is at 0.0.0 and the changelog holds only "Unreleased". No written step bumps the template's pins.
   - Who: pilot developers now, and the maintainer at the first release.
   - Severity: fix before release. Confidence: confirmed.

7. **On native Windows, `vp run shot` probably never stops, or returns from, the `vp dev` it starts.**
   - Where: `packages/ui/src/preset/dev-server.ts:66` kills a negative pid, which Windows does not support; the error is swallowed. Line 91 spawns detached with piped output, which keeps the parent alive.
   - CI is ubuntu-only, and `winbox` only opened a built page.
   - Who: an agent on Windows after any UI change.
   - Severity: fix before release. Confidence: plausible; not run on Windows.

8. **The docs and skills assume a POSIX shell, and nothing says Windows or WSL.**
   - Where: `BASIS_TEST_DOM=node vp test` and `BASIS_API_URL=… vp dev` in `packages/ui/sync/agents.md:12,48`; `vp dev &` and a `pw() {…}` function in `packages/ui/skills/drive-the-app/SKILL.md:85-87`.
   - In Git Bash, `vp run shot /positions` is likely rewritten to a `C:/Program Files/Git/…` path by MSYS.
   - No page says which of the two to use, or not to share one clone's `node_modules` between them.
   - Who: developers and agents in PowerShell or Git Bash.
   - Severity: fix before release. Confidence: docs confirmed; MSYS plausible.

9. **There is no run-time configuration.**
   - Where: the environment banner is a literal prop (`packages/ui/src/components/app-shell.tsx:37`). `BASIS_API_URL` is read only by the dev server (`packages/ui/src/preset/index.ts:62-81`).
   - `/api` is fixed to the same origin, and `fetch` is banned, so an app cannot read a config file itself.
   - One image cannot be promoted from dev to QA to prod with a different banner, cookie domain, sign-in endpoint or telemetry target.
   - Who: every deployed app.
   - Severity: fix before release (needs a decision). Confidence: confirmed.

10. **The server sends no security headers, and no page says what a CSP must allow.**
    - Where: `packages/ui/sync/Caddyfile:6-25` has cache headers, precompression, SPA fallback and a 404 for missing assets, which is good. It has no CSP, `nosniff`, frame or referrer policy, and no access log.
    - A CSP would need to cover the inline head script, parallax's wasm and its module worker. "CSP" appears in no doc.
    - `/api/*` also falls back to `index.html` with a 200 when the ingress does not route it.
    - Who: the firm's security review, and the first ingress that adds a strict CSP.
    - Severity: fix before release. Confidence: confirmed.

11. **All four skills have front matter that strict YAML parsers reject.**
    - Where: line 3 of each `packages/ui/skills/*/SKILL.md` is an unquoted `description:` containing `: `.
    - `js-yaml` 4.3.2 and `yaml` 2.9.1 both fail on all four. Claude Code tolerates it.
    - Who: any other agent reading `.agents/skills/`.
    - Severity: fix before release (quote four lines). Confidence: confirmed by parsing.

12. **The lint and README tell agents to use `cn(...)`, which an app cannot import.**
    - Where: `packages/ui/src/preset/lint-classes.ts:81` and `packages/ui/README.md:815`.
    - `packages/ui/src/index.ts` does not export `cn`, and the `cn` package is not in the allowed list (`packages/ui/src/preset/dependencies.ts:7-24`).
    - Who: an agent fixing a dynamic-class error.
    - Severity: fix before release. Confidence: confirmed.

13. **The managed `.gitignore` cannot be extended and misses what the framework's own tools write.**
    - Where: `packages/ui/sync/gitignore` lacks `.playwright-cli/`, which `drive-the-app` line 101 says gets written, and IDE folders.
    - `packages/ui/sync/agents.md:30-33` omits `.gitignore` from its list of managed files.
    - Who: an agent running `git add --all` after driving the app.
    - Severity: fix before release. Confidence: confirmed.

14. **The template pins neither Node nor pnpm.**
    - Where: `packages/create/templates/app/package.json` has no `engines`, `devEngines`, `packageManager` or `.node-version`. The root repo pins all of them.
    - Vite+ then falls back to the latest LTS and the latest pnpm on each machine and in CI.
    - Severity: fix before release. Confidence: absence confirmed; I could not confirm whether `vp create` writes a pin.

15. **A person has no way in.**
    - There is no short getting-started, and the template has no `README.md`.
    - `packages/ui/README.md:12-107` opens with the by-hand setup. It never mentions the template, the image, the pipeline or Windows.
    - `sync`, `doctor` and `review` have no README section, so `vp run docs` cannot print one.
    - Also absent: browser support (Chrome/Edge 139 is only in the design's "Not yet verified"), a versioning policy, troubleshooting, an owner, and where a firm developer opens "a basis-ui pull request".
    - Severity: fix before release. Confidence: confirmed.

16. **Three README samples contradict the checks or the exports.**
    - `packages/ui/README.md:1216` uses `toFixed`, which `packages/ui/src/preset/lint-bans.ts:66` bans.
    - Line 1042 says to render `<Toaster />`, which `BasisApp` already renders (`packages/ui/src/shell/basis-app.tsx:250`).
    - Line 1406 uses `layoutSchema`, which nothing exports; parallax exports `parseLayout`.
    - README samples are not compiled or linted.
    - Severity: polish. Confidence: confirmed.

17. **App identity is never set.**
    - Where: `packages/create/templates/app/index.html:6` and `src/routes.ts:13` say "basis-ui app". `vp create` renames only `package.json`, and `AGENTS.md` does not mention either.
    - The shell never sets `document.title`, and the showcase still ships the placeholder.
    - Severity: polish. Confidence: confirmed.

18. **The template models patterns its own skill steers away from.**
    - Where: `packages/create/templates/app/src/sample/bond.tsx:32-41` hand-rolls a `<dl>` with colour classes. The pages use `TypographyH1`, where `build-a-page` says `Page` and `DescriptionList`.
    - Severity: polish. Confidence: confirmed.

19. **The repo's own map is stale.**
    - `AGENTS.md` omits `packages/create`, `packages/showcase` and `packages/showcase-data`.
    - `README.md:8-10` still says "first components" and "phase 1 fills in the rest".
    - `packages/ui/CONTRIBUTING.md:75` cites `@jacobragsdale/ui`.
    - Severity: polish. Confidence: confirmed.

## Day one, as it stands

1. **Install `vp`.** Undocumented for an app. The root `AGENTS.md` gives only `curl | bash`; Windows needs `irm https://vite.plus/ps1 | iex` (Vite+'s docs warn its `vp-setup.exe` is unsigned). Mirrors are unmentioned. **Gap.**
2. **Create the repo.** No command works today. Once published it fails (finding 1), then Vite+ appends `.env` lines that the drift check rejects (known). Today's only route is `vp run @basis/create#prove -- --keep` in a basis-ui clone with the Rust toolchain. **Gap.**
3. **`vp install`.** Needs a registry setting the template does not carry. Hooks on Windows are unverified (known).
4. **Chromium.** In the README's step 2 but not in `AGENTS.md`; `vp run doctor` does name it. It is a CDN download, and WSL also needs system libraries. **Gap.**
5. **`vp dev`.** Works in fixture mode with sample pages, proven on Linux by `prove`. Good.
6. **Rename the app.** Undocumented (finding 17).
7. **Pull the client.** `vp run client-pull` is well documented. The URL form sends no token. `AGENTS.md`'s clean-up omits the stale budgets in `vite.config.ts` and the links in `home.tsx`, though the types stage catches the links.
8. **Add a page.** `vp run new`, then `vp run shot`. Good; the budget is added by hand.
9. **Sign-in.** Fake or anonymous only. **Gap.**
10. **Tests and verify.** `checkRoutes`, the `ERROR` lines and the hooks are good; the push hook needs Chromium.
11. **Build.** `vp build` writes `dist/` with `.br` and `.gz`. Good.
12. **Image.** Cannot be built on the desktop, and nothing else builds it. **Gap.**
13. **Pipeline and environments.** Verify only; no deploy; no run-time configuration. **Gap.**

## README against exports

- **Names:** 217 checked against `packages/ui/src/index.ts` and the subpath entries. One mismatch: `cn`.
- **Props:** 162 checked against `catalogue.json`. None mismatched; seven apparent misses were variants or a field of `change`.
- **Commands:** all 13 tasks and 17 flags match `preset/index.ts` and the option parsers.
- **Parallax:** nine names from the READMEs and the `show-data` skill match; `layoutSchema` does not exist.
- **Consistency:** the template's framework files are byte-identical to `packages/ui/sync/`.

## What BUILDING.md implies for most apps

- **Hand-written row types.** This hits every grid page, and `packages/parallax/README.md:83` still says the generated client gives the type.
- **Fixtures ignore the request body.** This hits every form. The `build-a-page` skill's own example writes `book_trade-422.json`, which sorts before the success fixture, so the form would always fail in `vp dev` (not run).
- **No place for an app's own script or task.** The same lock stops a second API, a Vite plugin or a build-time define. I would rate it above "the maintainer's to decide", because findings 3, 4 and 13 are the same lock.

## Overall

The reference docs are unusually accurate, and the agent loop (scaffold, verify with fix-bearing `ERROR` lines, shot) is coherent and proven on Linux. Everything on either side of that loop is unproven or absent: getting the tools onto a Windows desktop, creating the repo, real sign-in, and getting an image to AKS. Byte-for-byte managed files turn each gap in the production files into something an app team cannot work around. The docs are written for an agent that already has a working repo; a person starting cold has no page to begin from. I would fix the manifest, run `prove` with a real `vp create` against a throwaway registry and on a Windows runner, and decide how apps extend the pipeline and image before anyone at the firm is told to start.

The two check scripts are `(a scratch folder)` and `(a scratch folder)`.
