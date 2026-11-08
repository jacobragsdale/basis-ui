# basis-ui

basis-ui is the TypeScript sibling of [basis](https://github.com/jacobragsdale/basis): the packages a firm's React UIs
are built on, `@basis/ui` and `@basis/parallax`, for a codebase that agents write and checks review. Its toolchain is
Vite+ at its strictest settings, and its apps call basis APIs through the contract on basis's design page. The name is a
placeholder.

`@basis/ui` holds the theme, the Vite+ preset, the app shell and the first components, which
[its gallery](packages/gallery) shows, and [an example app](packages/example) calls an API through the shell and a
generated client, and runs with no API in `vp dev`'s fixture mode; the roadmap's phase 1 fills in the rest. A new UI
repo starts from [`@basis/create`'s template](packages/create), with the preset, `AppShell`, a sample API that fixture
mode answers until `vp run client-pull` copies the app's own, the agent files, the hooks, an Azure pipeline and a
Dockerfile whose image serves the build; `vp run sync` keeps the framework's files current, `vp run check-full` fails
when one is edited, and `vp run upgrade`, `doctor`, `review` and `docs` do the rest. The design and the build order:

- [The basis-ui design](docs/design.md): the toolchain, the stack, how agents see a UI, parallax in the browser, and
  why.
- [Roadmap](docs/roadmap.md): the phases, the steps in each, and which run at the same time.

[parallax](packages/parallax) moved into this repo with its history, from
[its own repo](https://github.com/jacobragsdale/parallax), at the start of the roadmap's phase 2. `@basis/parallax`, its
engine with its worker built in and its React grid, pivot and charts, sits beside its Rust, and
[its demo](packages/parallax-demo) shows them in a React app on `@basis/ui`.

## License

MIT. Parallax keeps its Apache-2.0 license when it moves in.
