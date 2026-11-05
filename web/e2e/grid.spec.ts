/** Functional checks of `<px-grid>` against the reference server. */

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

const ROW = 24;

async function open(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await expect(page.locator('[role="grid"]')).toHaveAttribute("aria-rowcount", /^[1-9]\d*$/, { timeout: 60_000 });
}

async function rowCount(page: Page): Promise<number> {
  return Number(await page.locator('[role="grid"]').getAttribute("aria-rowcount"));
}

/** A list of names in a layout, such as its columns, read without trusting the page. */
function listOf(value: unknown, key: string): readonly string[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const found: unknown = Object.entries(value).find(([k]) => k === key)?.[1];
  return Array.isArray(found) ? found.filter((v): v is string => typeof v === "string") : [];
}

/** The blotter on the Small tables page, at full size. */
async function blotter(page: Page): Promise<Locator> {
  await page.goto("/?preset=small");
  const section = page.locator('section[data-table="blotter"]');
  await expect(section.locator('[role="grid"]')).toHaveAttribute("aria-rowcount", "500", { timeout: 60_000 });
  return section;
}

/**
 * A column's header on a grid's canvas, from the menu that Alt+Down opens over it: columns fit their values, so their
 * widths aren't known ahead. `column` counts from 0 at the left; `grid` holds one grid.
 */
async function headerOf(page: Page, grid: Locator, column: number): Promise<{ readonly name: string; readonly left: number; readonly right: number }> {
  const canvas = grid.locator("canvas.px-canvas");
  await canvas.click({ position: { x: 10, y: ROW + ROW / 2 } });
  for (let i = 0; i < column; i += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await page.keyboard.press("Alt+ArrowDown");
  const menu = grid.locator("px-header-menu");
  const name = ((await menu.getAttribute("aria-label")) ?? "").replace(/^Column /, "");
  const anchor = await grid.locator(".px-menu-anchor").boundingBox();
  const box = await canvas.boundingBox();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  if (anchor === null || box === null) {
    throw new Error("no header menu anchor");
  }
  const right = anchor.x + anchor.width - box.x;
  if (right > box.width) {
    throw new Error(`column ${String(column)} ends past the canvas, at ${String(right)} px of ${String(box.width)}`);
  }
  return { name, left: anchor.x - box.x, right };
}

/** A column's saved width in a layout, or null. */
function savedWidth(value: unknown, column: string): number | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const widths: unknown = Object.entries(value).find(([k]) => k === "column_widths")?.[1];
  const width: unknown = typeof widths === "object" && widths !== null ? Object.entries(widths).find(([k]) => k === column)?.[1] : null;
  return typeof width === "number" ? width : null;
}

/** Opens a filter on a pivot's field from the field list; its value list opens at once. */
async function filterBy(page: Page, field: string): Promise<Locator> {
  await page.getByRole("button", { name: `Add ${field} to` }).click();
  await page.getByRole("menuitem", { name: "Add to Filters" }).click();
  return page.locator("px-column-filter");
}

/** The length of a list in a layout, such as its sorts, or -1 if it has none. */
function lengthOf(value: unknown, key: string): number {
  if (typeof value !== "object" || value === null) {
    return -1;
  }
  const found: unknown = Object.entries(value).find(([k]) => k === key)?.[1];
  return Array.isArray(found) ? found.length : -1;
}

async function layout(page: Page): Promise<unknown> {
  const text = await page.getByTestId("layout-json").textContent({ timeout: 5_000 });
  return JSON.parse(text ?? "null");
}

/** Clicks the canvas at a point inside the grid. */
async function clickAt(page: Page, x: number, y: number, modifiers: ("Shift" | "ControlOrMeta")[] = []): Promise<void> {
  await page.locator("canvas.px-canvas").click({ position: { x, y }, modifiers });
}

async function copied(page: Page): Promise<string> {
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.locator(".px-status-message")).toContainText("Copied", { timeout: 30_000 });
  return page.evaluate(() => navigator.clipboard.readText());
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
});

test("the pivot draws, and the status bar says where the numbers come from", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page, "preset=pivot");
  await expect(page.locator(".px-status-dataset")).toHaveText("positions");
  await expect(page.locator(".px-status-rows")).toContainText("rows");
  await page.locator(".px-status-info").click();
  await expect(page.locator(".px-info")).toContainText("Rows in table");
  await page.locator(".px-scroll").evaluate((element) => {
    element.scrollTo({ left: element.scrollWidth });
  });
  await page.waitForTimeout(300);
  await expect(page.locator(".px-error")).toHaveCount(0);
  expect(errors).toEqual([]);
});

// Row 0 is the grand total; row 1 is the first fund, expanded by default. Its
// marker sits one indent in: 6 px of padding plus 14 px per level.
const FIRST_FUND_MARKER = 24;

