/* Records the Angular pivot's canvas against the Angular demo, which `capture.sh` serves from web/ on port 8791, in
 * the pinned Playwright image, at the viewport and with the flags of the Angular layer's own end-to-end specs. */

import { defineConfig, devices } from "@playwright/test";

const viewport = { height: 900, width: 1400 };

// oxlint-disable-next-line import/no-default-export -- Playwright reads its configuration from the file's default export.
export default defineConfig({
  outputDir: "../../../../test-results/pivot-angular-capture",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport } }],
  reporter: [["list"]],
  testDir: ".",
  testMatch: "capture.ts",
  timeout: 300_000,
  use: {
    baseURL: "http://127.0.0.1:8791",
    launchOptions: {
      args: ["--disable-gpu", "--disable-gpu-compositing", "--disable-software-rasterizer"],
    },
    viewport,
  },
  workers: 1,
});
