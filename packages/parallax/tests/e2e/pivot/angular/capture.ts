/* Records the Angular pivot's canvas, of which the Angular layer has no screenshot, for parity.test.ts to compare the
 * React pivot's with: the Angular demo's reference pivot of the 150,000 positions, in the standard look, as the demo
 * first draws it, light and dark. Each file is the canvas's own pixels, as `toDataURL` gives them, so no compositing
 * comes between. Run it with `bash tests/e2e/pivot/angular/capture.sh`, from packages/parallax, which serves the built
 * Angular demo and runs this in the pinned Playwright image. It goes with web/ in roadmap step 2.7. */

import { writeFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

const firstRowsMs = 60_000;
/** How long the canvas must stay the same before it counts as drawn. */
const settleMs = 1000;

/** The canvas's pixels as a PNG data URL. */
async function pixels(canvas: Locator): Promise<string> {
  return canvas.evaluate((element) =>
    element instanceof HTMLCanvasElement ? element.toDataURL("image/png") : "",
  );
}

for (const theme of ["light", "dark"] as const) {
  test(`records the Angular pivot's canvas, ${theme} scheme`, async ({ page }) => {
    await page.goto(`/?preset=pivot&theme=${theme}&look=standard`);
    const grid = page.locator("px-pivot [role=grid]").first();
    await expect(grid).toHaveAttribute("aria-rowcount", /^[1-9]\d*$/u, { timeout: firstRowsMs });
    await page.mouse.move(0, 0);
    const canvas = page.locator("px-pivot .px-pivot-main > px-grid canvas.px-canvas");
    // Drawn once two reads a second apart agree.
    let drawn = "";
    await expect
      .poll(
        async () => {
          const before = drawn;
          await page.waitForTimeout(settleMs);
          drawn = await pixels(canvas);
          return drawn === before;
        },
        { timeout: firstRowsMs },
      )
      .toBe(true);
    const [, base64 = ""] = drawn.split(",");
    writeFileSync(
      path.join(import.meta.dirname, `pivot-${theme}.png`),
      Buffer.from(base64, "base64"),
    );
  });
}
