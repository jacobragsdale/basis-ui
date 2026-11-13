# Day-one review: templates, docs and agent guidance

A new developer cannot get from nothing to a deployed, signed-in app today, and four of the breaks are not on the known-items lists. Local authoring on Linux (fixture-mode dev, scaffolding, verify, build) is in good shape and the API docs are accurate. Nothing was run; every finding is from reading docs against code, plus two small read-only node scripts.

## Findings, most severe first

1. **`vp create @basis:app` will fail on its manifest once published.**
   - Where: `packages/create/package.json:19` writes `"path": "./templates/app"`. Vite+ 1.5.0 requires `template` (`validateTemplateEntry` in `node_modules/vite-plus/dist/create/bin.js:611-632`) and exits with `createConfig.templates[0].template must be a non-empty string`.
   - Why it was missed: `packages/create/scripts/prove.ts:135-144` copies the folder by hand, so nothing ever runs `vp create`.
   - Who: every developer creating a repo, the day step 1.8 publishes.
   - Severity: release blocker (one-word fix). Confidence: confirmed in both files.
   - Done in Template: vp create reads its manifest, the app pins Node and pnpm, and the skills' front matter parses: `createConfig.templates[0]` names `template`; `tests/create-manifest.test.ts` reads the manifest with Vite+ 1.5.0's own `validateManifest`, taken from the installed `vite-plus`, and failed on `path` with the review's message. Running `vp create` itself against a registry is 7.13's.
   - Done in "CI: the template proven on Windows from packed packages, made by @basis/create's own creator": the proof ran `vp create @basis:app` against a registry of its own on 127.0.0.1, which served the packed `@basis/create`, and it read the manifest and copied the template, but Vite+ 1.5.0 rewrote the app (a `vite` catalog and `peerDependencyRules` in `pnpm-workspace.yaml`, `fmt` and `lint` blocks in `vite.config.ts`, `vite-plus` as `catalog:`), so its drift check failed at once. By decision 6, `@basis/create` is its own creator, `vp dlx @basis/create NAME`; `createConfig` is gone, and the proof makes its app with that command from the packed tarball, on Linux and on Windows, so what a developer types is what CI runs.

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
   - Not done: out of scope by decision 2, which makes the deploy path the app's. Done in Sync: the deploy files are the app's, and the managed .gitignore names what the tools and editors leave: as far as decision 2 goes, `vp run sync` no longer manages `azure-pipelines.yml` (nor the Dockerfile, Caddyfile and `.dockerignore`): an app that has one keeps it, its header removed by the next sync, and the template, the example and the showcase drop the pipeline. The README's "Serving the build" says the app writes its own.

4. **The image's base is public, unpinned, root, and equally locked.**
   - Where: `packages/ui/sync/Dockerfile:3` is `FROM caddy:2-alpine`: Docker Hub, a floating tag, no `USER`, port 80.
   - An app cannot point it at the firm's registry or change the user, because the file is managed. Nothing builds the image in CI or in `prove`.
   - Who: the pipeline's first image build, and any AKS namespace that refuses root.
   - Severity: release blocker. Confidence: file confirmed; the firm's registry and pod policy are plausible.
   - Not done: out of scope by decision 2. Done in Sync: the deploy files are the app's, and the managed .gitignore names what the tools and editors leave: as far as decision 2 goes, the Dockerfile is the app's own, which `vp run sync` neither writes nor checks, so the app sets its registry, tag and user; the template's still says `FROM caddy:2-alpine`, as a starting point, and its first line says to change it.

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
   - Not done: out of scope with the deploy path (decision 2). Recorded as the app's in Sync: the deploy files are the app's, and the managed .gitignore names what the tools and editors leave: the README's "Serving the build" says what the build fixes and that basis-ui has no way yet to supply a value per environment.

10. **The server sends no security headers, and no page says what a CSP must allow.**
    - Where: `packages/ui/sync/Caddyfile:6-25` has cache headers, precompression, SPA fallback and a 404 for missing assets, which is good. It has no CSP, `nosniff`, frame or referrer policy, and no access log.
    - A CSP would need to cover the inline head script, parallax's wasm and its module worker. "CSP" appears in no doc.
    - `/api/*` also falls back to `index.html` with a 200 when the ingress does not route it.
    - Who: the firm's security review, and the first ingress that adds a strict CSP.
    - Severity: fix before release. Confidence: confirmed.
    - Not done: out of scope with the deploy path (decision 2), as the Caddyfile is now the app's. Recorded as the app's in Sync: the deploy files are the app's, and the managed .gitignore names what the tools and editors leave: the README's "Serving the build" lists the headers the template's Caddyfile does not send, the `/api/*` fallback, and what a CSP must allow, as read from the code (the inline head script by its hash, parallax's module worker, `'wasm-unsafe-eval'`, `connect-src` for `/api` and the token endpoint); no policy was tried.