test("clicking a group's marker collapses and expands it, and the layout records it", async ({ page }) => {
  await open(page, "preset=pivot");
  const before = await rowCount(page);
  await clickAt(page, FIRST_FUND_MARKER, ROW * 2 + ROW / 2);
  await expect.poll(() => rowCount(page)).toBeLessThan(before);
  expect(await layout(page)).toMatchObject({ expanded: [{ expanded: false }] });
  await clickAt(page, FIRST_FUND_MARKER, ROW * 2 + ROW / 2);
  await expect.poll(() => rowCount(page)).toBe(before);
});

test("clicking a group's label selects it without toggling; a double click toggles", async ({ page }) => {
  await open(page, "preset=pivot");
  const before = await rowCount(page);
  await clickAt(page, 120, ROW * 2 + ROW / 2);
  await page.waitForTimeout(300);
  expect(await rowCount(page)).toBe(before);
  expect((await copied(page)).trim()).toBe("Atlas Global Macro");
  await page.locator("canvas.px-canvas").dblclick({ position: { x: 120, y: ROW * 2 + ROW / 2 } });
  await expect.poll(() => rowCount(page)).toBeLessThan(before);
});

test("clicking a header sorts, and copying carries every digit", async ({ page }) => {
  await open(page, "preset=trades");
  // trade_id is the first column; two clicks sort it descending.
  await clickAt(page, 40, ROW / 2);
  await expect.poll(async () => layout(page)).toMatchObject({ sort: [{ column: "trade_id", descending: false }] });
  await clickAt(page, 40, ROW / 2);
  await expect.poll(async () => layout(page)).toMatchObject({ sort: [{ column: "trade_id", descending: true }] });
  await clickAt(page, 40, ROW + ROW / 2);
  const total = await rowCount(page);
  expect((await copied(page)).trim()).toBe(String(total));
});

/** Counts pixels in a canvas rectangle that differ from its top-left pixel: zero means nothing is drawn there. */
async function inkIn(page: Page, x: number, y: number, width: number, height: number): Promise<number> {
  return page.locator("canvas.px-canvas").evaluate(
    (canvas, box) => {
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("not a canvas");
      }
      const context = canvas.getContext("2d");
      if (context === null) {
        throw new Error("no context");
      }
      const ratio = window.devicePixelRatio;
      const pixels = context.getImageData(box.x * ratio, box.y * ratio, box.width * ratio, box.height * ratio).data;
      let ink = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] !== pixels[0] || pixels[i + 1] !== pixels[1] || pixels[i + 2] !== pixels[2]) {
          ink += 1;
        }
      }
      return ink;
    },
    { x, y, width, height }
  );
}

test("every column in view is drawn, not only the first few", async ({ page }) => {
  await open(page, "preset=trades");
  // The header and first cell of the eighth column, inside its borders.
  await expect.poll(() => inkIn(page, 7 * 140 + 2, 2, 130, ROW - 4)).toBeGreaterThan(0);
  await expect.poll(() => inkIn(page, 7 * 140 + 2, ROW + 2, 130, ROW - 4)).toBeGreaterThan(0);
});

test("dragging a header edge resizes the column into the layout", async ({ page }) => {
  await open(page, "preset=trades");
  const grid = page.locator("px-grid").first();
  const first = await headerOf(page, grid, 0);
  const box = await grid.locator("canvas.px-canvas").boundingBox();
  if (box === null) {
    throw new Error("no canvas");
  }
  // Pressed 1 px inside the edge and moved 61 px right, the column grows by 61 px.
  await page.mouse.move(box.x + first.right - 1, box.y + ROW / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + first.right + 60, box.y + ROW / 2, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => savedWidth(await layout(page), first.name)).toBeCloseTo(first.right - first.left + 61, 0);
});

test("a range copies as tab-separated rows", async ({ page }) => {
  await open(page, "preset=trades");
  await clickAt(page, 40, ROW + ROW / 2);
  await clickAt(page, 200, ROW * 3 + ROW / 2, ["Shift"]);
  const lines = (await copied(page)).split("\r\n");
  expect(lines).toHaveLength(3);
  expect(lines.every((line) => line.split("\t").length === 2)).toBe(true);
  expect(lines[0]?.split("\t")[0]).toBe("1");
});

test("copying more rows than are loaded fetches them first", async ({ page }) => {
  await open(page, "preset=pivot");
  await clickAt(page, 60, ROW + ROW / 2);
  await page.keyboard.press("ControlOrMeta+a");
  const text = await copied(page);
  expect(text.split("\r\n")).toHaveLength(await rowCount(page));
});

