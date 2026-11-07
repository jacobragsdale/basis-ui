/* What the overlays and menus tests do again and again: check where focus is, click outside an overlay, compute a
 * colour, and switch the density or the mode. */

import { expect } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import type { Locator } from "vite-plus/test/browser";

/** Waits until focus is inside what `locator` finds. */
async function focusIsIn(locator: Locator): Promise<void> {
  await expect.poll(() => locator.element().contains(document.activeElement)).toBe(true);
}

/** Waits until focus is on what `locator` finds. */
async function focusReturnsTo(locator: Locator): Promise<void> {
  await expect.poll(() => document.activeElement).toBe(locator.element());
}

/** Clicks near the top left corner of the overlay's viewport, outside its popup. `slot` is the viewport's
 * `data-slot`. */
async function clickOutside(slot: string): Promise<void> {
  const viewport = document.querySelector(`[data-slot="${slot}"]`);
  if (viewport === null) {
    throw new Error(`No element has data-slot="${slot}"; is the overlay open?`);
  }
  await userEvent.click(viewport, { position: { x: 2, y: 2 } });
}

/** A colour as the browser computes it, so it compares with a computed style. */
function computedColour(value: string): string {
  const probe = document.createElement("div");
  probe.style.color = value;
  document.body.append(probe);
  const { color } = getComputedStyle(probe);
  probe.remove();
  return color;
}

/** Runs `check` with the page in the compact density, then puts the comfortable density back. */
async function inCompactDensity(check: () => Promise<void>): Promise<void> {
  document.documentElement.dataset["density"] = "compact";
  try {
    await check();
  } finally {
    delete document.documentElement.dataset["density"];
  }
}

/** Runs `check` with the page in `mode`, then puts the light mode back. */
async function inMode(mode: "light" | "dark", check: () => Promise<void>): Promise<void> {
  document.documentElement.classList.toggle("dark", mode === "dark");
  try {
    await check();
  } finally {
    document.documentElement.classList.remove("dark");
  }
}

export { clickOutside, computedColour, focusIsIn, focusReturnsTo, inCompactDensity, inMode };