11. **All four skills have front matter that strict YAML parsers reject.**
    - Where: line 3 of each `packages/ui/skills/*/SKILL.md` is an unquoted `description:` containing `: `.
    - `js-yaml` 4.3.2 and `yaml` 2.9.1 both fail on all four. Claude Code tolerates it.
    - Who: any other agent reading `.agents/skills/`.
    - Severity: fix before release (quote four lines). Confidence: confirmed by parsing.
    - Done in Template: vp create reads its manifest, the app pins Node and pnpm, and the skills' front matter parses: each `description` is a double-quoted string; `tests/skills.test.ts` holds every skill to a bare `name` and a JSON-quoted `description`, and `js-yaml` 4.3.2 and `yaml` 2.9.1 (strict) parse all four, checked by a script outside the repo, since neither is a dependency.

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
    - Done in Sync: the deploy files are the app's, and the managed .gitignore names what the tools and editors leave: the managed `.gitignore` also names `.playwright-cli/`, `.vitest/`, `__screenshots__/` (a browser test's screenshot on failure) and what an editor or the system leaves (`.idea/`, `.vscode/`, `*.swp`, `.DS_Store`, `Thumbs.db`); `tests/skills.test.ts` holds it to each folder a skill says a tool writes. `AGENTS.md`'s block lists `.gitignore` among the managed files and says an app ignores its own files with a `.gitignore` in their folder, which sync does not manage, rather than extending the root one.

14. **The template pins neither Node nor pnpm.**
    - Where: `packages/create/templates/app/package.json` has no `engines`, `devEngines`, `packageManager` or `.node-version`. The root repo pins all of them.
    - Vite+ then falls back to the latest LTS and the latest pnpm on each machine and in CI.
    - Severity: fix before release. Confidence: absence confirmed; I could not confirm whether `vp create` writes a pin.
    - Done in Template: vp create reads its manifest, the app pins Node and pnpm, and the skills' front matter parses: the template pins as the root does, `.node-version` 26, `engines.node` `>=26.0.0` and `devEngines.packageManager` pnpm 12.18.0, held to the root's by `tests/create-manifest.test.ts`; `@basis/ui`'s manifest names `engines.node`. Vite+ 1.5.0 in system-first mode ignores every pin and runs the Node first on the `PATH`, so a pin alone leaves W2's bare `SyntaxError`; the template's `preinstall` refuses a Node older than 26 with an `ERROR` line that names `vp env on`. Reproduced here with Vite+'s own Node 18 first on the `PATH`: before, `prepare` died on `styleText`; after, the `ERROR` line; with `vp env on` in a throwaway `VP_HOME`, Vite+ read `.node-version` and the install passed. `devEngines.runtime` was tried and not taken: pnpm then installs with Node 26, and `vp run` still dies bare on Node 18.

