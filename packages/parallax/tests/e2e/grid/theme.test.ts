/* The grid draws in its theme's tokens, reads them again when the page may have changed them, and redraws as little as
 * it can: ported from the Angular demo's grid.spec.ts. */

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { canvasOf, open, pixel, row, rowCount } from "./helpers.ts";

/** The header's corner, left of its first title. */
const corner = { x: 2, y: 2 };

/** Sets or removes a token on the element around the grid, as a host's wrapper would. */
async function wrapperToken(page: Page, value: string | null): Promise<void> {
  await page.locator("main").evaluate((main, token) => {
    if (main instanceof HTMLElement && token === null) {
      main.style.removeProperty("--px-header-background");
    } else if (main instanceof HTMLElement && token !== null) {
      main.style.setProperty("--px-header-background", token);
    }
  }, value);
}

/** Adds or removes a class on <body>, as a host's theme switch would. */
async function bodyClass(page: Page, name: string, on: boolean): Promise<void> {
  await page.evaluate(
    ([className, add]) => {
      document.body.classList.toggle(className, add);
    },
    [name, on] as const,
  );
}

test("the dark scheme sets its tokens", async ({ page }) => {
  await open(page, "preset=pivot&theme=dark");
  const grid = page.locator("[data-slot=grid]");
  await expect(grid).toHaveAttribute("data-px-scheme", "dark");
  await expect(grid).toHaveAttribute("data-px-theme", "standard");
  const background = await grid.evaluate((element) =>
    getComputedStyle(element).getPropertyValue("--_px-background").trim(),
  );
  expect(background).toBe("rgb(22, 24, 29)");
});

test("a token set on a wrapper or on :root reaches the canvas once the page's classes change", async ({
  page,
}) => {
  await open(page, "preset=trades");
  expect(await pixel(page, corner)).not.toBe("255,0,0");
  // The grid reads its tokens again without any prop changing.
  await wrapperToken(page, "#ff0000");
  await bodyClass(page, "branded", true);
  await expect.poll(async () => pixel(page, corner)).toBe("255,0,0");
  // On :root the token is overridden by the wrapper's, and wins once the wrapper's is gone.
  await page.addStyleTag({ content: ":root { --px-header-background: rgb(0, 0, 255); }" });
  await wrapperToken(page, null);
  await bodyClass(page, "branded", false);
  await expect.poll(async () => pixel(page, corner)).toBe("0,0,255");
});

test("a row height set on :root sizes the grid's rows, and comfortable rows add their step to it", async ({
  page,
}) => {
  await open(page, "preset=pivot");
  const rows = await rowCount(page);
  /* The content's height less the part of a row the body holds beyond its whole rows, which the content adds so the
   * last row shows whole at the scroll's end, for rows `rowPx` tall under a header `headerPx` tall. */
  const contentHeight = async (rowPx: number, headerPx: number): Promise<number> =>
    page
      .getByRole("grid")
      .evaluate(
        (element, sizes) =>
          element.scrollHeight - ((element.clientHeight - sizes.headerPx) % sizes.rowPx),
        { headerPx, rowPx },
      );
  // The header is 6 pixels taller than a row, and the rows are below it.
  expect(await contentHeight(24, 30)).toBe(rows * 24 + 30);
  await page.addStyleTag({ content: ":root { --px-row-height: 40px; }" });
  await bodyClass(page, "tall", true);
  await expect.poll(async () => contentHeight(40, 46)).toBe(rows * 40 + 46);
  await page.getByLabel("Row height", { exact: true }).selectOption("comfortable");
  await expect.poll(async () => contentHeight(46, 52)).toBe(rows * 46 + 52);
});

test("light-dark() in a token follows the grid's scheme", async ({ page }) => {
  await open(page, "preset=trades");
  await page.addStyleTag({
    content: ":root { --px-header-background: light-dark(rgb(255, 0, 0), rgb(0, 0, 255)); }",
  });
  await bodyClass(page, "branded", true);
  await expect.poll(async () => pixel(page, corner)).toBe("255,0,0");
  await page.getByLabel("Scheme", { exact: true }).selectOption("dark");
  await expect.poll(async () => pixel(page, corner)).toBe("0,0,255");
});

/** The drawing counters the harness shows: frames drawn, and how many of them drew everything. */
async function counts(draws: Locator): Promise<readonly number[]> {
  const text = await draws.textContent();
  return (text ?? "").match(/\d+/gu)?.map(Number) ?? [];
}

/** The frames drawn. */
async function drawn(draws: Locator): Promise<number> {
  const [frames = 0] = await counts(draws);
  return frames;
}

/** How long the harness takes to show the counters again, which it reads once a second. */
const countersMs = 1100;

/** The counters once they stop changing: the grid draws on animation frames, and the harness shows its counters a
 * second late, so a full draw of the load can show after the pointer has begun to move. */
async function settledCounts(page: Page, draws: Locator): Promise<readonly number[]> {
  let was = await counts(draws);
  await expect
    .poll(async () => {
      await page.waitForTimeout(countersMs);
      const now = await counts(draws);
      const same = now.join(",") === was.join(",");
      was = now;
      return same;
    })
    .toBe(true);
  return was;
}

/** Moves the pointer down the rows of the canvas, one row a step. */
async function hoverRows(page: Page, steps: number): Promise<void> {
  const box = await canvasOf(page).boundingBox();
  if (steps > 0 && box !== null) {
    await page.mouse.move(box.x + 200, box.y + 100 + steps * row);
    await hoverRows(page, steps - 1);
  }
}

test("the row under the pointer is highlighted by drawing its cells again, never the whole grid", async ({
  page,
}) => {
  await open(page, "preset=trades&performance=on");
  const draws = page.locator('[data-figure="draws"]');
  await expect(draws).toHaveText(/^\d+, \d+ of them full$/u);
  await hoverRows(page, 1);
  await expect.poll(async () => drawn(draws)).toBeGreaterThan(0);
  const [before, fullBefore] = await settledCounts(page, draws);
  await hoverRows(page, 6);
  // The counters are read once a second.
  await expect.poll(async () => drawn(draws)).toBeGreaterThan(before ?? 0);
  const [, fullAfter] = await counts(draws);
  expect(fullAfter).toBe(fullBefore);
});