test("on a page that is not a secure context, rows fetched for a copy wait for a second Ctrl+C", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "isSecureContext", { value: false });
  });
  await open(page, "preset=pivot");
  await clickAt(page, 120, ROW + ROW / 2);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.locator(".px-status-message")).toContainText("press Ctrl+C again", { timeout: 30_000 });
  const text = await copied(page);
  expect(text.split("\r\n")).toHaveLength(await rowCount(page));
});

test("a copy beyond the cell limit is refused with a reason", async ({ page }) => {
  await open(page, "preset=trades");
  await clickAt(page, 40, ROW + ROW / 2);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  await expect(page.locator(".px-status-message")).toContainText("cells", { timeout: 30_000 });
});

test("the dark scheme sets its tokens", async ({ page }) => {
  await open(page, "preset=pivot&theme=dark");
  const grid = page.locator("px-grid").first();
  await expect(grid).toHaveAttribute("data-px-scheme", "dark");
  await expect(grid).toHaveAttribute("data-px-theme", "standard");
  const background = await grid.evaluate((element) => getComputedStyle(element).getPropertyValue("--_px-background").trim());
  expect(background).toBe("rgb(22, 24, 29)");
});

/** The colour of the canvas's pixel at `x`, `y`, in CSS pixels, as `r,g,b`. */
async function pixel(grid: Locator, x: number, y: number): Promise<string> {
  return grid.locator("canvas.px-canvas").evaluate(
    (canvas, at) => {
      if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("not a canvas");
      }
      const ratio = window.devicePixelRatio;
      const data = canvas.getContext("2d")?.getImageData(Math.round(at.x * ratio), Math.round(at.y * ratio), 1, 1).data;
      return data === undefined ? "" : `${String(data[0])},${String(data[1])},${String(data[2])}`;
    },
    { x, y }
  );
}

test("a token set on a wrapper or on :root reaches the canvas once the page's classes change", async ({ page }) => {
  await open(page, "preset=trades");
  const grid = page.locator("px-grid");
  // The header's corner, left of its first title.
  const header = (): Promise<string> => pixel(grid, 2, 2);
  expect(await header()).toBe("232,235,240");
  // A token on an element around the grid, as a host's wrapper would set it, then a dark class on <html>, as a host's
  // theme switch would: the grid reads its tokens again without any input changing.
  await page.locator("demo-root").evaluate((root) => {
    if (root instanceof HTMLElement) {
      root.style.setProperty("--px-header-background", "#ff0000");
    }
  });
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
  });
  await expect.poll(header).toBe("255,0,0");
  // On :root the token is overridden by the wrapper's, and wins once the wrapper's is gone.
  await page.addStyleTag({ content: ":root { --px-header-background: rgb(0, 0, 255); }" });
  await page.locator("demo-root").evaluate((root) => {
    if (root instanceof HTMLElement) {
      root.style.removeProperty("--px-header-background");
    }
  });
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
  });
  await expect.poll(header).toBe("0,0,255");
});

test("a row height set on :root sizes the grid's rows, and comfortable rows add their step to it", async ({ page }) => {
  await open(page, "preset=pivot");
  const scroll = page.locator(".px-scroll").first();
  const rows = await rowCount(page);
  const contentHeight = (): Promise<number> => scroll.evaluate((element) => element.scrollHeight);
  // The header is a row high, and the rows below it.
  expect(await contentHeight()).toBe((rows + 1) * 24);
  await page.addStyleTag({ content: ":root { --px-row-height: 40px; }" });
  await page.evaluate(() => {
    document.body.classList.add("tall");
  });
  await expect.poll(contentHeight).toBe((rows + 1) * 40);
  await page.getByLabel("Row height").selectOption("comfortable");
  await expect.poll(contentHeight).toBe((rows + 1) * 46);
});

