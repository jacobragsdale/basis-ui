/* The React pivot's end-to-end specs, against the harness built and served as static files with the datasets
 * `data.sh` generates. Chromium runs with the GPU disabled, as on the Citrix desktops parallax targets. `in-image.sh`
 * serves the harness from this machine and runs these specs in the pinned Playwright image, where the screenshots are
 * made and compared. */

import { defineConfig } from "@playwright/test";

// oxlint-disable-next-line import/no-relative-parent-imports -- the grid, pivot and charts suites share their projects, which are no part of the package to import by name.
import { noGpu, projects } from "../scaled.ts";

import server from "./server.json" with { type: "json" };

const viewport = { height: 900, width: 1400 };

// oxlint-disable-next-line import/no-default-export -- Playwright reads its configuration from the file's default export.
export default defineConfig({
  outputDir: "../../../test-results/pivot-e2e",
  // Chromium at a ratio of 1, and at 1.25 and 1.5 for the specs that run at a scaled desktop's ratio.
  projects: projects(viewport, "{testDir}/screenshots/{testFileName}/{projectName}/{arg}{ext}"),
  reporter: [["list"]],
  // Screenshots are compared only in the pinned Playwright image, so they need no platform suffix.
  snapshotPathTemplate: "{testDir}/screenshots/{testFileName}/{projectName}/{arg}{ext}",
  testDir: ".",
  testMatch: "*.test.ts",
  timeout: 300_000,
  use: {
    baseURL: server.url,
    launchOptions: { args: noGpu },
    viewport,
  },
  webServer: {
    command: server.command,
    cwd: "../../..",
    reuseExistingServer: true,
    timeout: 30_000,
    url: server.url,
  },
  workers: 1,
});
