/* The setup file `basisTest()` runs before each test file. It leaves `checkRoutes` a loader of the app's fixtures,
 * which the fixture-mode plugin (src/preset/fixture-mode.ts) makes as a module only Vite can resolve, so it is imported
 * from here, a file Vite always transforms, and only when a test checks its routes. */

import { fixturesKey } from "./fixtures-key.ts";

Reflect.set(
  globalThis,
  fixturesKey,
  async (): Promise<unknown> => import("virtual:basis/test-fixtures"),
);
