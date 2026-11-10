// The gallery is built the way an app is: the preset's checks and tasks, its plugins, and its browser tests.
import { basisPlugins, basisPreset, basisTest } from "@basis/ui/preset";
import { defineConfig } from "vite-plus";

const preset = basisPreset();
const browserTests = await basisTest();

/* Without a browser (`BASIS_TEST_DOM=node`), only the render matrix runs: it is written with @basis/ui/testing, while
 * every other gallery test measures layout, focus or colour in Chromium. */
const inNode = browserTests.browser === undefined;

export default defineConfig({
  ...preset,
  plugins: basisPlugins(),
  run: {
    tasks: {
      ...preset.run?.tasks,
      /* Every section's screenshot and axe check, in the pinned Playwright image, against the gallery built and served
       * from this machine, on @basis/ui's build. `--update` records the screenshots again. Never cached, so it sees
       * the whole environment, such as CI. */
      shots: {
        cache: false,
        command: "bash tests/shots/in-image.sh",
        dependsOn: ["@basis/ui#build"],
      },
      // The render matrix in a Node DOM, as on a machine with no browser.
      "test-node": { command: "BASIS_TEST_DOM=node vp test" },
    },
  },
  // Its measurements are the comfortable density's, which each test starts in; apps open compact.
  test: {
    ...browserTests,
    include: inNode ? ["src/render-matrix.test.tsx"] : ["src/**/*.test.{ts,tsx}"],
    // Whether the tests run in CI, whose shared runners the main thread's budgets were not measured on.
    provide: { ci: process.env["CI"] === "true" },
    setupFiles: ["src/comfortable.setup.ts"],
  },
});
