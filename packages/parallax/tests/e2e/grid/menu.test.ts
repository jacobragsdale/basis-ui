/* A column's header menu and the column tools: filtering, hiding, pinning, totals, and moving a column: ported from the
 * Angular demo's grid.spec.ts. */

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  blotterRows,
  bookRows,
  canvasOf,
  clickAt,
  columnCount,
  headerMenu,
  headerOf,
  layout,
  lengthOf,
  listOf,
  open,
  openMenu,
  rowCount,
  smallTable,
} from "./helpers.ts";

/** Drags the first header to the right, past the threshold that makes a press a drag. */
async function dragFirstHeader(page: Page): Promise<void> {
  const box = await canvasOf(page).boundingBox();
  const [x, y] = [box?.x ?? 0, (box?.y ?? 0) + 12];
  await page.mouse.move(x + 40, y);
  await page.mouse.down();
  await page.mouse.move(x + 120, y, { steps: 4 });
  await page.mouse.move(x + 380, y, { steps: 8 });
  await page.mouse.up();
}

/** Opens the book's fund column's menu from its funnel. The fund is its second column, after its pinned ticker, and
 * is text; its funnel is at the right of its header. */
async function openFundFilter(page: Page, section: Locator): Promise<Locator> {
  const fund = await headerOf(page, section, 1);
  expect(fund.name).toBe("fund");
  await canvasOf(section).click({ position: { x: fund.right - 10, y: 12 } });
  return headerMenu(page);
}

/** Opens the first column's menu with Alt+Down, which takes the focus, and closes it with Escape, which gives the grid
 * its focus back. */
async function escapeBack(page: Page, section: Locator): Promise<void> {
  const menu = await openMenu(page, section, 0);
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(headerMenu(page)).toHaveCount(0);
  await expect(section.getByRole("grid")).toBeFocused();
}

test.describe("header menu", () => {
  test("a header's funnel opens its menu, whose value list keeps the values ticked", async ({
    page,
  }) => {
    const section = await smallTable(page, "blotter");
    // The second column's funnel, at the right of its header.
    const second = await headerOf(page, section, 1);
    await canvasOf(section).click({ position: { x: second.right - 10, y: 12 } });
    const first = headerMenu(page)
      .getByRole("list", { name: "Values" })
      .getByRole("checkbox")
      .first();
    await first.check({ timeout: 30_000 });
    await expect.poll(async () => rowCount(section)).toBeLessThan(blotterRows);
    await expect(section.locator("[data-slot=grid-filter-chip]")).toHaveCount(1);
    // Escape closes the menu and gives the grid its focus back.
    await page.keyboard.press("Escape");
    await expect(headerMenu(page)).toHaveCount(0);
    await expect(section.getByRole("grid")).toBeFocused();
  });

  test("Alt+Down opens the focused column's menu, and Hide column hides it", async ({ page }) => {
    const section = await smallTable(page, "blotter");
    const columns = await columnCount(section);
    await escapeBack(page, section);
    await page.keyboard.press("Alt+ArrowDown");
    await page.getByRole("menuitem", { name: "Hide column" }).click();
    await expect(section.getByRole("grid")).toHaveAttribute("aria-colcount", String(columns - 1));
    await expect(headerMenu(page)).toHaveCount(0);
  });

  test("a condition filters the column, and does not contain says it keeps blanks", async ({
    page,
  }) => {
    const section = await smallTable(page, "book");
    const menu = await openFundFilter(page, section);
    const mode = menu.getByRole("combobox", { name: "Keep rows where" });
    await mode.selectOption("not_contains", { timeout: 10_000 });
    await expect(menu.getByText("Blank cells are kept, as in Excel.")).toBeVisible();
    await mode.selectOption("contains", { timeout: 10_000 });
    await menu.getByRole("textbox", { name: "Value" }).fill("atlas");
    await page.keyboard.press("Enter");
    await expect.poll(async () => rowCount(section)).toBeLessThan(bookRows);
    await expect(section.locator("[data-slot=grid-filter-chip]")).toContainText("contains atlas");
  });
});

test.describe("columns", () => {
  test("the chooser hides a column and moves another", async ({ page }) => {
    await open(page, "preset=trades");
    const before = await columnCount(page);
    await page.getByRole("button", { name: "Columns" }).click();
    const chooser = page.getByRole("dialog", { name: "Columns" });
    await chooser.getByRole("checkbox").first().uncheck();
    await expect.poll(async () => columnCount(page)).toBe(before - 1);
    // The second shown column moves up with Alt+Up.
    const second = chooser
      .getByRole("listitem")
      .filter({ has: page.getByRole("checkbox", { checked: true }) })
      .nth(1);
    const name = await second.textContent();
    await second.getByRole("checkbox").press("Alt+ArrowUp");
    await expect.poll(async () => listOf(await layout(page), "columns")[0]).toBe(name);
  });

  test("a pinned column stays put while the others scroll", async ({ page }) => {
    await open(page, "preset=trades");
    await page.getByRole("button", { name: "Columns" }).click();
    await page.getByRole("button", { name: "Pin fund" }).click();
    await expect.poll(async () => listOf(await layout(page), "pinned")).toStrictEqual(["fund"]);
    await page.keyboard.press("Escape");
    await page.getByRole("grid").evaluate((element) => {
      element.scrollTo({ left: 900 });
    });
    // The first column on screen is still the fund: a cell there opens the fund's menu.
    await clickAt(page, { x: 40, y: 40 });
    await page.keyboard.press("Alt+ArrowDown");
    await expect(headerMenu(page)).toHaveAttribute("aria-label", "Column fund");
  });

  test("the totals row, which the grid also says in text, goes and comes back with Totals", async ({
    page,
  }) => {
    const section = await smallTable(page, "blotter");
    // The blotter counts its trades and totals their quantities.
    const totals = section.getByRole("button", { name: "Totals" });
    await expect(totals).toHaveAttribute("aria-pressed", "true");
    const spoken = section.getByRole("status", { name: "Totals row" });
    await expect(spoken).toContainText(/^Totals\. Trade ID: 500; Quantity: [\d,.]+/u);
    await totals.click();
    await expect(spoken).toHaveCount(0);
    await totals.click();
    await expect(totals).toHaveAttribute("aria-pressed", "true");
    await expect(spoken).toContainText(/Totals\. .+: [\d,.()-]+/u);
  });

  test("dragging a header moves its column; a click still sorts", async ({ page }) => {
    await open(page, "preset=trades");
    const first = await headerOf(page, page.locator("[data-slot=grid]"), 0);
    await dragFirstHeader(page);
    await expect
      .poll(async () => listOf(await layout(page), "columns").indexOf(first.name))
      .toBeGreaterThan(0);
    expect(lengthOf(await layout(page), "sort")).toBe(0);
  });
});
