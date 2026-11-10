/* `@basis/ui/fixtures`: fixture mode in the browser, and the fixture record format. `vp dev` starts it through the
 * preset with no code in the app; a test builds its handlers with `fixtureHandlers` and `loadFixtureFiles`. It is an
 * entry of its own so that MSW never reaches an app's build. */

export { fixtureHandlers, type FixtureHandlersOptions } from "./handlers.ts";
export { fixtureFolders, fixtureProblem, loadFixtureFiles, type LoadedFixtures } from "./load.ts";
export {
  fixtureFormat,
  fixtureRecordSchema,
  type FixtureRecord,
  type FixtureRequest,
  type FixtureResponse,
  type FixtureSource,
  type JsonValue,
  type LoadedFixture,
} from "./record.ts";
export { generatedHandlers } from "./generated.ts";
export { startFixtureMode, type FixtureModeOptions } from "./start.ts";
