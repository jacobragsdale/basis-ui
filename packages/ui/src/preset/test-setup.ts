/* The setup file `basisTest()` runs before each test file, which leaves `checkRoutes` a loader of the fixture-mode
 * plugin's test fixtures module (src/testing/fixtures-setup.ts): beside this module, as the client tasks' script is,
 * TypeScript in basis-ui's own workspace and JavaScript once built. */

import { fileURLToPath } from "node:url";

const fixturesSetup = fileURLToPath(
  new URL(
    import.meta.url.endsWith(".ts")
      ? "../testing/fixtures-setup.ts"
      : "../testing/fixtures-setup.mjs",
    import.meta.url,
  ),
);

export { fixturesSetup };
