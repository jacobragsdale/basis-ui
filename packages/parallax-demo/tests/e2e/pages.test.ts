/* The demo's linked views and its themes: a slice clicked on the dashboard filters its table's grid, a breakdown
 * clicked narrows the other charts of its dataset, and a theme chosen in the appearance menu reaches every canvas. */

import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { chartsDrawn, errorsOf, gridsDrawn, open } from "./helpers.ts";

/** The pies a dashboard tile and a breakdown draw leave this much room round the ring, in pixels. */
const ringInset = 8;
const onTheRing = 0.8;

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
});

/** A point on the largest slice of the pie in `section`, which starts at twelve o'clock: just right of it, on the
 * ring. */
async function largestSlice(
  section: Locator,
): Promise<{ readonly plot: Locator; readonly at: { readonly x: number; readonly y: number } }> {
  const plot = section.locator('[data-slot="chart-plot"]');
  const box = await plot.boundingBox();
  const width = box?.width ?? 0;
  const height = box?.height ?? 0;
  const radius = Math.min(width, height) / 2 - ringInset;
  return { at: { x: width / 2 + ringInset, y: height / 2 - radius * onTheRing }, plot };
}

/** The filter chips of the grid in `section`. */
function chipsOf(section: Locator): Locator {
  return section.locator('[data-slot="grid-filter-chip"]');
}

/** The rows of the grid in `section`. */
async function rowsOf(section: Locator): Promise<number> {
  return Number(await section.getByRole("grid").getAttribute("aria-rowcount"));
}

/** A grid's host's resolved accent, which its canvas draws with. */
async function accent(page: Page): Promise<string> {
  return page
    .getByRole("grid")
    .first()
    .evaluate((grid) =>
      getComputedStyle(grid.closest("[data-px-scheme]") ?? grid)
        .getPropertyValue("--_px-accent")
        .trim(),
    );
}

/** Downloads the CSV of the grid in `section`, and counts its lines, the header's included. */
async function csvLines(page: Page, section: Locator): Promise<number> {
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await section.getByRole("button", { name: "More export formats" }).click();
  await page.getByRole("menuitem", { name: /CSV/u }).click();
  const file = await download;
  const text = readFileSync(await file.path(), "utf8");
  return text.trim().split("\n").length;
}

/** Clicks the largest slice of the chart in `section`, once hovering it shows its tooltip, and returns where, to click
 * it again. */
async function clickLargest(
  section: Locator,
): Promise<{ readonly plot: Locator; readonly at: { readonly x: number; readonly y: number } }> {
  const slice = await largestSlice(section);
  await slice.plot.hover({ position: slice.at });
  await expect(section.getByRole("tooltip")).toBeVisible();
  await slice.plot.click({ position: slice.at });
  return slice;
}

test("a dashboard slice filters its table's grid, whose CSV holds the rows shown, and a second click shows them all", async ({
  page,
}) => {
  const errors = errorsOf(page);
  await open(page, "/dashboard");
  await gridsDrawn(page, [300, 500]);
  const book = page.locator('section[data-table="book"]');
  const { plot, at } = await clickLargest(page.locator('[data-tile="asset-class"]'));
  await expect(chipsOf(book)).toHaveText(["asset_class = Equity"]);
  expect(await csvLines(page, book)).toBe((await rowsOf(book)) + 1);
  await plot.click({ position: at });
  await expect(book.getByRole("grid")).toHaveAttribute("aria-rowcount", "300");
  expect(errors).toStrictEqual([]);
});

test("the blotter's dashboard tile filters the blotter", async ({ page }) => {
  await open(page, "/dashboard");
  await gridsDrawn(page, [300, 500]);
  await clickLargest(page.locator('[data-tile="trades-by-side"]'));
  await expect(chipsOf(page.locator('section[data-table="blotter"]'))).toHaveText(["side = Buy"]);
});

/** A breakdown of the page, by its id. */
function breakdown(page: Page, id: string): Locator {
  return page.locator(`[data-breakdown="${id}"]`);
}

/** The chip that says which group narrows the positions' charts, and clears it. */
function positionsChip(page: Page): Locator {
  return page.locator('[data-dataset="positions"]').getByRole("button", { name: /^Show every/u });
}

test("a breakdown clicked narrows the other charts of its dataset until its chip clears it", async ({
  page,
}) => {
  await open(page, "/breakdowns");
  await chartsDrawn(page, 10);
  // The largest region, North America, narrows the positions' charts but the two grouped by region, and none of the
  // trades'.
  await clickLargest(breakdown(page, "notional-by-region"));
  await expect(positionsChip(page)).toHaveText("region: North America");
  await expect(page.locator('[data-filtered="true"]')).toHaveCount(5);
  await expect(breakdown(page, "pnl-by-strategy")).toHaveAttribute("data-filtered", "true");
  await positionsChip(page).click();
  await expect(page.locator('[data-filtered="true"]')).toHaveCount(0);
});

test("another breakdown's pick replaces the first, which is narrowed in its turn", async ({
  page,
}) => {
  await open(page, "/breakdowns");
  await chartsDrawn(page, 10);
  await clickLargest(breakdown(page, "notional-by-region"));
  await clickLargest(breakdown(page, "positions-by-fund"));
  await expect(positionsChip(page)).toContainText("fund: ");
  await expect(breakdown(page, "notional-by-region")).toHaveAttribute("data-filtered", "true");
  await expect(breakdown(page, "positions-by-fund")).toHaveAttribute("data-filtered", "false");
});

test("a theme chosen in the appearance menu reaches every canvas at once", async ({ page }) => {
  await open(page, "/small-tables");
  await gridsDrawn(page, [300, 500]);
  const theirs = await accent(page);
  await page.getByRole("button", { name: "Appearance" }).click();
  await page.getByRole("menuitemradio", { name: "Desk" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "desk");
  await expect.poll(async () => accent(page)).not.toBe(theirs);
});
