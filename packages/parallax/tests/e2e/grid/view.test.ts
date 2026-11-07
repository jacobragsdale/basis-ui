/* The grid draws a view and reads it back: ported from the Angular demo's grid.spec.ts. The pivot's own settings, its
 * field list, its drill-down drawer and its measure menu belong to the pivot, the next family of roadmap step 2.6, and
 * are left to its specs; these cover the grid a pivot shows through. */

import { expect, test } from "@playwright/test";

import {
  canvasOf,
  clickAt,
  copied,
  headerOf,
  inkIn,
  layout,
  noteOf,
  open,
  row,
  rowCount,
  savedWidth,
} from "./helpers.ts";

// Row 0 is the grand total, under the header; row 1 is the first fund, expanded by default. Its marker sits one indent
// in: 8 px of padding plus 14 px per level.
const firstFund = { x: 24, y: row * 2 + row / 2 };
const firstFundLabel = { x: 120, y: row * 2 + row / 2 };

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
});

test("the pivot draws, and the status bar says where the numbers come from", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page, "preset=pivot");
  await expect(page.locator("[data-slot=grid-status-dataset]")).toHaveText("positions");
  await expect(page.locator("[data-slot=grid-status-rows]")).toContainText("rows");
  await page.getByRole("button", { name: "About this data" }).click();
  await expect(page.locator("[data-slot=grid-about]")).toContainText("Rows in table");
  await page.getByRole("grid").evaluate((element) => {
    element.scrollTo({ left: element.scrollWidth });
  });
  await expect(page.locator("[data-slot=grid-error]")).toHaveCount(0);
  expect(errors).toStrictEqual([]);
});

test("clicking a group's marker collapses and expands it, and the layout records it", async ({
  page,
}) => {
  await open(page, "preset=pivot");
  const before = await rowCount(page);
  await clickAt(page, firstFund);
  await expect.poll(async () => rowCount(page)).toBeLessThan(before);
  expect(await layout(page)).toMatchObject({ expanded: [{ expanded: false }] });
  await clickAt(page, firstFund);
  await expect.poll(async () => rowCount(page)).toBe(before);
});

test("clicking a group's label selects it without toggling; a double click toggles", async ({
  page,
}) => {
  await open(page, "preset=pivot");
  const before = await rowCount(page);
  await clickAt(page, firstFundLabel);
  await page.waitForTimeout(300);
  expect(await rowCount(page)).toBe(before);
  const label = await copied(page);
  expect(label.trim()).toBe("Atlas Global Macro");
  await canvasOf(page).dblclick({ position: firstFundLabel });
  await expect.poll(async () => rowCount(page)).toBeLessThan(before);
});

test("clicking a header sorts, and copying carries every digit", async ({ page }) => {
  await open(page, "preset=trades");
  // trade_id is the first column; two clicks sort it descending.
  await clickAt(page, { x: 40, y: row / 2 });
  await expect
    .poll(async () => layout(page))
    .toMatchObject({ sort: [{ column: "trade_id", descending: false }] });
  await clickAt(page, { x: 40, y: row / 2 });
  await expect
    .poll(async () => layout(page))
    .toMatchObject({ sort: [{ column: "trade_id", descending: true }] });
  await clickAt(page, { x: 40, y: row + row / 2 });
  const total = await rowCount(page);
  const id = await copied(page);
  expect(id.trim()).toBe(String(total));
});

test("every column in view is drawn, not only the first few", async ({ page }) => {
  await open(page, "preset=trades");
  // The header and first cell of the eighth column, inside its borders.
  await expect
    .poll(async () => inkIn(page, { height: row - 4, width: 130, x: 7 * 140 + 2, y: 2 }))
    .toBeGreaterThan(0);
  await expect
    .poll(async () => inkIn(page, { height: row - 4, width: 130, x: 7 * 140 + 2, y: row + 2 }))
    .toBeGreaterThan(0);
});

test("dragging a header edge resizes the column into the layout", async ({ page }) => {
  await open(page, "preset=trades");
  const first = await headerOf(page, page.locator("[data-slot=grid]"), 0);
  const box = await canvasOf(page).boundingBox();
  // Pressed 1 px inside the edge and moved 61 px right, the column grows by 61 px.
  await page.mouse.move((box?.x ?? 0) + first.right - 1, (box?.y ?? 0) + row / 2);
  await page.mouse.down();
  await page.mouse.move((box?.x ?? 0) + first.right + 60, (box?.y ?? 0) + row / 2, { steps: 4 });
  await page.mouse.up();
  const width = first.right - first.left + 61;
  await expect.poll(async () => savedWidth(await layout(page), first.name)).toBeCloseTo(width, 0);
});

test("a range copies as tab-separated rows", async ({ page }) => {
  await open(page, "preset=trades");
  await clickAt(page, { x: 40, y: row + row / 2 });
  await clickAt(page, { x: 200, y: row * 3 + row / 2 }, ["Shift"]);
  const text = await copied(page);
  const lines = text.split("\r\n");
  expect(lines).toHaveLength(3);
  expect(lines.every((line) => line.split("\t").length === 2)).toBe(true);
  expect(lines[0]?.split("\t")[0]).toBe("1");
});

test("copying more rows than are loaded fetches them first", async ({ page }) => {
  await open(page, "preset=pivot");
  await clickAt(page, { x: 60, y: row + row / 2 });
  await page.keyboard.press("ControlOrMeta+a");
  const text = await copied(page);
  expect(text.split("\r\n")).toHaveLength(await rowCount(page));
});

test("on a page that is not a secure context, rows fetched for a copy wait for a second Ctrl+C", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, "isSecureContext", { value: false });
  });
  await open(page, "preset=pivot");
  await clickAt(page, { x: 120, y: row + row / 2 });
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  await expect(noteOf(page)).toContainText("press Ctrl+C again", { timeout: 30_000 });
  const text = await copied(page);
  expect(text.split("\r\n")).toHaveLength(await rowCount(page));
});

test("a copy beyond the cell limit is refused with a reason", async ({ page }) => {
  await open(page, "preset=trades");
  await clickAt(page, { x: 40, y: row + row / 2 });
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  await expect(noteOf(page)).toContainText("cells", { timeout: 30_000 });
});
