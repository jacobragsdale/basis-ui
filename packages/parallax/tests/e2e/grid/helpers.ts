/* What the grid's end-to-end specs share: opening a page of the harness, reading a grid's rows and its layout, pressing
 * its canvas, reading its canvas's pixels, its header menu, and copying. */

import { expect } from "@playwright/test";
import type { Download, Locator, Page } from "@playwright/test";

/** A row's height, and the header's, in the compact density the harness opens in. */
const row = 24;
const headerPx = 30;
/** The blotter's and the book's rows. */
const blotterRows = 500;
const bookRows = 300;
/** How long a grid of a large table may take to show its first rows. */
const firstRowsMs = 60_000;

/** A point on a canvas, in CSS pixels from its top left. */
interface Point {
  readonly x: number;
  readonly y: number;
}

/** A rectangle on a canvas, in CSS pixels. */
interface Box extends Point {
  readonly width: number;
  readonly height: number;
}

/** Opens a page of the harness and waits for its grid's rows. */
async function open(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", /^[1-9]\d*$/u, {
    timeout: firstRowsMs,
  });
}

/** The rows of the grid in `scope`. */
async function rowCount(scope: Page | Locator): Promise<number> {
  return Number(await scope.getByRole("grid").getAttribute("aria-rowcount"));
}

/** The columns of the grid in `scope`. */
async function columnCount(scope: Page | Locator): Promise<number> {
  return Number(await scope.getByRole("grid").getAttribute("aria-colcount"));
}

/** A field of a layout, read without trusting the page. */
function fieldOf(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return Object.entries(value).find(([name]) => name === key)?.[1];
}

/** A list of names in a layout, such as its columns. */
function listOf(value: unknown, key: string): readonly string[] {
  const found = fieldOf(value, key);
  return Array.isArray(found)
    ? found.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/** The length of a list in a layout, such as its sorts, or -1 if it has none. */
function lengthOf(value: unknown, key: string): number {
  const found = fieldOf(value, key);
  return Array.isArray(found) ? found.length : -1;
}

/** A column's saved width in a layout, or null. */
function savedWidth(value: unknown, column: string): number | null {
  const width = fieldOf(fieldOf(value, "column_widths"), column);
  return typeof width === "number" ? width : null;
}

/** The layout of a page of one grid, as the page shows it. */
async function layout(page: Page): Promise<unknown> {
  const text = await page.getByTestId("layout-json").textContent();
  return JSON.parse(text ?? "null");
}

/** The canvas of the grid in `scope`. */
function canvasOf(scope: Page | Locator): Locator {
  return scope.locator("[role=grid] canvas");
}

/** Clicks the canvas in `scope` at a point. */
async function clickAt(
  scope: Page | Locator,
  at: Point,
  modifiers: ("Shift" | "ControlOrMeta")[] = [],
): Promise<void> {
  await canvasOf(scope).click({ modifiers, position: at });
}

/** The status bar's note in `scope`. */
function noteOf(scope: Page | Locator): Locator {
  return scope.locator("[data-slot=grid-status-message]");
}

/** Copies the selection with Ctrl+C, waits for the grid in `scope` to say so, and reads the clipboard. */
async function copied(page: Page, scope: Page | Locator = page): Promise<string> {
  await page.keyboard.press("ControlOrMeta+c");
  await expect(noteOf(scope)).toContainText("Copied", { timeout: 30_000 });
  return page.evaluate(async () => navigator.clipboard.readText());
}

/** The header menu, a dialog named after its column. */
function headerMenu(page: Page): Locator {
  return page.getByRole("dialog", { name: /^Column /u });
}

/** The path of a download once it has arrived. */
async function downloadPath(download: Promise<Download>): Promise<string> {
  const arrived = await download;
  return arrived.path();
}

/** Presses `key` `times` times, in turn. */
async function press(page: Page, key: string, times: number): Promise<void> {
  if (times > 0) {
    await page.keyboard.press(key);
    await press(page, key, times - 1);
  }
}

/** A table on the small tables' page, once its rows show. */
async function smallTable(page: Page, name: "book" | "blotter"): Promise<Locator> {
  await page.goto("/?preset=small");
  const section = page.locator(`section[data-table="${name}"]`);
  const rows = name === "book" ? bookRows : blotterRows;
  await expect(section.getByRole("grid")).toHaveAttribute("aria-rowcount", String(rows), {
    timeout: firstRowsMs,
  });
  return section;
}

/** Opens the menu of column `column`, counted from 0 at the left, with Alt+Down from a cell of the first row. */
async function openMenu(page: Page, grid: Locator, column: number): Promise<Locator> {
  await canvasOf(grid).click({ position: { x: 10, y: headerPx + row / 2 } });
  await press(page, "ArrowRight", column);
  await page.keyboard.press("Alt+ArrowDown");
  return headerMenu(page);
}

/**
 * A column's header on a grid's canvas, from the menu that Alt+Down opens over it: columns fit their values, so their
 * widths aren't known ahead. `grid` holds one grid.
 */
async function headerOf(
  page: Page,
  grid: Locator,
  column: number,
): Promise<{ readonly name: string; readonly left: number; readonly right: number }> {
  const menu = await openMenu(page, grid, column);
  const name = ((await menu.getAttribute("aria-label")) ?? "").replace(/^Column /u, "");
  const anchor = await grid.locator("[data-slot=grid-menu-anchor]").boundingBox();
  const box = await canvasOf(grid).boundingBox();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  if (anchor === null || box === null) {
    throw new Error("no header menu anchor");
  }
  return { left: anchor.x - box.x, name, right: anchor.x + anchor.width - box.x };
}

/** Counts pixels in a rectangle of the canvas that differ from its top-left pixel: zero means nothing is drawn there. */
async function inkIn(page: Page, box: Box): Promise<number> {
  return canvasOf(page).evaluate((canvas, area) => {
    const ratio = globalThis.devicePixelRatio;
    const context = canvas instanceof HTMLCanvasElement ? canvas.getContext("2d") : null;
    const pixels =
      context?.getImageData(area.x * ratio, area.y * ratio, area.width * ratio, area.height * ratio)
        .data ?? [];
    let ink = 0;
    const channels = 4;
    for (let index = 0; index < pixels.length; index += channels) {
      const same =
        pixels[index] === pixels[0] &&
        pixels[index + 1] === pixels[1] &&
        pixels[index + 2] === pixels[2];
      ink += same ? 0 : 1;
    }
    return ink;
  }, box);
}

/** The colour of the canvas's pixel at a point, as `r,g,b`. */
async function pixel(page: Page, at: Point): Promise<string> {
  return canvasOf(page).evaluate((canvas, point) => {
    const ratio = globalThis.devicePixelRatio;
    const context = canvas instanceof HTMLCanvasElement ? canvas.getContext("2d") : null;
    const data = context?.getImageData(
      Math.round(point.x * ratio),
      Math.round(point.y * ratio),
      1,
      1,
    ).data;
    return data === undefined ? "" : `${String(data[0])},${String(data[1])},${String(data[2])}`;
  }, at);
}

export {
  blotterRows,
  downloadPath,
  bookRows,
  canvasOf,
  clickAt,
  columnCount,
  copied,
  headerMenu,
  headerOf,
  headerPx,
  inkIn,
  layout,
  lengthOf,
  listOf,
  noteOf,
  open,
  openMenu,
  pixel,
  press,
  row,
  rowCount,
  savedWidth,
  smallTable,
};
export type { Box, Point };
