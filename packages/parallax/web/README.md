# parallax web

The Angular workspace: the `parallax` library in `projects/parallax` and the
demo app in `projects/demo`. It uses pnpm.

| Script                              | What it does                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm generate`                     | Regenerates the protobuf code from `../crates/parallax-protocol/proto`         |
| `pnpm build:wasm`                   | Builds the engine for the browser and its worker into `projects/parallax/wasm` |
| `pnpm build:data`                   | Generates the demo's datasets into `projects/demo/public/data`                 |
| `pnpm build`                        | Builds the library and the demo                                                |
| `pnpm build:demo`                   | Builds the demo into `dist/demo`                                               |
| `pnpm serve:demo`                   | Serves `dist/demo/browser` as static files on `127.0.0.1:8791`                 |
| `pnpm test`                         | Runs the unit tests                                                            |
| `pnpm lint` and `pnpm format:check` | Check the code                                                                 |
| `pnpm e2e`                          | Runs the Playwright tests against the built demo                               |
| `pnpm performance`                  | Measures scrolling with the GPU off and the CPU throttled                      |

The end-to-end tests serve `dist/demo/browser` with `projects/demo/serve.mjs`, as
`e2e/demo-server.json` says, so build the engine, the data and the demo first.
