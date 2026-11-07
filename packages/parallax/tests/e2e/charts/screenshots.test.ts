/* Every chart of the harness, its breakdowns, its fixed-income charts and its technical page, in both modes, compared pixel for pixel with the
 * screenshots in `screenshots/`, as web/e2e/screenshots.spec.ts compares the Angular demo's. Text renders differently
 * from one machine to the next, so these run only in the pinned Playwright image: run them with `node
 * tests/e2e/charts/run.ts screenshots`, and take new ones with `--update-snapshots`. */

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { inTurn } from "./gestures.ts";
import { chartCount, errorsOf, open } from "./pages.ts";

test.skip(
  process.env["PARALLAX_PINNED_IMAGE"] !== "1",
  "Screenshots are compared only in the pinned Playwright image: run node tests/e2e/charts/run.ts screenshots.",
);

/** How many charts the breakdowns page and the fixed-income page show. */
const breakdownCount = 10;
const fixedIncomeCount = 1;

/** Two animation frames, for a paint to reach the screen. */
async function frames(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // Resolves with the second frame's time.
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

/** Compares a section with its screenshot, exactly: the status line, which says when the data was read, masked. */
async function matches(page: Page, section: Locator, name: string): Promise<void> {
  await section.scrollIntoViewIfNeeded();
  await paintAfresh(page);
  await expect(section).toHaveScreenshot(name, {
    animations: "disabled",
    caret: "hide",
    mask: [section.locator('[data-slot="chart-status"]')],
    maxDiffPixels: 0,
    threshold: 0,
  });
}

/** Compares each of `sections` with its screenshot, named by `attribute` with `prefix`, in `theme`. */
async function allMatch(
  page: Page,
  sections: Locator,
  naming: { readonly attribute: string; readonly prefix: string; readonly theme: string },
): Promise<void> {
  // A pointer resting on a chart would bring up its tooltip.
  await page.mouse.move(0, 0);
  await inTurn(await sections.all(), async (section) => {
    const id = (await section.getAttribute(naming.attribute)) ?? "";
    await matches(page, section, `${naming.prefix}${id}-${naming.theme}.png`);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`every chart draws as in its screenshot, ${theme} mode`, async ({ page }) => {
    const errors = errorsOf(page);
    await open(page, `/?page=charts&theme=${theme}`, chartCount);
    const cards = page.locator("section[data-card]");
    await expect(cards).toHaveCount(chartCount);
    await allMatch(page, cards, { attribute: "data-card", prefix: "", theme });
    expect(errors).toStrictEqual([]);
  });

  test(`every breakdown draws as in its screenshot, ${theme} mode`, async ({ page }) => {
    const errors = errorsOf(page);
    await open(page, `/?page=breakdowns&theme=${theme}`, breakdownCount);
    const sections = page.locator("section[data-breakdown]");
    await allMatch(page, sections, { attribute: "data-breakdown", prefix: "breakdown-", theme });
    expect(errors).toStrictEqual([]);
  });

  test(`every fixed-income chart draws as in its screenshot, ${theme} mode`, async ({ page }) => {
    const errors = errorsOf(page);
    await open(page, `/?page=fixed-income&theme=${theme}`, fixedIncomeCount);
    const cards = page.locator("section[data-card]");
    await expect(cards).toHaveCount(fixedIncomeCount);
    await allMatch(page, cards, { attribute: "data-card", prefix: "fixed-income-", theme });
    expect(errors).toStrictEqual([]);
  });

  test(`the technical page draws as in its screenshot, ${theme} mode`, async ({ page }) => {
    const errors = errorsOf(page);
    await open(page, `/?page=technical&theme=${theme}`, 1);
    await page.mouse.move(0, 0);
    await matches(
      page,
      page.locator('[data-slot="technical-chart"]'),
      `technical-page-${theme}.png`,
    );
    expect(errors).toStrictEqual([]);
  });
}
