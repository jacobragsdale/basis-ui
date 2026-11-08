# Agent guide

This repo is basis-ui (a placeholder name): the TypeScript packages a firm's React UIs are built on, `@basis/ui` and
`@basis/parallax`. It is the sibling of [basis](https://github.com/jacobragsdale/basis), whose APIs its apps call
through [the contract on basis's design
page](https://github.com/jacobragsdale/basis/blob/main/docs/design.md#what-a-ui-can-rely-on).
[docs/design.md](docs/design.md) holds the decisions and their reasons, and [docs/roadmap.md](docs/roadmap.md) the
phases, their steps, and the lanes that run at the same time. The code is a pnpm workspace run by Vite+'s `vp`, with
`@basis/ui` in `packages/ui`, its gallery in `packages/gallery`, an example app on the app shell and a generated client
in `packages/example`, an app configured by hand with exactly the README's lines, as ctzd writes its apps, in
`packages/consumer`, parallax, moved in with its history, in `packages/parallax`: its Rust crates and the
`@basis/parallax` package, and parallax's demo, a React app on both packages, in `packages/parallax-demo`.
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
builds `@basis/ui`, then runs `vp staged` and `vp check`; it runs no tests while the MVP takes shape, so run the
fast unit tests yourself. CI runs `vp check` on every change, and each
package's tests and build when its paths change.

`@basis/parallax`'s TypeScript is checked by the root checks, as `@basis/ui`'s is. Its build and tests first build the
engine for the browser, which needs the Rust toolchain and the `wasm-bindgen` command that its `CONTRIBUTING.md` names;
Vite+ replays that build from its cache until the Rust changes, and the first one in a fresh clone takes minutes. Its
charts' end-to-end specs and screenshots run with `vp run @basis/parallax#charts-e2e`, its grid's with
`vp run @basis/parallax#grid-e2e`, and its pivot's with `vp run @basis/parallax#pivot-e2e`, in Docker, as its
`CONTRIBUTING.md` says. The demo runs the package's build, as an app does: its datasets come from
`vp run @basis/parallax-demo#data`, and its end-to-end specs and screenshots from `vp run @basis/parallax-demo#e2e`.

Parallax's Rust keeps its own checks, and the root checks skip it. Its `CONTRIBUTING.md` has them; in short:

```sh
cd packages/parallax
cargo fmt --all --check && cargo clippy --workspace --all-targets --locked && cargo test --workspace --locked
cargo test -p parallax-wasm --target wasm32-unknown-unknown --locked
```

On this machine, build Rust with `CARGO_BUILD_JOBS=1`: parallel rustc jobs run out of memory.