test.describe("px-pivot", () => {
  test("removing a row group from the settings regroups the pivot", async ({ page }) => {
    await open(page, "preset=pivot");
    const before = await rowCount(page);
    await page.getByRole("button", { name: "Remove ticker" }).click();
    await expect.poll(async () => layout(page)).toMatchObject({ group_by: ["fund", "strategy", "sector"] });
    await expect.poll(() => rowCount(page)).toBeLessThan(before);
  });

  test("a value added from a field's menu becomes a column", async ({ page }) => {
    await open(page, "preset=pivot");
    await page.getByRole("button", { name: "Add quantity to" }).click();
    await page.getByRole("menuitem", { name: "Add to Values" }).click();
    await expect.poll(async () => layout(page)).toMatchObject({ measures: [{}, {}, {}, { aggregate: "sum", column: "quantity" }] });
    await expect(page.locator(".px-error")).toHaveCount(0);
  });

  test("a filter picked from the column's values narrows the pivot", async ({ page }) => {
    await open(page, "preset=pivot");
    const before = await rowCount(page);
    // A new filter opens its value list at once.
    const editor = await filterBy(page, "fund");
    const first = editor.locator("input[type=checkbox]").first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    await first.check();
    await expect.poll(() => rowCount(page)).toBeLessThan(before);
    // The list stays open, so a second value can be ticked straight away.
    await expect(editor.locator("input[type=checkbox]").nth(1)).toBeVisible();
    expect(await layout(page)).toMatchObject({ filters: [{ op: "in", values: [expect.any(String)] }] });
  });

  test("a filter that leaves fewer rows than were scrolled past shows them from the top", async ({ page }) => {
    await open(page, "preset=pivot");
    const before = await rowCount(page);
    const scroll = page.locator(".px-scroll").first();
    await scroll.evaluate((element) => {
      element.scrollTo({ top: element.scrollHeight });
    });
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const first = (await filterBy(page, "fund")).locator("input[type=checkbox]").first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    await first.check();
    await expect.poll(() => rowCount(page)).toBeLessThan(before / 2);
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(page.locator(".px-error")).toHaveCount(0);
  });

  test("double-clicking a value opens the rows behind its group", async ({ page }) => {
    await open(page, "preset=pivot");
    // Row 1 is the first fund; its first value sits just right of the group column.
    await page
      .locator("px-pivot-main canvas.px-canvas, .px-pivot-main > px-grid canvas.px-canvas")
      .first()
      .dblclick({ position: { x: 320, y: ROW * 2 + ROW / 2 } });
    const drawer = page.locator(".px-drill");
    // The first value column sits under the Bond pivot, so the drawer is the fund's bonds.
    await expect(drawer).toContainText("Rows behind Atlas Global Macro, Bond");
    await expect(drawer.locator(".px-status-rows")).toContainText("rows", { timeout: 30_000 });
    await expect(drawer.locator(".px-error")).toHaveCount(0);
  });

  test("a shared link reopens the same view", async ({ page }) => {
    await open(page, "preset=pivot");
    await page.getByRole("button", { name: "Remove ticker" }).click();
    await page.getByRole("button", { name: "Copy link to this view" }).click();
    await expect(page.getByRole("status").first()).toContainText("links to this view");
    const url = page.url();
    expect(url).toContain("layout=1.");
    await page.goto(url);
    await expect.poll(async () => layout(page)).toMatchObject({ group_by: ["fund", "strategy", "sector"] });
  });

  test("a link to a flat view opens a grid, whatever the preset", async ({ page }) => {
    await open(page, "preset=trades");
    await page.getByRole("button", { name: "Copy link to this view" }).click();
    await expect(page.getByRole("status").first()).toContainText("links to this view");
    const link = new URL(page.url()).searchParams.get("layout") ?? "";
    await page.goto(`/?preset=pivot&layout=${link}`);
    await expect(page.locator(".px-status-dataset")).toHaveText("trades", { timeout: 60_000 });
    await expect(page.locator("px-pivot")).toHaveCount(0);
  });

  test("a value picked as blank matches the empty groups", async ({ page }) => {
    await open(page, "preset=pivot");
    // sector has blanks in the generated positions.
    await page.getByRole("button", { name: "Remove fund" }).click();
    await page.getByRole("button", { name: "Remove strategy" }).click();
    const blank = (await filterBy(page, "sector")).locator("label", { hasText: "(blank)" }).locator("input");
    await expect(blank).toBeVisible({ timeout: 30_000 });
    await blank.check();
    await expect.poll(async () => layout(page)).toMatchObject({ filters: [{ column: "sector", op: "in", values: [null] }] });
    await expect(page.locator(".px-error")).toHaveCount(0);
  });

  test("a filter keeps every row until a value is picked, and its chip stays to pick one", async ({ page }) => {
    await open(page, "preset=pivot");
    const before = await rowCount(page);
    const first = (await filterBy(page, "fund")).locator("input[type=checkbox]").first();
    await expect(page.locator("px-pivot-filter-well .px-chip")).toHaveText(["fund: (All)"]);
    expect(lengthOf(await layout(page), "filters")).toBeLessThanOrEqual(0);
    await first.check();
    await expect.poll(() => rowCount(page)).toBeLessThan(before);
    // With its last value unticked the filter keeps every row again, and leaves the layout.
    await first.uncheck();
    await expect.poll(() => rowCount(page)).toBe(before);
    expect(lengthOf(await layout(page), "filters")).toBe(0);
    await expect(page.locator("px-pivot-filter-well .px-chip")).toHaveText(["fund: (All)"]);
  });

  test("dragging fields between the areas regroups the pivot", async ({ page }) => {
    await open(page, "preset=pivot");
    const columns = page.locator("px-pivot-well", { has: page.getByRole("heading", { name: "Columns" }) });
    const rows = page.locator("px-pivot-well", { has: page.getByRole("heading", { name: "Rows" }) });
    // Found with the field search, and dropped below the last chip, it goes at the end.
    await page.getByRole("searchbox", { name: "Find a field" }).fill("long");
    await page.locator(".px-field", { hasText: "long_short" }).dragTo(columns.locator(".px-well-chips"), { targetPosition: { x: 20, y: 31 } });
    await expect.poll(async () => listOf(await layout(page), "split_by")).toEqual(["asset_class", "long_short"]);
    // A chip dragged from Rows to Columns leaves the rows.
    await rows.locator(".px-chip", { hasText: "strategy" }).dragTo(columns.locator(".px-chip", { hasText: "asset_class" }), { targetPosition: { x: 20, y: 2 } });
    await expect.poll(async () => listOf(await layout(page), "split_by")).toEqual(["strategy", "asset_class", "long_short"]);
    expect(listOf(await layout(page), "group_by")).toEqual(["fund", "sector", "ticker"]);
    // Unticking a field takes it out of every area.
    await page.locator(".px-field", { hasText: "long_short" }).first().getByRole("checkbox").uncheck();
    await expect.poll(async () => listOf(await layout(page), "split_by")).toEqual(["strategy", "asset_class"]);
    await expect(page.locator(".px-error")).toHaveCount(0);
  });

  test("a measure's header opens its menu, which sorts the groups by it and shows it as a share", async ({ page }) => {
    await open(page, "preset=pivot");
    const canvas = page.locator(".px-pivot-main > px-grid canvas.px-canvas");
    await canvas.click({ position: { x: 320, y: ROW * 2 + ROW / 2 } });
    await page.keyboard.press("Alt+ArrowDown");
    const menu = page.locator("px-measure-menu");
    await expect(menu).toHaveAttribute("aria-label", "Value Sum of market_value_usd");
    await expect(menu.getByRole("menuitem").first()).toBeFocused();
    await menu.getByRole("menuitem", { name: "Sort largest first" }).click();
    await expect.poll(async () => layout(page)).toMatchObject({ group_sort: { by: { measure: 0 }, descending: true } });
    await page.keyboard.press("Alt+ArrowDown");
    await page.locator("px-measure-menu").getByRole("combobox", { name: "Show as" }).selectOption("percent_of_grand_total");
    await expect.poll(async () => layout(page)).toMatchObject({ measures: [{ show_as: "percent_of_grand_total" }, {}, {}] });
    await expect(page.locator(".px-error")).toHaveCount(0);
  });

  test("Collapse all and Expand all close and open every group", async ({ page }) => {
    await open(page, "preset=pivot");
    const before = await rowCount(page);
    await page.getByRole("button", { name: "Collapse all" }).click();
    await expect.poll(() => rowCount(page)).toBeLessThan(20);
    expect(await layout(page)).toMatchObject({ expand_depth: 0, expanded: [] });
    await page.getByRole("button", { name: "Expand all" }).click();
    await expect.poll(() => rowCount(page)).toBeGreaterThanOrEqual(before);
    expect(await layout(page)).toMatchObject({ expand_depth: 4 });
  });

  test("the drawer's toolbar searches the rows behind a value", async ({ page }) => {
    await open(page, "preset=pivot");
    await page.locator(".px-pivot-main > px-grid canvas.px-canvas").dblclick({ position: { x: 320, y: ROW * 2 + ROW / 2 } });
    const drawer = page.locator(".px-drill");
    const grid = drawer.locator('[role="grid"]');
    await expect(grid).toHaveAttribute("aria-rowcount", /^[1-9]\d*$/, { timeout: 30_000 });
    const all = Number(await grid.getAttribute("aria-rowcount"));
    // Its filters are what put the rows there, so they show in its title rather than as chips.
    await expect(drawer.locator("px-grid-toolbar .px-chip")).toHaveCount(0);
    await drawer.getByRole("searchbox", { name: "Search the grid" }).fill("Merger");
    await expect.poll(async () => Number(await grid.getAttribute("aria-rowcount"))).toBeLessThan(all);
    await expect(drawer.getByRole("button", { name: "Export", exact: true })).toBeVisible();
  });
});

