# Building the showcase

Where the tools an app's agent has, the commands, `vp run docs`, the skills and the checks' `ERROR` lines, fell short
while the showcase was built (PLAN.md, step 6.9). Each is fixed in `@basis/ui` or `@basis/parallax`, with its commit,
or open, with its reason. The maintainer decided on 2026-11-11 that the goal is working, verified software, so the
library's source was read where that was quicker than the tools; each place it had to be is a finding below.

## Fixed

| Found                                                                                                                                                                            | Fix                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| The generated client's Arrow call answers with a `Blob`, which has arrived whole, and an app may not call `fetch`: no app could show a large table's first rows before its last. | `8d48a34`: `arrowResponse(url)` in `@basis/ui`, which `useDataset` streams.                                               |
| A fixture held a body as JSON or base64 only: 300 MB of Arrow cannot be either.                                                                                                  | `66783cb`: `body_file`, a file beside the fixture, streamed by fixture mode. An additive change to basis's record format. |
| Fixture mode ran only in `vp dev`: an app with no backend had no build to serve, and step 6.10 opens a static build.                                                             | `fe0f3a0`: `vp build --mode fixtures`, which never builds in `.fixtures/`.                                                |
| An app's `.gitignore` is a framework file, held byte for byte, so the large body files a task writes could not be kept out of git.                                               | `82ad3c3`: the framework's `.gitignore` names `fixtures/generated/`.                                                      |
| A grid that fills a page logged "ResizeObserver loop completed with undelivered notifications" as it loaded, and `checkRoutes` failed every grid page on it.                     | `b93f7d1`: the grid handles a resize in the next frame.                                                                   |

## Open

| Found                                                                                                                                                                                                  | Why it is open                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An app has no place for a Node script of its own: `scripts/` is linted as browser code (`import/no-nodejs-modules`, `basis/no-magic-numbers`), and `vite.config.ts` may hold no task of the app's own. | Loosening the app's lint for `scripts/**` changes the design's "toolchain, at its strictest", the maintainer's to decide. The showcase's generator lives in `packages/showcase-data`, which stands in for the API the showcase imagines, so it is not app code. |
| `vp create @basis:app` reads the template from the registry, which waits for roadmap step 1.8.                                                                                                         | Step 1.8, at the firm. The showcase is `templates/app` copied as `vp create` copies it, `_gitignore` renamed, as `vp run @basis/create#prove` does, with its dependencies on the workspace's packages.                                                          |
| An Arrow response's schema in the API's document is `string`, `binary`: nothing says what columns a dataset has, so the rows' types in `src/data/rows.ts` are written by hand.                         | basis's contract: its document could name a dataset's columns and types, from which the client would generate the row type that types `useDataset`'s layouts.                                                                                                   |
| Fixture mode does not match a request's body, so one fixture answers every `POST /trades`: the booking page always gets the desk's 422, and a booked trade cannot be shown.                            | A decision of fixture mode's (README, "Running the app in fixture mode"). The 422 placed on the fields is the step's point, so the page shows it.                                                                                                               |

## To fix next

Each of these is a defect in a package, to be fixed there in a commit of its own.

| Found                                                                                                                                                                                                                                          | Where                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `vp run docs DisplayFormat` prints `= z.output<typeof displayFormatSchema>`, and `displayFormatSchema`'s declaration is cut at 120 characters, so the kinds a display format takes cannot be read; the same for `LayoutCell` and `LayoutRule`. | `@basis/ui`'s catalogue                                   |
| `vp run docs LayoutInput` lists no `cells` and no `rules`, the fields 6.6.1 added.                                                                                                                                                             | `@basis/ui`'s catalogue, `@basis/parallax`'s types        |
| The show-data skill's example reads the generated `Blob` whole, and sorts with `{ column, desc: true }`, which the layout calls `descending`.                                                                                                  | `@basis/ui`'s skills                                      |
| A display format's 32nds step is `"quarter"`, and `Price32`'s `precision` for the same step is `"quarters"`.                                                                                                                                   | `@basis/ui`                                               |
| A pivot's measure headers and its settings' field list show raw names, `sum(market_value_usd)`, where the grid shows readable ones.                                                                                                            | `@basis/parallax`                                         |
| A typed grid's `onLayoutChange` gives an untyped `Layout`, so a page that keeps the layout's sorts or groups in a typed layout must parse its column names again (the blotter's `columnSchema`).                                               | `@basis/parallax`                                         |
| The performance overlay is in parallax's demo, not in a package, so an app cannot offer it as a tool.                                                                                                                                          | `@basis/parallax`                                         |
| `SecurityPicker` has no form field, as the other inputs have, so the booking page wires its label and errors by hand.                                                                                                                          | `@basis/ui`                                               |
| The React Compiler cannot compile a BigInt literal in a component, and parallax's frames carry `bigint` versions; only the build says so.                                                                                                      | Noted; the probe keeps the literal outside its component. |

## Decisions

- The showcase's API has no repo, so `openapi.json` is written for it, and `vp run client-pull` with no arguments
  generates the client from it, as from a pulled document.
- The pages that show parallax sit under a pathless layout route that starts the engine, so moving between them keeps
  a dataset another page loaded, and the booking and import pages never load parallax. The probe has a layout of its
  own, so it comes last in the sidebar and times a load on an engine of its own.
- The trades' and positions' rows are generated at 1,000,000 each, the bonds at 600, as parallax's demo does, with the
  same seed. The overview's figures are summed from the positions, so they agree with the pivot.
