# basis-ui

basis-ui is the TypeScript sibling of [basis](https://github.com/jacobragsdale/basis): the packages a firm's React UIs
are built on, `@basis/ui` and `@basis/parallax`, for a codebase that agents write and checks review. Its toolchain is
Vite+ at its strictest settings, and its apps call basis APIs through the contract on basis's design page. The name is a
placeholder.

The workspace exists and `@basis/ui` is an empty package; the roadmap's phase 1 fills it. The design and the build
order:

- [The basis-ui design](docs/design.md): the toolchain, the stack, how agents see a UI, parallax in the browser, and
  why.
- [Roadmap](docs/roadmap.md): the phases, the steps in each, and which run at the same time.

[parallax](https://github.com/jacobragsdale/parallax) moves into this repo in the roadmap's phase 2.

## License

MIT. Parallax keeps its Apache-2.0 license when it moves in.
