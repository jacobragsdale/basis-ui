/* The React chart's end-to-end specs, against the built harness that `run.ts` serves. Chromium runs with the GPU off,
 * as on the Citrix desktops parallax draws for, in the Docker image of the pinned Playwright version, the Angular
 * layer's image, so that screenshots compare at threshold 0 and its canvases pixel for pixel. */

import { defineConfig } from "@playwright/test";

// oxlint-disable-next-line import/no-relative-parent-imports -- the grid, pivot and charts suites share their projects, which are no part of the package to import by name.
import { noGpu, projects } from "../scaled.ts";

const viewport = { height: 900, width: 1400 };

// oxlint-disable-next-line import/no-default-export -- Playwright loads its configuration from the file's default export.
export default defineConfig({
  outputDir: "../../../test-results/charts-e2e",
  // Chromium at a ratio of 1, and at 1.25 and 1.5 for the specs that run at a scaled desktop's ratio.
  projects: projects(viewport, "{testDir}/screenshots/{testFileName}/{projectName}/{arg}{ext}"),
  reporter: [["list"]],
  // Screenshots are compared only in the pinned image, so they need no platform suffix.
  snapshotPathTemplate: "{testDir}/screenshots/{testFileName}/{arg}{ext}",
  testDir: ".",
  testMatch: "*.test.ts",
  timeout: 300_000,
  use: {
    baseURL: "http://127.0.0.1:8792",
    launchOptions: { args: noGpu },
    viewport,
  },
  workers: 1,
});