test.describe("export", () => {
  test("Export to Excel downloads a workbook of the view", async ({ page }) => {
    await open(page, "preset=pivot");
    const download = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByRole("button", { name: "Export", exact: true }).first().click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^positions-\d{4}-\d{2}-\d{2}-\d{4}\.xlsx$/);
    const path = await file.path();
    const bytes = await import("node:fs").then((fs) => fs.readFileSync(path));
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
  });

  test("a refused export says why in the status bar", async ({ page }) => {
    // Answer the post as the server answers a refusal from another origin.
    await page.route("**/export", async (route) => {
      const token = new URLSearchParams(route.request().postData() ?? "").get("token") ?? "";
      const payload = JSON.stringify({ source: "parallax-export", token, error: "the view has 2000000 rows, more than the 1048576 an Excel sheet holds" });
      // An isolated page, as examples/experiment.toml serves it, shows a frame only from a server that agrees.
      await route.fulfill({ status: 422, contentType: "text/html", headers: { "cross-origin-embedder-policy": "require-corp" }, body: `<script>parent.postMessage(${payload}, "*");</script>` });
    });
    await open(page, "preset=pivot");
    await page.getByRole("button", { name: "Export", exact: true }).first().click();
    await expect(page.locator(".px-status-message")).toContainText("Export failed: the view has 2000000 rows");
  });

  test("CSV downloads every digit of the view", async ({ page }) => {
    await open(page, "preset=pivot");
    const download = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByRole("button", { name: "More export formats" }).first().click();
    await page.getByRole("menuitem", { name: /CSV/ }).click();
    const file = await download;
    const text = await import("node:fs").then(async (fs) => fs.readFileSync(await file.path(), "utf8"));
    expect(text.startsWith("\uFEFF")).toBe(true);
    const lines = text.slice(1).split("\n");
    expect(lines[0]?.startsWith("level,fund,strategy,sector,ticker,Bond | sum(market_value_usd),")).toBe(true);
    expect(lines[0]?.endsWith(",Total | count(*)")).toBe(true);
    expect(lines[1]?.startsWith("0,,,,,")).toBe(true);
  });
});

