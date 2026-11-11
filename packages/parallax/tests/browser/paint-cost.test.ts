/* The cost of a pass: moving along the header repaints the header alone, and what it leaves is what painting the
 * whole grid draws, pixel for pixel. */

import "@basis/ui/styles.css";

import { expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { expectPaintedWhole, frames, showGrid } from "./scroll-copy-helpers.tsx";
import type { Shown } from "./scroll-copy-helpers.tsx";

/** Moves the pointer along the header, over each of `xs`, drawing after each move. */
async function alongHeader(shown: Shown, xs: readonly number[]): Promise<void> {
  const canvas = page.elementLocator(shown.canvas);
  const y = shown.metrics.headerPx / 2;
  for (const x of xs) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each move is drawn before the next.
    await userEvent.hover(canvas, { position: { x, y } });
    // oxlint-disable-next-line eslint/no-await-in-loop -- as above.
    await frames();
  }
}

test("moving along the header repaints the header alone, as painting the whole grid would draw it", async () => {
  const shown = await showGrid();
  const before = shown.stats();
  await alongHeader(shown, [60, 160, 260]);
  const after = shown.stats();
  const header = shown.canvas.width * shown.metrics.headerPx * globalThis.devicePixelRatio;
  expect(after.fullDraws - before.fullDraws).toBe(0);
  expect(after.paintedPx - before.paintedPx).toBeGreaterThan(0);
  expect(after.paintedPx - before.paintedPx).toBeLessThanOrEqual(3 * header);
  await expectPaintedWhole(shown);
});
