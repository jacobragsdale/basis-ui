/* The gallery's screenshots and axe check, against its build, served as static files. `in-image.sh` serves the gallery
 * from this machine and runs the specs in the pinned Playwright image, where the screenshots are made and compared.
 * Chromium runs with the GPU disabled, as on the Citrix desktops the firm's apps run on. */

import { defineConfig, devices } from "@playwright/test";

import server from "./server.json" with { type: "json" };

/** A desktop's window, as basisTest's is, a little taller, so a sheet or a dialog fits it whole. */
const viewport = { height: 800, width: 1280 };

// oxlint-disable-next-line import/no-default-export -- Playwright reads its configuration from the file's default export.
export default defineConfig({
  // Each test is one page in one mode and density, so they run side by side; the drawing does not depend on it.
  fullyParallel: true,
  outputDir: "../../test-results/shots",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport } }],
  reporter: [["list"]],
  // Screenshots are compared only in the pinned Playwright image, so they need no platform suffix. A section's name is
  // its file's, so a failure names the component.
  snapshotPathTemplate: "{testDir}/screenshots/{arg}{ext}",
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
  workers: 4,
});