test.describe("toolbar", () => {
  test("a search narrows the rows, and the CSV export holds the same rows", async ({ page }) => {
    await page.goto("/?preset=small");
    const blotter = page.locator('section[data-table="blotter"]');
    await expect(blotter.locator('[role="grid"]')).toHaveAttribute("aria-rowcount", "500", { timeout: 60_000 });
    const search = blotter.getByRole("searchbox", { name: "Search the grid" });
    await search.fill("atlas");
    await expect.poll(async () => Number(await blotter.locator('[role="grid"]').getAttribute("aria-rowcount"))).toBeLessThan(500);
    const shown = Number(await blotter.locator('[role="grid"]').getAttribute("aria-rowcount"));
    expect(shown).toBeGreaterThan(0);
    const download = page.waitForEvent("download", { timeout: 60_000 });
    await blotter.getByRole("button", { name: "More export formats" }).click();
    await blotter.getByRole("menuitem", { name: /CSV/ }).click();
    const text = await import("node:fs").then(async (fs) => fs.readFileSync(await (await download).path(), "utf8"));
    expect(text.trim().split("\n").length).toBe(shown + 1);
    // Clearing the search brings every row back.
    await blotter.getByRole("button", { name: "Clear the search" }).click();
    await expect(blotter.locator('[role="grid"]')).toHaveAttribute("aria-rowcount", "500");
  });

  test("Ctrl+F in a grid puts the cursor in its search", async ({ page }) => {
    await open(page, "preset=trades");
    await page.locator("canvas.px-canvas").click({ position: { x: 40, y: 40 } });
    await page.keyboard.press("ControlOrMeta+f");
    await expect(page.getByRole("searchbox", { name: "Search the grid" })).toBeFocused();
  });

  test("a filter's chip says what it keeps, and removes it", async ({ page }) => {
    await open(page, "preset=pivot");
    const before = await rowCount(page);
    await (await filterBy(page, "fund")).locator("input[type=checkbox]").first().check();
    await expect.poll(() => rowCount(page)).toBeLessThan(before);
    await page.keyboard.press("Escape");
    const chip = page.locator("px-grid-toolbar .px-chip").first();
    await expect(chip).toContainText(":");
    await chip.getByRole("button", { name: /^Remove the filter/ }).click();
    await expect.poll(() => rowCount(page)).toBe(before);
    await expect(page.locator("px-grid-toolbar .px-chip")).toHaveCount(0);
  });
});

