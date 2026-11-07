/* The React pivot's canvas against the Angular pivot's: drawn in parallax's standard look, at the Angular canvas's size,
 * over the same 150,000 positions and the same reference pivot, its tree, its column pivots and its values match the
 * canvas `angular/capture.ts` recorded from the Angular demo pixel for pixel. The settings, toolbar and status bar
 * around it are React's, on @basis/ui, so only the canvas is compared. Runs only in the pinned Playwright image, where
 * the Angular canvas was recorded. The comparison goes with web/ in roadmap step 2.7. */

import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { canvasOf, open } from "./helpers.ts";

test.skip(
  process.env["PARALLAX_PINNED_IMAGE"] !== "1",
  "The Angular canvas is compared only in the pinned Playwright image: run tests/e2e/pivot/in-image.sh.",
);

const angular = path.join(import.meta.dirname, "angular");

/** A size in CSS pixels. */
interface Size {
  readonly width: number;
  readonly height: number;
}

/** The size of a PNG, from its header. */
function sizeOf(png: Buffer): Size {
  const widthAt = 16;
  const heightAt = 20;
  return { height: png.readUInt32BE(heightAt), width: png.readUInt32BE(widthAt) };
}

/** The canvas's size on the page. */
async function canvasSize(page: Page): Promise<Size> {
  return canvasOf(page).evaluate((canvas) => ({
    height: canvas.clientHeight,
    width: canvas.clientWidth,
  }));
}

/** Grows or shrinks the page's main area until the pivot's canvas is `size`. */
async function sizeTo(page: Page, size: Size): Promise<void> {
  const now = await canvasSize(page);
  if (now.width === size.width && now.height === size.height) {
    return;
  }
  await page.locator("main").evaluate(
    (main, { width, height }) => {
      const box = main.getBoundingClientRect();
      main.style.width = `${String(box.width + width)}px`;
      main.style.height = `${String(box.height + height)}px`;
    },
    { height: size.height - now.height, width: size.width - now.width },
  );
  await expect.poll(async () => canvasSize(page)).toStrictEqual(size);
}

/** How many of the canvas's colour channels differ from the Angular canvas's, compared in the page. */
async function differing(page: Page, png: Buffer): Promise<number> {
  return canvasOf(page).evaluate(async (canvas, base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.codePointAt(0) ?? 0);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }), {
      colorSpaceConversion: "none",
      premultiplyAlpha: "none",
    });
    const recorded = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
    recorded?.drawImage(bitmap, 0, 0);
    const drawn = canvas instanceof HTMLCanvasElement ? canvas.getContext("2d") : null;
    const theirs = recorded?.getImageData(0, 0, bitmap.width, bitmap.height).data ?? [];
    const ours = drawn?.getImageData(0, 0, bitmap.width, bitmap.height).data ?? [];
    const comparable = theirs.length > 0 && ours.length === theirs.length;
    // Every channel but alpha, which an opaque canvas holds at its full value.
    const changed = theirs.filter((value, index) => index % 4 !== 3 && value !== ours[index]);
    return comparable ? changed.length : Number.POSITIVE_INFINITY;
  }, png.toString("base64"));
}

for (const theme of ["light", "dark"] as const) {
  test(`the pivot's canvas is the Angular pivot's, ${theme} scheme`, async ({ page }) => {
    const png = readFileSync(path.join(angular, `pivot-${theme}.png`));
    await open(page, `preset=pivot&theme=${theme}&look=standard`);
    await sizeTo(page, sizeOf(png));
    await page.mouse.move(0, 0);
    await expect.poll(async () => differing(page, png), { timeout: 30_000 }).toBe(0);
  });
}
