/* The pivot's screenshots, compared pixel for pixel with those in `screenshots/`: the pivot with its settings, a
 * measure header's menu, a Rows chip's menu, a filter's editor, and the rows behind a value, in both schemes, and the
 * pivot again at 1.25 and 1.5, the ratios of a desktop scaled to 125 % and 150 %. Fonts
 * and text rendering differ between machines, so these run only in the pinned Playwright image: run them with
 * `tests/e2e/pivot/in-image.sh screenshots`, and take new ones by adding `--update-snapshots`. The status bars tell
 * when the data was read and how long ago, so they are masked. */

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { canvasOf, filterBy, firstFund, listNamed, open, valuesOf } from "./helpers.ts";

test.skip(
  process.env["PARALLAX_PINNED_IMAGE"] !== "1",
  "Screenshots are compared only in the pinned Playwright image: run tests/e2e/pivot/in-image.sh.",
);

/** In the pinned image drawing is deterministic, so every pixel must match: the default tolerance misses a light
 * wash. */
const exactly = {
  animations: "disabled",
  caret: "hide",
  maxDiffPixels: 0,
  // In device pixels, which at a ratio of 1 are CSS pixels: a scaled desktop's screenshot shows each device pixel.
  scale: "device",
  threshold: 0,
} as const;

/** Waits for two animation frames in the page. */
async function twoFrames(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const first = Promise.withResolvers<number>();
    requestAnimationFrame(first.resolve);
    await first.promise;
    const second = Promise.withResolvers<number>();
    requestAnimationFrame(second.resolve);
    await second.promise;
  });
}

/**
 * Paints the whole page again. A rounded corner painted while the page was still loading can come out a shade different
 * from one painted whole, so a screenshot taken straight away would depend on when the data arrived.
 */
async function paintAfresh(page: Page): Promise<void> {
  // A hidden page cannot hold the focus, so Chromium takes it from a menu's item; it is given back, as it was.
  const focused = await page.evaluateHandle(() => document.activeElement);
  await page.evaluate(() => {
    document.body.style.visibility = "hidden";
  });
  await twoFrames(page);
  await page.evaluate((element) => {
    document.body.style.visibility = "";
    if (element instanceof HTMLElement) {
      element.focus({ preventScroll: true });
    }
  }, focused);
  await twoFrames(page);
}

/** Opens the pivot in `theme` and moves the pointer away, since a pointer resting on a cell would bring up its
 * tooltip. */
async function pivot(page: Page, theme: string): Promise<void> {
  await open(page, `preset=pivot&theme=${theme}`);
  await page.mouse.move(0, 0);
}

/** A screenshot of `target` with the status bars masked, once the page is painted afresh. */
async function shot(target: Locator, name: string): Promise<void> {
  const page = target.page();
  await page.mouse.move(0, 0);
  await paintAfresh(page);
  await expect(target).toHaveScreenshot(name, {
    ...exactly,
    mask: [page.locator("[data-slot=grid-status]")],
  });
}

test("the pivot and its settings draw as in their screenshot at a scaled desktop's ratio, light scheme", async ({
  page,
}) => {
  await pivot(page, "light");
  await shot(page.locator("main"), "pivot-light.png");
});

for (const theme of ["light", "dark"] as const) {
  test(`the pivot and its settings draw as in their screenshot, ${theme} scheme`, async ({
    page,
  }) => {
    await pivot(page, theme);
    await shot(page.locator("main"), `pivot-${theme}.png`);
  });

  test(`a measure header's menu draws as in its screenshot, ${theme} scheme`, async ({ page }) => {
    await pivot(page, theme);
    await canvasOf(page).click({ position: firstFund.value });
    await page.keyboard.press("Alt+ArrowDown");
    const menu = page.getByRole("dialog", { name: "Value Sum of market_value_usd" });
    await expect(menu.getByRole("menuitem").first()).toBeFocused();
    await shot(menu, `pivot-measure-menu-${theme}.png`);
  });

  test(`a Rows chip's menu draws as in its screenshot, ${theme} scheme`, async ({ page }) => {
    await pivot(page, theme);
    await page.getByRole("button", { name: "Options for strategy" }).click();
    const menu = page.getByRole("menu", { name: "Field strategy" });
    await expect(menu.getByRole("menuitem")).toHaveCount(6);
    await shot(menu, `pivot-group-menu-${theme}.png`);
  });

  test(`a filter's editor draws as in its screenshot, ${theme} scheme`, async ({ page }) => {
    await pivot(page, theme);
    const editor = await filterBy(page, "fund");
    await expect(valuesOf(editor)).toHaveCount(8, { timeout: 30_000 });
    await valuesOf(editor).first().check();
    await expect(listNamed(page, "Filters").getByRole("listitem")).not.toHaveText("fund: (All)");
    await shot(editor, `pivot-filter-${theme}.png`);
  });

  test(`the rows behind a value draw as in their screenshot, ${theme} scheme`, async ({ page }) => {
    await pivot(page, theme);
    await canvasOf(page).dblclick({ position: firstFund.value });
    const rows = page.getByRole("region", { name: /^Rows behind /u });
    await expect(rows.getByRole("grid")).toHaveAttribute("aria-rowcount", /^[1-9]\d*$/u, {
      timeout: 30_000,
    });
    await shot(rows, `pivot-drill-${theme}.png`);
  });
}