test.describe("header menu", () => {
  test("a header's funnel opens its menu, whose value list keeps the values ticked", async ({ page }) => {
    const section = await blotter(page);
    const grid = section.locator('[role="grid"]');
    // The second column's funnel, at the right of its header.
    const second = await headerOf(page, section, 1);
    await section.locator("canvas.px-canvas").click({ position: { x: second.right - 10, y: 12 } });
    const menu = page.locator("px-header-menu");
    await expect(menu).toBeVisible();
    const first = menu.locator("px-value-picker input[type=checkbox]").first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    await first.check();
    await expect.poll(async () => Number(await grid.getAttribute("aria-rowcount"))).toBeLessThan(500);
    await expect(section.locator("px-grid-toolbar .px-chip")).toHaveCount(1);
    // Escape closes the menu and gives the grid its focus back.
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(section.locator(".px-scroll")).toBeFocused();
  });

  test("Alt+Down opens the focused column's menu, and Hide column hides it", async ({ page }) => {
    const section = await blotter(page);
    const grid = section.locator('[role="grid"]');
    const columns = Number(await grid.getAttribute("aria-colcount"));
    await section.locator("canvas.px-canvas").click({ position: { x: 60, y: 40 } });
    await page.keyboard.press("Alt+ArrowDown");
    // The menu takes the focus, so Escape closes it and gives the grid its focus back.
    await expect(page.locator("px-header-menu").getByRole("menuitem").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("px-header-menu")).toHaveCount(0);
    await expect(section.locator(".px-scroll")).toBeFocused();
    await page.keyboard.press("Alt+ArrowDown");
    await page.getByRole("menuitem", { name: "Hide column" }).click();
    await expect(grid).toHaveAttribute("aria-colcount", String(columns - 1));
    await expect(page.locator("px-header-menu")).toHaveCount(0);
  });

  test("a condition filters the column, and does not contain says it keeps blanks", async ({ page }) => {
    await page.goto("/?preset=small");
    const section = page.locator('section[data-table="book"]');
    const grid = section.locator('[role="grid"]');
    await expect(grid).toHaveAttribute("aria-rowcount", "300", { timeout: 60_000 });
    // The book's second column, after its pinned ticker, is the fund, which is text; its funnel is at the right of its header.
    const fund = await headerOf(page, section, 1);
    expect(fund.name).toBe("fund");
    await section.locator("canvas.px-canvas").click({ position: { x: fund.right - 10, y: 12 } });
    const menu = page.locator("px-header-menu");
    const mode = menu.getByRole("combobox", { name: "Keep rows where" });
    await mode.selectOption("not_contains", { timeout: 10_000 });
    await expect(menu.getByText("Blank cells are kept, as in Excel.")).toBeVisible();
    await mode.selectOption("contains", { timeout: 10_000 });
    const value = menu.getByRole("textbox", { name: "Value" });
    await value.fill("atlas");
    await value.press("Enter");
    await expect.poll(async () => Number(await grid.getAttribute("aria-rowcount"))).toBeLessThan(300);
    await expect(section.locator("px-grid-toolbar .px-chip")).toContainText("contains atlas");
  });
});

test.describe("columns", () => {
  const colcount = async (page: Page): Promise<number> => Number(await page.locator('[role="grid"]').getAttribute("aria-colcount"));

  test("the chooser hides a column and moves another", async ({ page }) => {
    await open(page, "preset=trades");
    const before = await colcount(page);
    await page.getByRole("button", { name: "Columns" }).click();
    const chooser = page.locator("px-column-chooser");
    await chooser.getByRole("checkbox").first().uncheck();
    await expect.poll(() => colcount(page)).toBe(before - 1);
    // The second shown column moves up with Alt+Up.
    const second = chooser.getByRole("checkbox", { checked: true }).nth(1);
    const name = await second.locator("xpath=following-sibling::span").textContent();
    await second.focus();
    await page.keyboard.press("Alt+ArrowUp");
    await expect.poll(async () => listOf(await layout(page), "columns")[0]).toBe(name);
  });

  test("a pinned column stays put while the others scroll", async ({ page }) => {
    await open(page, "preset=trades");
    await page.getByRole("button", { name: "Columns" }).click();
    await page.getByRole("button", { name: "Pin fund" }).click();
    await expect.poll(async () => listOf(await layout(page), "pinned")).toEqual(["fund"]);
    await page.keyboard.press("Escape");
    await page.locator(".px-scroll").evaluate((element) => {
      element.scrollTo({ left: 900 });
    });
    // The first column on screen is still the fund: a cell there opens the fund's menu.
    await page.locator("canvas.px-canvas").click({ position: { x: 40, y: 40 } });
    await page.keyboard.press("Alt+ArrowDown");
    await expect(page.locator("px-header-menu")).toHaveAttribute("aria-label", "Column fund");
  });

  test("the totals row, which the grid also says in text, goes and comes back with Totals", async ({ page }) => {
    await page.goto("/?preset=small");
    const section = page.locator('section[data-table="blotter"]');
    await expect(section.locator('[role="grid"]')).toHaveAttribute("aria-rowcount", "500", { timeout: 60_000 });
    // The blotter counts its trades and totals their quantities.
    const totals = section.getByRole("button", { name: "Totals" });
    await expect(totals).toHaveAttribute("aria-pressed", "true");
    await expect(section.getByRole("status", { name: "Totals row" })).toContainText(/^Totals\. trade_id: 500; quantity: [\d,.]+/);
    await totals.click();
    await expect(section.getByRole("status", { name: "Totals row" })).toHaveCount(0);
    await totals.click();
    await expect(totals).toHaveAttribute("aria-pressed", "true");
    await expect(section.getByRole("status", { name: "Totals row" })).toContainText(/Totals\. .+: [\d,.()-]+/);
  });

  test("dragging a header moves its column; a click still sorts", async ({ page }) => {
    await open(page, "preset=trades");
    const first = await headerOf(page, page.locator("px-grid").first(), 0);
    const canvas = page.locator("canvas.px-canvas");
    const box = await canvas.boundingBox();
    if (box === null) {
      throw new Error("no canvas");
    }
    await page.mouse.move(box.x + 40, box.y + 12);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 12, { steps: 4 });
    await page.mouse.move(box.x + 380, box.y + 12, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => listOf(await layout(page), "columns").indexOf(first.name)).toBeGreaterThan(0);
    expect(lengthOf(await layout(page), "sort")).toBe(0);
  });
});