15. **A person has no way in.**
    - There is no short getting-started, and the template has no `README.md`.
    - `packages/ui/README.md:12-107` opens with the by-hand setup. It never mentions the template, the image, the pipeline or Windows.
    - `sync`, `doctor` and `review` have no README section, so `vp run docs` cannot print one.
    - Also absent: browser support (Chrome/Edge 139 is only in the design's "Not yet verified"), a versioning policy, troubleshooting, an owner, and where a firm developer opens "a basis-ui pull request".
    - Severity: fix before release. Confidence: confirmed.
    - Browser support done in Head script: a browser without Temporal is told which Chrome or Edge the app needs: the README's "Browsers" says Chrome and Edge 144 or later, on Windows, and the design's "Not yet verified" says 144. The rest of the finding is in the docs commit below.
    - Done in READMEs: every sample compiles in an app, and a person starts at Getting started: `@basis/ui`'s README opens with "Getting started", what basis-ui is and nine numbered steps from installing Vite+ to `vp run verify`, each with what the developer sees, linking to the reference below; "On Windows", W1, W2, W4 and W6 in the order winbox met them, with PowerShell's and cmd's ways to set a variable for one command; "Versions, upgrades and help", the versioning before 1.0 and where a component or a fault goes; and sections for `vp run sync`, `doctor` and `review`, so `vp run docs` prints each. The template gains a `README.md` of the app's own. The app is made with `vp dlx @basis/create NAME`, the creator step 7.13 builds, so that step is written and not yet run; `vp --version`, `vp run doctor` and `vp dev`'s first lines were run and are as written. Troubleshooting is each task's `ERROR` line and `vp run doctor`, as the steps say; an owner is not named, as the repo is public.

16. **Three README samples contradict the checks or the exports.**
    - `packages/ui/README.md:1216` uses `toFixed`, which `packages/ui/src/preset/lint-bans.ts:66` bans.
    - Line 1042 says to render `<Toaster />`, which `BasisApp` already renders (`packages/ui/src/shell/basis-app.tsx:250`).
    - Line 1406 uses `layoutSchema`, which nothing exports; parallax exports `parseLayout`.
    - README samples are not compiled or linted.
    - Severity: polish. Confidence: confirmed.
    - Done in READMEs: every sample compiles in an app, and a person starts at Getting started: the three are true (`numberText` in place of `toFixed`; `BasisApp` renders the `Toaster`, so the sample raises a toast alone; `checkLayout` in place of `layoutSchema`). `tests/readme-samples.test.ts` type-checks all 62 fenced `ts` and `tsx` samples of both READMEs in `packages/consumer`, as the catalogue's examples are: a name a sample uses unimported that the packages export is imported for it, so its props are still checked; the app's own names are declared `any`; and a name that a module of the packages exports and the packages do not is refused, which is how it caught `layoutSchema` before the fix. It also found the form sample's `defaultValues: { face: null }`, which types `face` as `null` so no amount fits it: the sample now types its defaults by the schema's input, as the example does. Five samples that did not parse (several JSX roots, an object fragment) were made statements. Not checked: the lint, so a banned call such as `toFixed` in a sample would pass; the samples' fragments make the lint's own rules (unused expressions, hooks at the top level) fail on every one.

17. **App identity is never set.**
    - Where: `packages/create/templates/app/index.html:6` and `src/routes.ts:13` say "basis-ui app". `vp create` renames only `package.json`, and `AGENTS.md` does not mention either.
    - The shell never sets `document.title`, and the showcase still ships the placeholder.
    - Severity: polish. Confidence: confirmed.
    - Done in Template: its pages are Pages, the app is named in one list, and every app's page has an icon: the template's `AGENTS.md` gains "Naming the app", the three places a name goes (`package.json`, `index.html`'s `<title>`, `appName` in `src/routes.ts`); the showcase's title is "Workbench", its `appName`.
    - Done in Shell: the browser's tab names the page shown, then the app: `AppShell` keeps `document.title` to the route's `staticData` title and its `appName`, "Positions · Workbench", or `appName` alone on a route with no title (`src/components/document-title.ts`, given to this lane by `t4` once the components' lane finished). `tests/document-title.test.tsx` follows a navigation from a titled route to an untitled one in a Node DOM, and failed without the hook; the gallery's `route-trail.test.tsx` checks it in Chromium. The template's "Naming the app" says `@basis/create` names the package and the page's `<title>` after the folder, and `appName` is the name people read.

18. **The template models patterns its own skill steers away from.**
    - Where: `packages/create/templates/app/src/sample/bond.tsx:32-41` hand-rolls a `<dl>` with colour classes. The pages use `TypographyH1`, where `build-a-page` says `Page` and `DescriptionList`.
    - Severity: polish. Confidence: confirmed.
    - Done in Template: its pages are Pages, the app is named in one list, and every app's page has an icon: the home, conventions and bond pages are each a `Page`, with its title and description, and the bond's terms a `DescriptionList`; the sample's tests and `checkRoutes` pass on them. The `build-a-page` skill gains a line on `optional` and `nullable` form fields (7.3) and one on `identifier: true` (7.5); neither the template's nor the example's tables hold an identifier, and the showcase's import page's CUSIP column takes it.

19. **The repo's own map is stale.**
    - `AGENTS.md` omits `packages/create`, `packages/showcase` and `packages/showcase-data`.
    - `README.md:8-10` still says "first components" and "phase 1 fills in the rest".
    - `packages/ui/CONTRIBUTING.md:75` cites `@jacobragsdale/ui`.
    - Severity: polish. Confidence: confirmed.
    - Done in Template: its pages are Pages, the app is named in one list, and every app's page has an icon: `AGENTS.md` names the three packages, the root `README.md` drops "first components" and the phase, and names the showcase and Getting started, and `CONTRIBUTING.md` no longer cites another package.

Also done there, from the plan: every app's `index.html` (the template, the example, the consumer, the gallery, parallax's demo and the showcase) names an inline SVG icon, so no browser asks for `/favicon.ico`; and the published `@basis/ui` carries culori's licence, in `licenses/culori/LICENSE`, beside the code its build bundles from it. The build's `deps.onlyBundle` names culori, so it fails on any other package bundled into `dist/` (checked by emptying the list: `RolldownError: culori is located in node_modules but is not included in deps.onlyBundle option`), and `tests/licences.test.ts` holds each package it names to a licence in `licenses/`, as the installed package holds it. The packed tarball lists `package/licenses/culori/LICENSE`.

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

## Changelog

- `vp create @basis:app` reads `@basis/create`'s manifest: its template entry names `template`, as Vite+ 1.5.0 reads
  it, where it named `path`. What to do: nothing.

- The template pins Node and pnpm as basis-ui's repo does: `.node-version` 26, `engines.node` `>=26.0.0`, and
  `devEngines.packageManager` pnpm 12.18.0. Its `preinstall` refuses an older Node with an `ERROR` line that names
  `vp env on`, since Vite+ in system-first mode runs whichever Node is on the `PATH`. `@basis/ui` names
  `engines.node`. What to do: an app made from an earlier template adds the same `.node-version`, `engines`,
  `devEngines` and `preinstall` to its own files.

- The skills' `description` lines are quoted, so a strict YAML parser reads their front matter. What to do: run
  `vp run sync`.

- `vp run sync` no longer manages the `Dockerfile`, `Caddyfile`, `.dockerignore` and `azure-pipelines.yml`: the app
  owns them, may edit or replace them, and writes its own pipeline. The next `vp run sync` removes basis-ui's header
  from each that still has it, and `vp run verify` names one that does until then. The template keeps the Dockerfile,
  Caddyfile and `.dockerignore` as a starting point, and has no pipeline. What to do: run `vp run sync`, commit the
  files it hands over, and delete `azure-pipelines.yml` if the app has no use for it.

- The framework's `.gitignore` names `.playwright-cli/`, `.vitest/`, `__screenshots__/`, and what an editor leaves:
  `.idea/`, `.vscode/`, `*.swp`, `.DS_Store` and `Thumbs.db`. What to do: run `vp run sync`.

- In a browser without `Temporal`, such as Chrome or Edge before 144, the page shows a line that names the browser it
  needs and the one it found, in place of an empty page: the head script checks before the app's modules load. The
  README's "Browsers" states the floor, Chrome and Edge 144 or later. What to do: nothing; `vp dev` and `vp build`
  write the new head script.

- A UI repo is made with `vp dlx @basis/create NAME`, `@basis/create`'s own creator, which copies the template into
  the folder NAME, names the package and the page after it, and runs `git init`. `vp create @basis:app` no longer
  offers the template: Vite+ 1.5.0 rewrites every app it makes into a configuration the drift check refuses. What to
  do: nothing for an app that exists.

- The READMEs' samples compile in an app, and a test holds them to it. Three were untrue: the saved-views sample
  parses a layout with `checkLayout` from `@basis/parallax`, as `layoutSchema` is not exported; `BasisApp` renders the
  `Toaster`, so an app raises a toast without rendering one; and a cell's filter text is written with `numberText`,
  since the lint refuses `toFixed`. The form sample types its `defaultValues` by the schema's input, as
  `z.input<typeof settlementForm>`. What to do: an app that copied the old saved-views or form sample makes the same
  change; one that renders a second `<Toaster />` inside `BasisApp` removes it.

- The template's pages are each a `Page`, and its bond's terms a `DescriptionList`, as the `build-a-page` skill says;
  its `AGENTS.md` says where the app's name goes, and every app's `index.html` names an icon. The `build-a-page`
  skill says how a form field declares itself optional or nullable, and that an identifier column takes
  `identifier: true`. What to do: run `vp run sync`; an app made from an earlier template may give its pages the same
  shape, and its `index.html` an icon of its own.

- `@basis/ui`'s package carries culori's licence, in `licenses/culori/LICENSE`, beside the code its build bundles from
  it. What to do: nothing.

- `AppShell` titles the browser's tab by the page shown and the app: the route's `staticData` title, then `appName`,
  as "Positions · Workbench", or `appName` alone on a route with no title. What to do: give `appName` the name people
  read, and remove any code of the app's own that sets `document.title`.
