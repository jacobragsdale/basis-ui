/* What the demo's end-to-end specs share: opening a page in a mode and density, waiting for its grids and charts to
 * draw, painting it afresh before a screenshot, and collecting the page's errors. */

import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import server from "./server.json" with { type: "json" };

type Mode = "light" | "dark";
type Density = "comfortable" | "compact";

/** How long a page of the large tables may take to load them and draw. */
const drawnWithinMs = 120_000;

/** Opens a page of the demo, its mode and density stored first, as @basis/ui's cookie holds them for every app. */
async function open(
  page: Page,
  path: string,
  {
    mode = "light",
    density = "comfortable",
  }: { readonly mode?: Mode; readonly density?: Density } = {},
): Promise<void> {
  await page
    .context()
    .addCookies([{ name: "basis-ui-preferences", url: server.url, value: `${mode}.${density}` }]);
  await page.goto(`/#${path}`);
}

/** Runs `step` on each item in turn, each once the one before has finished. */
async function inTurn<TItem>(
  items: readonly TItem[],
  step: (item: TItem, index: number) => Promise<void>,
  index = 0,
): Promise<void> {
  const item = items[index];
  if (item === undefined) {
    return;
  }
  await step(item, index);
  await inTurn(items, step, index + 1);
}

/** Waits until every grid on the page holds rows, `rows` of them in order when given; with `some`, until the page
 * shows a grid at all. */
async function gridsDrawn(
  page: Page,
  rows: readonly number[] = [],
  { some = true }: { readonly some?: boolean } = {},
): Promise<void> {
  const grids = page.getByRole("grid");
  if (some) {
    await expect(grids.first()).toBeVisible({ timeout: drawnWithinMs });
  }
  const all = await grids.all();
  await Promise.all(
    all.map(async (grid, index) => {
      const expected = rows[index];
      const count = expected === undefined ? /^[1-9]\d*$/u : String(expected);
      await expect(grid).toHaveAttribute("aria-rowcount", count, { timeout: drawnWithinMs });
    }),
  );
  // A first load shows its rows as they arrive; its status bar says rows are to come until the last have.
  await expect(page.locator('[data-slot="grid-status-loading"]')).toHaveCount(0, {
    timeout: drawnWithinMs,
  });
}

/** Waits until `count` charts on the page have described what they draw, which they do once drawn, and every status
 * line says what its chart draws rather than that it is loading. */
async function chartsDrawn(page: Page, count: number): Promise<void> {
  const words = page.locator('[data-slot="chart"] > p.sr-only');
  await expect(words).toHaveCount(count, { timeout: drawnWithinMs });
  await expect(words.filter({ hasText: /\w/u })).toHaveCount(count, { timeout: drawnWithinMs });
  const summaries = page.locator('[data-slot="chart-summary"]');
  await expect(summaries.filter({ hasText: "loading" })).toHaveCount(0, { timeout: drawnWithinMs });
}

/** Two animation frames, for a paint to reach the screen. */
async function frames(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { promise, resolve } = Promise.withResolvers<number>();
    requestAnimationFrame(() => {
      requestAnimationFrame((time) => {
        resolve(time);
      });
    });
    return promise;
  });
}

/**
 * Paints the whole page again. A rounded corner painted while the page was still loading can come out a shade
 * different from one painted whole, so a screenshot taken straight away would depend on when the data arrived.
 */
async function paintAfresh(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.body.style.visibility = "hidden";
  });
  await frames(page);
  await page.evaluate(() => {
    document.body.style.visibility = "";
  });
  await frames(page);
}

/** Collects the page's uncaught errors, to check there were none. */
function errorsOf(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

/** The grid in `scope`'s status line's message, where it says what a copy or an export did. */
function noteOf(scope: Locator): Locator {
  return scope.locator('[data-slot="grid-status-message"]');
}

/** A figure of the performance overlay, by its key. */
function figure(page: Page, key: string): Locator {
  return page.getByRole("region", { name: "Performance" }).locator(`[data-figure="${key}"]`);
}

export { chartsDrawn, errorsOf, figure, frames, gridsDrawn, inTurn, noteOf, open, paintAfresh };
export type { Density, Mode };
