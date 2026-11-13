/* A cut cell's tooltip, the only way to read its number, as the grid scrolls under it: it goes, rather than staying
 * beside another row's cell with the number of the one it was about. */

import "@basis/ui/styles.css";

import { expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { countedBytes } from "./data.ts";
import { canvasOf, renderGrid } from "./grid-helpers.tsx";

/** Rows of numbers far wider than their column, so each is drawn cut, as `###`. */
const wide = (): ArrayBuffer => countedBytes(500);

test("a cut cell's tooltip goes once the grid scrolls under it", async () => {
  const { grid, screen } = await renderGrid(
    { layout: { column_widths: { value: 24 } }, source: wide },
    "500",
  );
  // Playwright scrolls what it hovers into view first, which is itself a scroll: the second hover is the pointer's
  // alone.
  const cell = { position: { x: 12, y: 42 + 24 * 3 } };
  await userEvent.hover(canvasOf(grid), cell);
  await userEvent.hover(canvasOf(grid), { position: { x: 14, y: 42 + 24 * 3 } });
  await expect.element(screen.getByRole("tooltip")).toBeVisible();
  const tooltip = screen.getByRole("tooltip").element();
  grid.element().scrollTop += 24 * 3;
  // Hidden, it leaves the accessibility tree, so it is read from the element.
  await expect.poll(() => tooltip instanceof HTMLElement && tooltip.hidden).toBe(true);
});
