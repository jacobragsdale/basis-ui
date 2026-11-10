/* The module the fixture-mode plugin makes for `vp test` (src/preset/fixture-mode.ts), which fixtures-setup.ts loads. */

declare module "virtual:basis/test-fixtures" {
  import type { LoadedFixture } from "#fixtures/record.ts";

  /** The synthetic responses in `fixtures/`, in the order fixture mode tries them. */
  const fixtures: readonly LoadedFixture[];
  /** The values each fixture's path gives its operation's path parameters, by the fixture's file. */
  const parameters: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** One `ERROR` line for each thing wrong with them. */
  const problems: readonly string[];
  /** The app's generated MSW module, `src/api/generated/client.msw.ts`, or nothing for an app without one. */
  function generated(): Promise<Readonly<Record<string, unknown>>>;

  export { fixtures, generated, parameters, problems };
}
