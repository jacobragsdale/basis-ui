/* The Playwright projects of an end-to-end suite: Chromium at a ratio of 1, and again at 1.25 and 1.5, the ratios of
 * a Windows desktop scaled to 125 % and 150 %, as the firm's Citrix desktops are, for the few specs whose titles say
 * they run at a scaled desktop's ratio. Those take screenshots in device pixels, so a rule drawn on half a device
 * pixel shows as a blur in them.
 *
 * Chromium starts at the ratio: emulating one, as Playwright's `deviceScaleFactor` does alone, changes
 * `devicePixelRatio` but not the device pixels a box covers, so the canvas's `devicePixelContentBoxSize` would still
 * report CSS pixels. The context's `deviceScaleFactor` is set to the same ratio, since the viewport Playwright sets
 * would otherwise emulate 1. */

import { devices } from "@playwright/test";
import type { Project } from "@playwright/test";

/** The specs that run at a scaled desktop's ratio, by their titles. */
const scaledTitle = /at a scaled desktop's ratio/u;

/** Chromium with the GPU off, as on the Citrix desktops parallax draws for. */
const noGpu = ["--disable-gpu", "--disable-gpu-compositing", "--disable-software-rasterizer"];

const windows125 = 1.25;
const windows150 = 1.5;

/** The suite's projects at `viewport`: `chromium` at a ratio of 1 without the scaled specs, and `chromium-1.25` and
 * `chromium-1.5` with only them, their screenshots kept by project as `snapshotPathTemplate` says. */
function projects(
  viewport: { readonly width: number; readonly height: number },
  snapshotPathTemplate: string,
): Project[] {
  const scaled = [windows125, windows150].map((ratio) => ({
    grep: scaledTitle,
    name: `chromium-${String(ratio)}`,
    snapshotPathTemplate,
    use: {
      ...devices["Desktop Chrome"],
      deviceScaleFactor: ratio,
      launchOptions: { args: [...noGpu, `--force-device-scale-factor=${String(ratio)}`] },
      viewport,
    },
  }));
  return [
    { grepInvert: scaledTitle, name: "chromium", use: { ...devices["Desktop Chrome"], viewport } },
    ...scaled,
  ];
}

export { noGpu, projects };
