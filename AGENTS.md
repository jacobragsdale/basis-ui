# Agent guide

This repo is basis-ui (a placeholder name): the TypeScript packages a firm's React UIs are built on, `@basis/ui` and
`@basis/parallax`. It is the sibling of [basis](https://github.com/jacobragsdale/basis), whose APIs its apps call
through [the contract on basis's design
page](https://github.com/jacobragsdale/basis/blob/main/docs/design.md#what-a-ui-can-rely-on).
[docs/design.md](docs/design.md) holds the decisions and their reasons, and [docs/roadmap.md](docs/roadmap.md) the
phases, their steps, and the lanes that run at the same time. Code arrives in the roadmap's phase 1; until then the repo
is its docs.

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

None yet. Roadmap step 1.1 adds the workspace, its checks and CI.
