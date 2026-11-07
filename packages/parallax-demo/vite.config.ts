// The demo is built the way an app is: the preset's checks and tasks, its plugins, and its browser tests.
import { basisPlugins, basisPreset, basisTest } from "@basis/ui/preset";
import { defineConfig } from "vite-plus";

const preset = basisPreset();
const browserTests = await basisTest();

/** The headers that make the page cross-origin isolated, so the performance overlay can measure the whole tab, the
 * engine's worker included. A static file server without them serves the demo too, and the overlay says it measured
 * the page's JavaScript heap alone. */
const isolated = {
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
};

export default defineConfig({
  ...preset,
  // Relative URLs, so the built demo serves from any folder of any static file server.
  base: "./",
  plugins: basisPlugins(),
  preview: { headers: isolated },
  run: {
    tasks: {
      ...preset.run?.tasks,
      // The demo runs @basis/parallax's build, as an app runs the published package.
      build: { command: "vp build", dependsOn: ["@basis/parallax#build"] },
      // The datasets, written into public/data with parallax-datagen, which needs the Rust toolchain.
      data: { cache: false, command: "bash scripts/data.sh" },
      /* The end-to-end specs and screenshots, in the pinned Playwright image, against the demo built and served from
       * this machine. Arguments go to Playwright, such as spec names or --update-snapshots. Never cached, so it sees
       * the whole environment, such as PARALLAX_PREBUILT and CARGO_TARGET_DIR. */
      e2e: {
        cache: false,
        command: "bash tests/e2e/in-image.sh",
        dependsOn: ["@basis/parallax#build"],
      },
      test: { command: "vp test", dependsOn: ["@basis/parallax#build"] },
    },
  },
  server: { headers: isolated },
  test: {
    ...browserTests,
    // A desktop's window, where the sidebar sits beside the page; below `md` it is a sheet.
    browser: { ...browserTests.browser, viewport: { height: 900, width: 1400 } },
    include: ["src/**/*.test.{ts,tsx}"],
  },
  worker: { format: "es" },
});
