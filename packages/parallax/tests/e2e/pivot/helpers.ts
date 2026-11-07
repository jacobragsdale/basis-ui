/* What the pivot's end-to-end specs share: opening the harness's pivot, reading its grid's rows and its layout, its
 * canvas, its settings' areas, a filter opened from the field list, and a download. */

import { expect } from "@playwright/test";
import type { Download, Locator, Page } from "@playwright/test";

/** A row's height in the compact density the harness opens in. */
const row = 24;

/** How long a pivot of the 150,000 positions may take to show its first rows. */
const firstRowsMs = 60_000;

/** The first fund's row, under the header and the grand total: its marker, its label, and its first value, which
 * sits under the Bond pivot. */
const firstFund = {
  label: { x: 120, y: row * 2 + row / 2 },
  marker: { x: 24, y: row * 2 + row / 2 },
  value: { x: 320, y: row * 2 + row / 2 },
} as const;

/** The pivot's table, the grid named after the dataset. */
function pivotGrid(page: Page): Locator {
  return page.getByRole("grid", { name: "positions" });
}

/** The pivot's canvas. */
function canvasOf(page: Page): Locator {
  return pivotGrid(page).locator("canvas");
}

/** Opens a page of the harness and waits for its table's rows. */
async function open(page: Page, query = "preset=pivot"): Promise<void> {
  await page.goto(`/?${query}`);
  await expect(pivotGrid(page)).toHaveAttribute("aria-rowcount", /^[1-9]\d*$/u, {
    timeout: firstRowsMs,
  });
}

/** The rows of the grid in `scope`, the pivot's by default. */
async function rowCount(scope: Page | Locator): Promise<number> {
  const grid = "goto" in scope ? pivotGrid(scope) : scope.getByRole("grid");
  return Number(await grid.getAttribute("aria-rowcount"));
}

/** Scrolls the pivot's table to its last rows, and waits until it has. */
async function scrollToEnd(page: Page): Promise<void> {
  const grid = pivotGrid(page);
  await grid.evaluate((element) => {
    element.scrollTo({ top: element.scrollHeight });
  });
  await expect.poll(async () => grid.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
}

/** One of the field list's areas, or its list of fields, by name. */
function listNamed(
  page: Page,
  name: "Fields" | "Filters" | "Columns" | "Rows" | "Values",
): Locator {
  return page.getByRole("list", { name, exact: true });
}

/** Opens a filter on a field from the field list; its editor opens at once, on its list of values. */
async function filterBy(page: Page, field: string): Promise<Locator> {
  await page.getByRole("button", { name: `Add ${field} to` }).click();
  await page.getByRole("menuitem", { name: "Add to Filters" }).click();
  return page.getByRole("dialog", { name: `Filter ${field}` });
}

/** A field of a layout, read without trusting the page. */
function fieldOf(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return Object.entries(value).find(([name]) => name === key)?.[1];
}

/** A list of names in a layout, such as its row groups. */
function listOf(value: unknown, key: string): readonly string[] {
  const found = fieldOf(value, key);
  return Array.isArray(found)
    ? found.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/** The length of a list in a layout, such as its filters, or -1 if it has none. */
function lengthOf(value: unknown, key: string): number {
  const found = fieldOf(value, key);
  return Array.isArray(found) ? found.length : -1;
}

/** The page's layout, as the harness shows it. */
async function layout(page: Page): Promise<unknown> {
  const text = await page.getByTestId("layout-json").textContent();
  return JSON.parse(text ?? "null");
}

/** The path of a download once it has arrived. */
async function downloadPath(download: Promise<Download>): Promise<string> {
  const arrived = await download;
  return arrived.path();
}

/** Whether the page shows a grid's error. */
async function errorCount(page: Page): Promise<number> {
  return page.locator("[data-slot=grid-error]").count();
}

/** A filter editor's list of values. */
function valuesOf(editor: Locator): Locator {
  return editor.getByRole("list", { name: "Values" }).getByRole("checkbox");
}

export {
  canvasOf,
  downloadPath,
  errorCount,
  filterBy,
  firstFund,
  layout,
  lengthOf,
  listNamed,
  listOf,
  open,
  pivotGrid,
  rowCount,
  scrollToEnd,
  valuesOf,
};
