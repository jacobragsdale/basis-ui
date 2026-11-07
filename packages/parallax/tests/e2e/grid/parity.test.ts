/* The React grid's canvas against the Angular demo's screenshots: drawn in parallax's standard and airy looks, at the
 * Angular canvas's size, over the same data and layout, after the same clicks, the book and the grouped blotter match
 * their Angular screenshots' canvases pixel for pixel. The toolbars, menus and status bars around them are React's,
 * on @basis/ui, so only the canvas is compared. Runs only in the pinned Playwright image, the Angular screenshots'
 * own. The screenshots are kept in `angular/` since roadmap step 2.7 deleted the Angular layer. */

import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { blotterRows, bookRows, openMenu } from "./helpers.ts";

test.skip(
  process.env["PARALLAX_PINNED_IMAGE"] !== "1",
  "The Angular screenshots are compared only in the pinned Playwright image: run tests/e2e/grid/in-image.sh.",
);

const screenshots = path.join(import.meta.dirname, "angular");

/** Where the canvas sits in an Angular screenshot of a small table's section, in CSS pixels: inside the grid's border,
 * under the section's title, the toolbar and the group panel, which the airy look makes taller. */
const standardCanvas = { height: 560, width: 680, x: 1, y: 107 };
const airyCanvas = { ...standardCanvas, y: 115 };

type Rect = typeof standardCanvas;

/** How many of the canvas's colour channels differ from the Angular screenshot's at `rect`, compared in the page. */
async function differing(section: Locator, file: string, rect: Rect): Promise<number> {
  const base64 = readFileSync(path.join(screenshots, file)).toString("base64");
  return section.locator("[role=grid] canvas").evaluate(
    async (canvas, { png, at }) => {
      const bytes = Uint8Array.from(atob(png), (character) => character.codePointAt(0) ?? 0);
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }), {
        colorSpaceConversion: "none",
        premultiplyAlpha: "none",
      });
      const crop = new OffscreenCanvas(at.width, at.height).getContext("2d");
      const drawn = canvas instanceof HTMLCanvasElement ? canvas.getContext("2d") : null;
      crop?.drawImage(bitmap, -at.x, -at.y);
      const angular = crop?.getImageData(0, 0, at.width, at.height).data ?? [];
      const react = drawn?.getImageData(0, 0, at.width, at.height).data ?? [];
      const comparable = angular.length > 0 && react.length === angular.length;
      // Every channel but alpha, which an opaque canvas and a screenshot both hold at its full value.
      const changed = angular.filter((value, index) => index % 4 !== 3 && value !== react[index]);
      return comparable ? changed.length : Number.POSITIVE_INFINITY;
    },
    { at: rect, png: base64 },
  );
}

/** Opens the small tables' page, waits for both grids' rows, and moves the pointer away, as the Angular screenshots
 * did. */
async function small(page: Page, query: string): Promise<void> {
  await page.goto(`/?preset=small&${query}`);
  await expect(page.locator('section[data-table="book"]').getByRole("grid")).toHaveAttribute(
    "aria-rowcount",
    String(bookRows),
    { timeout: 60_000 },
  );
  await expect(page.locator('section[data-table="blotter"]').getByRole("grid")).toHaveAttribute(
    "aria-rowcount",
    String(blotterRows),
    { timeout: 60_000 },
  );
  await page.mouse.move(0, 0);
}

for (const theme of ["light", "dark"] as const) {
  test(`the book's canvas is the Angular grid's, in the standard and airy looks, ${theme} scheme`, async ({
    page,
  }) => {
    const book = page.locator('section[data-table="book"]');
    await small(page, `theme=${theme}`);
    await expect
      .poll(async () => differing(book, `grid-book-${theme}.png`, standardCanvas))
      .toBe(0);
    await small(page, `theme=${theme}&look=airy`);
    await expect
      .poll(async () => differing(book, `grid-book-airy-${theme}.png`, airyCanvas))
      .toBe(0);
  });

  test(`the grouped blotter's canvas is the Angular grid's, ${theme} scheme`, async ({ page }) => {
    const blotter = page.locator('section[data-table="blotter"]');
    await small(page, `theme=${theme}`);
    // The fund's menu groups by it, from the fund's cell in the first row, which stays selected.
    const menu = await openMenu(page, blotter, 3);
    await menu.getByRole("menuitem", { name: "Group by this column" }).click();
    await expect(blotter.getByRole("grid")).toHaveAttribute("aria-rowcount", "508");
    await page.mouse.move(0, 0);
    await expect
      .poll(async () => differing(blotter, `grid-detail-groups-${theme}.png`, standardCanvas))
      .toBe(0);
  });
}
