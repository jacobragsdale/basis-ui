/**
 * Every chart in the demo and the small tables' grids, in both themes, compared pixel for pixel with the screenshots in
 * `e2e/screenshots`. Fonts and text rendering differ between machines, so these run only in the pinned Playwright
 * image: run them with `pnpm screenshots`, and take new ones with `pnpm screenshots --update-snapshots`.
 */

import { expect, test } from "@playwright/test";

test.skip(process.env["PARALLAX_PINNED_IMAGE"] !== "1", "Screenshots are compared only in the pinned Playwright image: run pnpm screenshots.");

const CHARTS = 14;

for (const theme of ["light", "dark"] as const) {
  test(`every chart draws as in its screenshot, ${theme} theme`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/?preset=charts&theme=${theme}`);
    const charts = page.locator("demo-charts section[data-card]").filter({ has: page.locator("px-chart") });
    await expect(charts).toHaveCount(CHARTS);
    // Every chart has its data once its status bar says what it shows.
    const rows = page.locator("px-chart .px-status-rows");
    await expect(rows).toHaveCount(CHARTS);
    await expect(rows.filter({ hasText: "loading" })).toHaveCount(0, { timeout: 60_000 });
    for (const chart of await charts.all()) {
      await chart.scrollIntoViewIfNeeded();
      const id = (await chart.getAttribute("data-card")) ?? "";
      // The status bar tells when the data was read, which changes with every run. In the pinned image drawing is
      // deterministic, so every pixel must match exactly: the default tolerance misses a change of a light wash.
      await expect(chart).toHaveScreenshot(`${id}-${theme}.png`, { mask: [chart.locator("px-status-bar")], animations: "disabled", caret: "hide", threshold: 0, maxDiffPixels: 0 });
    }
    expect(errors).toEqual([]);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`the technical-analysis page draws as in its screenshot, ${theme} theme`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/?preset=technical&theme=${theme}`);
    const chart = page.locator("demo-technical section.chart");
    await expect(chart.locator(".px-status-rows")).not.toHaveText(/loading/, { timeout: 60_000 });
    await expect(chart).toHaveScreenshot(`technical-page-${theme}.png`, { mask: [chart.locator("px-status-bar")], animations: "disabled", caret: "hide", threshold: 0, maxDiffPixels: 0 });
    expect(errors).toEqual([]);
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`the small tables' grids draw as in their screenshots, ${theme} theme`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/?preset=small&theme=${theme}`);
    const book = page.locator('section[data-table="book"]');
    const blotter = page.locator('section[data-table="blotter"]');
    await expect(book.locator('[role="grid"]')).toHaveAttribute("aria-rowcount", "300", { timeout: 60_000 });
    await expect(blotter.locator('[role="grid"]')).toHaveAttribute("aria-rowcount", "500", { timeout: 60_000 });
    const exactly = { animations: "disabled", caret: "hide", threshold: 0, maxDiffPixels: 0 } as const;
    // A pointer resting on a cell would bring up its tooltip after a moment.
    const away = (): Promise<void> => page.mouse.move(0, 0);
    // The toolbar, the pinned ticker and the totals row.
    await away();
    await expect(book).toHaveScreenshot(`grid-book-${theme}.png`, { ...exactly, mask: [book.locator("px-status-bar")] });
    // The fund's header menu, with its values and their counts.
    await book.locator("canvas.px-canvas").click({ position: { x: 10, y: 36 } });
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Alt+ArrowDown");
    const menu = page.locator("px-header-menu");
    await expect(menu).toHaveAttribute("aria-label", "Column fund");
    await expect(menu.locator("px-value-picker input[type=checkbox]")).toHaveCount(8, { timeout: 30_000 });
    await away();
    await expect(page.locator(".px-popover-panel")).toHaveScreenshot(`grid-header-menu-${theme}.png`, exactly);
    await page.keyboard.press("Escape");
    // The blotter grouped by fund: its groups with their counts, each over its trades.
    await blotter.locator("canvas.px-canvas").click({ position: { x: 10, y: 36 } });
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press("ArrowRight");
    }
    await page.keyboard.press("Alt+ArrowDown");
    await page.locator("px-header-menu").getByRole("menuitem", { name: "Group by this column" }).click();
    await expect(blotter.locator('[role="grid"]')).toHaveAttribute("aria-rowcount", "508");
    await away();
    await expect(blotter).toHaveScreenshot(`grid-detail-groups-${theme}.png`, { ...exactly, mask: [blotter.locator("px-status-bar")] });
    expect(errors).toEqual([]);
  });
}
