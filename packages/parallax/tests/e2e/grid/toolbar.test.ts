/* The grid's toolbar: the search, the filter chips, Collapse all and Expand all for a pivot, and Export: ported from the
 * Angular demo's grid.spec.ts. */

import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  blotterRows,
  canvasOf,
  clickAt,
  downloadPath,
  headerMenu,
  headerOf,
  layout,
  noteOf,
  open,
  rowCount,
  smallTable,
} from "./helpers.ts";

/** Exports the grid in `scope` as CSV and reads the file. */
async function csvOf(page: Page, scope: Page | Locator): Promise<string> {
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await scope.getByRole("button", { name: "More export formats" }).click();
  await page.getByRole("menuitem", { name: /CSV/u }).click();
  return readFileSync(await downloadPath(download), "utf8");
}

test("Collapse all and Expand all close and open every group of a pivot", async ({ page }) => {
  await open(page, "preset=pivot");
  const before = await rowCount(page);
  await page.getByRole("button", { name: "Collapse all" }).click();
  await expect.poll(async () => rowCount(page)).toBeLessThan(20);
  expect(await layout(page)).toMatchObject({ expand_depth: 0, expanded: [] });
  await page.getByRole("button", { name: "Expand all" }).click();
  await expect.poll(async () => rowCount(page)).toBeGreaterThanOrEqual(before);
  expect(await layout(page)).toMatchObject({ expand_depth: 4 });
});

test.describe("export", () => {
  test("Export to Excel downloads a workbook of the view", async ({ page }) => {
    await open(page, "preset=pivot");
    const download = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByRole("button", { exact: true, name: "Export" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^positions-\d{4}-\d{2}-\d{2}-\d{4}\.xlsx$/u);
    const bytes = readFileSync(await file.path());
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
  });

  test("a refused export says why in the status bar", async ({ page }) => {
    // 150,000 trades by 25 columns is more than an xlsx written in the browser holds.
    await open(page, "preset=trades");
    await page.getByRole("button", { exact: true, name: "Export" }).click();
    await expect(noteOf(page)).toContainText(
      "Export failed: the view has 3750025 cells, more than the 1000000 an Excel export here holds; export it as CSV instead",
      { timeout: 60_000 },
    );
  });

  test("CSV downloads every digit of the view", async ({ page }) => {
    await open(page, "preset=pivot");
    const text = await csvOf(page, page);
    expect(text.startsWith("﻿")).toBe(true);
    const [heading, total] = text.slice(1).split("\n");
    expect(
      heading?.startsWith("level,fund,strategy,sector,ticker,Bond | sum(market_value_usd),"),
    ).toBe(true);
    expect(heading?.endsWith(",Total | count(*)")).toBe(true);
    expect(total?.startsWith("0,,,,,")).toBe(true);
  });
});

test.describe("toolbar", () => {
  test("a search narrows the rows, and the CSV export holds the same rows", async ({ page }) => {
    const section = await smallTable(page, "blotter");
    await section.getByRole("searchbox", { name: "Search the grid" }).fill("atlas");
    await expect.poll(async () => rowCount(section)).toBeLessThan(blotterRows);
    const shown = await rowCount(section);
    expect(shown).toBeGreaterThan(0);
    const csv = await csvOf(page, section);
    expect(csv.trim().split("\n")).toHaveLength(shown + 1);
    // Clearing the search brings every row back.
    await section.getByRole("button", { name: "Clear the search" }).click();
    await expect(section.getByRole("grid")).toHaveAttribute("aria-rowcount", String(blotterRows));
  });

  test("Ctrl+F in a grid puts the cursor in its search", async ({ page }) => {
    await open(page, "preset=trades");
    await clickAt(page, { x: 40, y: 40 });
    await page.keyboard.press("ControlOrMeta+f");
    await expect(page.getByRole("searchbox", { name: "Search the grid" })).toBeFocused();
  });

  test("a filter's chip says what it keeps, and removes it", async ({ page }) => {
    const section = await smallTable(page, "blotter");
    const fund = await headerOf(page, section, 3);
    await canvasOf(section).click({ position: { x: fund.right - 10, y: 12 } });
    await headerMenu(page)
      .getByRole("list", { name: "Values" })
      .getByRole("checkbox")
      .first()
      .check();
    await expect.poll(async () => rowCount(section)).toBeLessThan(blotterRows);
    await page.keyboard.press("Escape");
    const chip = section.locator("[data-slot=grid-filter-chip]");
    await expect(chip).toContainText("fund:");
    await chip.getByRole("button", { name: /^Remove the filter/u }).click();
    await expect(section.getByRole("grid")).toHaveAttribute("aria-rowcount", String(blotterRows));
  });
});
