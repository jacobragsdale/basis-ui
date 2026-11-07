/* The demo's end-to-end specs, against its build, served as static files with the datasets `scripts/data.sh` writes.
 * Chromium runs with the GPU disabled, as on the Citrix desktops parallax targets. `in-image.sh` serves the demo from
 * this machine and runs these specs in the pinned Playwright image, where the screenshots are made and compared. */

import { defineConfig, devices } from "@playwright/test";

import server from "./server.json" with { type: "json" };

const viewport = { height: 900, width: 1400 };

// oxlint-disable-next-line import/no-default-export -- Playwright reads its configuration from the file's default export.
export default defineConfig({
  outputDir: "../../test-results/e2e",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport } }],
  reporter: [["list"]],
  // Screenshots are compared only in the pinned Playwright image, so they need no platform suffix.
  snapshotPathTemplate: "{testDir}/screenshots/{testFileName}/{projectName}/{arg}{ext}",
  testDir: ".",
  testMatch: "*.test.ts",
  timeout: 300_000,
  use: {
    baseURL: server.url,
    launchOptions: {
      args: ["--disable-gpu", "--disable-gpu-compositing", "--disable-software-rasterizer"],
    },
    viewport,
  },
  webServer: {
    command: server.command,
    cwd: "../..",
    reuseExistingServer: true,
    timeout: 30_000,
    url: server.url,
  },
  workers: 1,
});