test.describe("grouping", () => {
  const rows = async (section: Locator): Promise<number> => Number(await section.locator('[role="grid"]').getAttribute("aria-rowcount"));

  test("Group by this column lists the rows under their groups, which collapse, expand, copy and export", async ({ page }) => {
    const section = await blotter(page);
    const grid = section.locator('[role="grid"]');
    const panel = section.locator("px-group-panel");
    // The blotter's fourth column is the fund; its menu groups by it.
    await section.locator("canvas.px-canvas").click({ position: { x: 40, y: 40 } });
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press("ArrowRight");
    }
    await page.keyboard.press("Alt+ArrowDown");
    const menu = page.locator("px-header-menu");
    await expect(menu).toHaveAttribute("aria-label", "Column fund");
    await menu.getByRole("menuitem", { name: "Group by this column" }).click();
    await expect(panel.locator(".px-chip")).toHaveText(["fund"]);
    // Every group is open: the 500 rows and a row for each fund above its rows.
    await expect.poll(() => rows(section)).toBeGreaterThan(500);
    const all = await rows(section);
    const funds = all - 500;
    await panel.getByRole("button", { name: "Collapse all" }).click();
    await expect(grid).toHaveAttribute("aria-rowcount", String(funds));
    await panel.getByRole("button", { name: "Expand all" }).click();
    await expect(grid).toHaveAttribute("aria-rowcount", String(all));
    // A group's cell copies its label and count, as the export writes it.
    await section.locator("canvas.px-canvas").click({ position: { x: 40, y: 36 } });
    await page.keyboard.press("ControlOrMeta+c");
    await expect(section.locator(".px-status-message")).toContainText("Copied", { timeout: 30_000 });
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^\S.* \(\d+\)$/);
    // The CSV holds each group, at level 1, and each row under it, at level 2.
    const download = page.waitForEvent("download", { timeout: 60_000 });
    await section.getByRole("button", { name: "More export formats" }).click();
    await section.getByRole("menuitem", { name: /CSV/ }).click();
    const text = await import("node:fs").then(async (fs) => fs.readFileSync(await (await download).path(), "utf8"));
    const lines = text.slice(1).trim().split("\n");
    expect(lines[0]?.startsWith("level,fund,")).toBe(true);
    expect(lines.filter((l) => l.startsWith("1,")).length).toBe(funds);
    expect(lines.filter((l) => l.startsWith("2,")).length).toBe(500);
  });

  test("a header dropped on the group panel groups by its column, and its chip ungroups it", async ({ page }) => {
    const section = await blotter(page);
    const panel = section.locator("px-group-panel");
    await expect(panel).toContainText("Drag a column header here");
    const canvas = await section.locator("canvas.px-canvas").boundingBox();
    const target = await panel.boundingBox();
    if (canvas === null || target === null) {
      throw new Error("no canvas or group panel");
    }
    await page.mouse.move(canvas.x + 40, canvas.y + 12);
    await page.mouse.down();
    await page.mouse.move(canvas.x + 70, canvas.y + 12, { steps: 3 });
    await page.mouse.move(target.x + 200, target.y + target.height / 2, { steps: 8 });
    await expect(panel).toHaveAttribute("data-drop", "true");
    await page.mouse.up();
    await expect(panel.locator(".px-chip")).toHaveCount(1);
    await expect.poll(() => rows(section)).toBeGreaterThan(500);
    await panel.getByRole("button", { name: /^Stop grouping by / }).click();
    await expect(panel.locator(".px-chip")).toHaveCount(0);
    await expect(section.locator('[role="grid"]')).toHaveAttribute("aria-rowcount", "500");
  });
});
