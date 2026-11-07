import { defineConfig, devices } from "@playwright/test";

import server from "./demo-server.json" with { type: "json" };

/**
 * End-to-end tests run against the built demo, served as static files with the
 * datasets `pnpm build:data` generates. Chromium runs with the GPU disabled, as on
 * the Citrix desktops parallax targets. `in-image.sh` starts the same server from
 * the same file and runs these tests in the pinned Playwright image.
 */
export default defineConfig({
  testDir: ".",
  outputDir: "../test-results",
  // Screenshots are compared only in the pinned Playwright image, so they need no platform suffix.
  snapshotPathTemplate: "{testDir}/screenshots/{testFileName}/{projectName}/{arg}{ext}",
  timeout: 300_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: server.url, viewport: { width: 1400, height: 900 }, launchOptions: { args: ["--disable-gpu", "--disable-gpu-compositing", "--disable-software-rasterizer"] } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } } }],
  webServer: { command: server.command, cwd: "..", url: server.url, reuseExistingServer: true, timeout: 30_000 }
});
