# Agent guide

This repo is basis-ui (a placeholder name): the TypeScript packages a firm's React UIs are built on, `@basis/ui` and
`@basis/parallax`. It is the sibling of [basis](https://github.com/jacobragsdale/basis), whose APIs its apps call
through [the contract on basis's design
page](https://github.com/jacobragsdale/basis/blob/main/docs/design.md#what-a-ui-can-rely-on).
[docs/design.md](docs/design.md) holds the decisions and their reasons, and [docs/roadmap.md](docs/roadmap.md) the
phases, their steps, and the lanes that run at the same time. The code is a pnpm workspace run by Vite+'s `vp`, with
`@basis/ui` in `packages/ui`, its gallery in `packages/gallery`, an example app on the app shell and a generated client
in `packages/example`, and parallax, moved in with its history, in `packages/parallax`: its Rust crates, its Angular
layer in `web/` until roadmap step 2.6 replaces it, and the `@basis/parallax` package.
[packages/ui/README.md](packages/ui/README.md) says how an app uses `@basis/ui` and how a component is added, and
[packages/parallax/README.md](packages/parallax/README.md) how it uses `@basis/parallax`.

## Working here

- Read `docs/design.md` before changing anything. A decision there changes only when the maintainer says so, and the
  page changes in the same commit.
- Work one roadmap step per branch and git worktree, named after the step's id, such as `1.3-app-shell`, and follow the
  roadmap's rules for working in parallel.
- Changes to `@basis/ui`'s preset land one pull request at a time.
- basis's contract is basis's to change. A UI that needs something new from an API asks for it there.
- A spike writes its result to `docs/spikes/NAME.md`: the versions it used, a yes or no for each question, and the
  fallback for each no.
- A step marked **(work)** needs the firm's environment. Hand it to the maintainer as the commands to run and what to
  send back.
- Write "the firm", never a firm's real name, and use placeholder names in examples. This repo is public.

## Checks

```sh
vp install              # once per clone: installs dependencies and the commit hook (.vite-hooks/pre-commit)
vp run @basis/ui#build  # first, and after every change to @basis/ui: the gallery checks and tests against its build
vp check                # formatting, linting and type checking, docs included
vp run -r test          # every package's tests; the gallery's and parallax's browser tests run in Chromium
vp run -r build         # every package's build
```

`vp` is Vite+'s command: install it with `curl -fsSL https://vite.plus | bash`. The gallery's browser tests need the
Chromium that the preset's Playwright pins: `vp exec --filter @basis/ui playwright install chromium`. The commit hook
builds `@basis/ui`, then runs `vp staged`, `vp check` and the tests. CI runs `vp check` on every change, and each
package's tests and build when its paths change.

`@basis/parallax`'s TypeScript is checked by the root checks, as `@basis/ui`'s is. Its build and tests first build the
engine for the browser, which needs the Rust toolchain and the `wasm-bindgen` command that its `CONTRIBUTING.md` names;
Vite+ replays that build from its cache until the Rust changes, and the first one in a fresh clone takes minutes.
Parallax's Rust and its Angular layer keep their own checks until roadmap step 2.6 replaces that layer, and the root
checks skip them. Its `CONTRIBUTING.md` has them; in short:

```sh
cd packages/parallax
cargo fmt --all --check && cargo clippy --workspace --all-targets --locked && cargo test --workspace --locked
cd web && pnpm install && pnpm build:wasm && pnpm lint && pnpm format:check && pnpm test
```

On this machine, build Rust with `CARGO_BUILD_JOBS=1`: parallel rustc jobs run out of memory.
