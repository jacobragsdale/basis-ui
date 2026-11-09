/* `<Pivot>`'s settings, its measure menu, its rows behind a value and its links: ported from the Angular demo's
 * grid.spec.ts, its px-pivot specs and the filter chip's, against the same 150,000 positions and reference pivot. The
 * grid the pivot draws through has its own specs, in tests/e2e/grid. */

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  canvasOf,
  errorCount as errors,
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
} from "./helpers.ts";

/** How many filters the page's layout holds, or -1 for none listed. */
async function filterCount(page: Page): Promise<number> {
  return lengthOf(await layout(page), "filters");
}

/** How far down the pivot's table is scrolled. */
async function scrolledTo(page: Page): Promise<number> {
  return pivotGrid(page).evaluate((element) => element.scrollTop);
}

/** The menu of a measure's header. */
function valueMenu(page: Page): Locator {
  return page.getByRole("dialog", { name: "Value Sum of market_value_usd" });
}

/** A field of the field list. */
function fieldLine(page: Page, name: string): Locator {
  return listNamed(page, "Fields").getByRole("listitem").filter({ hasText: name });
}

test("removing a row group from the settings regroups the pivot", async ({ page }) => {
  await open(page);
  const before = await rowCount(page);
  await page.getByRole("button", { name: "Remove ticker" }).click();
  await expect
    .poll(async () => layout(page))
    .toMatchObject({ group_by: ["fund", "strategy", "sector"] });
  await expect.poll(async () => rowCount(page)).toBeLessThan(before);
});

test("a value added from a field's menu becomes a column, a number as its mean", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Add quantity to" }).click();
  await page.getByRole("menuitem", { name: "Add to Values" }).click();
  await expect
    .poll(async () => layout(page))
    .toMatchObject({ measures: [{}, {}, {}, { aggregate: "mean", column: "quantity" }] });
  expect(await errors(page)).toBe(0);
});

test.describe("filters", () => {
  test("a filter picked from the column's values narrows the pivot", async ({ page }) => {
    await open(page);
    const before = await rowCount(page);
    // A new filter opens its value list at once.
    const values = valuesOf(await filterBy(page, "fund"));
    await expect(values.first()).toBeVisible({ timeout: 30_000 });
    await values.first().check();
    await expect.poll(async () => rowCount(page)).toBeLessThan(before);
    // The list stays open, so a second value can be ticked straight away.
    await expect(values.nth(1)).toBeVisible();
    expect(await layout(page)).toMatchObject({
      filters: [{ op: "in", values: [expect.any(String)] }],
    });
  });

  test("a filter that leaves fewer rows than were scrolled past shows them from the top", async ({
    page,
  }) => {
    await open(page);
    const before = await rowCount(page);
    await scrollToEnd(page);
    const first = valuesOf(await filterBy(page, "fund")).first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    await first.check();
    await expect.poll(async () => rowCount(page)).toBeLessThan(before / 2);
    await expect.poll(async () => scrolledTo(page)).toBe(0);
  });

  test("a value picked as blank matches the empty groups", async ({ page }) => {
    await open(page);
    // sector has blanks in the generated positions.
    await page.getByRole("button", { name: "Remove fund" }).click();
    await page.getByRole("button", { name: "Remove strategy" }).click();
    const editor = await filterBy(page, "sector");
    const blank = editor.getByRole("checkbox", { name: /^\(blank\)/u });
    await expect(blank).toBeVisible({ timeout: 30_000 });
    await blank.check();
    await expect
      .poll(async () => layout(page))
      .toMatchObject({ filters: [{ column: "sector", op: "in", values: [null] }] });
    expect(await errors(page)).toBe(0);
  });

  test("a filter keeps every row until a value is picked, and its chip stays to pick one", async ({
    page,
  }) => {
    await open(page);
    const before = await rowCount(page);
    const first = valuesOf(await filterBy(page, "fund")).first();
    await expect(listNamed(page, "Filters").getByRole("listitem")).toHaveText(["fund: (All)"]);
    expect(await filterCount(page)).toBeLessThanOrEqual(0);
    await first.check();
    await expect.poll(async () => rowCount(page)).toBeLessThan(before);
  });

  test("a filter whose last value is unticked keeps every row again, and its chip stays", async ({
    page,
  }) => {
    await open(page);
    const before = await rowCount(page);
    const first = valuesOf(await filterBy(page, "fund")).first();
    await first.check();
    await expect.poll(async () => rowCount(page)).toBeLessThan(before);
    await first.uncheck();
    await expect.poll(async () => rowCount(page)).toBe(before);
    expect(await filterCount(page)).toBe(0);
    await expect(listNamed(page, "Filters").getByRole("listitem")).toHaveText(["fund: (All)"]);
  });

  test("a filter's chip on the table's toolbar says what it keeps, and removes it", async ({
    page,
  }) => {
    await open(page);
    const before = await rowCount(page);
    await valuesOf(await filterBy(page, "fund"))
      .first()
      .check();
    await expect.poll(async () => rowCount(page)).toBeLessThan(before);
    await page.keyboard.press("Escape");
    const chip = page.locator("[data-slot=grid-filter-chip]");
    await expect(chip).toContainText("fund:");
    await chip.getByRole("button", { name: /^Remove the filter/u }).click();
    await expect.poll(async () => rowCount(page)).toBe(before);
    await expect(chip).toHaveCount(0);
  });
});

test.describe("dragging", () => {
  test("a field found with the search and dropped below an area's last chip goes at its end", async ({
    page,
  }) => {
    await open(page);
    const columns = listNamed(page, "Columns");
    const box = await columns.boundingBox();
    await page.getByRole("searchbox", { name: "Find a field" }).fill("long");
    await fieldLine(page, "long_short").dragTo(columns, {
      targetPosition: { x: 20, y: (box?.height ?? 0) - 3 },
    });
    await expect
      .poll(async () => listOf(await layout(page), "split_by"))
      .toStrictEqual(["asset_class", "long_short"]);
    expect(await errors(page)).toBe(0);
  });

  test("a chip dragged from Rows to Columns leaves the rows, and unticking a field takes it out of every area", async ({
    page,
  }) => {
    await open(page);
    await listNamed(page, "Rows")
      .getByRole("listitem")
      .filter({ hasText: "strategy" })
      .dragTo(listNamed(page, "Columns").getByRole("listitem").filter({ hasText: "asset_class" }), {
        targetPosition: { x: 20, y: 2 },
      });
    await expect
      .poll(async () => listOf(await layout(page), "split_by"))
      .toStrictEqual(["strategy", "asset_class"]);
    expect(listOf(await layout(page), "group_by")).toStrictEqual(["fund", "sector", "ticker"]);
    await fieldLine(page, "strategy").getByRole("checkbox").uncheck();
    await expect
      .poll(async () => listOf(await layout(page), "split_by"))
      .toStrictEqual(["asset_class"]);
    expect(await errors(page)).toBe(0);
  });
});

test("a chip moves a place with Alt+Down from its buttons, and the pivot regroups", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Options for fund" }).focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect
    .poll(async () => listOf(await layout(page), "group_by"))
    .toStrictEqual(["strategy", "fund", "sector", "ticker"]);
  await expect(page.getByRole("button", { name: "Options for fund" })).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "moved" })).toHaveText(
    "fund moved to 2 of 4 in Rows",
  );
});

test("a measure's header opens its menu, which sorts the groups by it and shows it as a share", async ({
  page,
}) => {
  await open(page);
  await canvasOf(page).click({ position: firstFund.value });
  await page.keyboard.press("Alt+ArrowDown");
  await expect(valueMenu(page).getByRole("menuitem").first()).toBeFocused();
  await valueMenu(page).getByRole("menuitem", { name: "Sort largest first" }).click();
  await expect
    .poll(async () => layout(page))
    .toMatchObject({ group_sort: { by: { measure: 0 }, descending: true } });
  // The menu closes and gives the grid its focus back, on the same cell.
  await expect(pivotGrid(page)).toBeFocused();
  await page.keyboard.press("Alt+ArrowDown");
  await valueMenu(page)
    .getByRole("combobox", { name: "Show as" })
    .selectOption("percent_of_grand_total");
  await expect
    .poll(async () => layout(page))
    .toMatchObject({ measures: [{ show_as: "percent_of_grand_total" }, {}, {}] });
});

test.describe("the rows behind a value", () => {
  test("double-clicking a value opens the rows behind its group", async ({ page }) => {
    await open(page);
    await canvasOf(page).dblclick({ position: firstFund.value });
    // The first value column sits under the Bond pivot, so the rows are the fund's bonds.
    const rows = page.getByRole("region", { name: "Rows behind Atlas Global Macro, Bond" });
    await expect(rows.locator("[data-slot=grid-status-rows]")).toContainText("rows", {
      timeout: 30_000,
    });
    expect(await rows.locator("[data-slot=grid-error]").count()).toBe(0);
  });

  test("their toolbar searches them", async ({ page }) => {
    await open(page);
    await canvasOf(page).dblclick({ position: firstFund.value });
    const rows = page.getByRole("region", { name: /^Rows behind /u });
    const grid = rows.getByRole("grid");
    await expect(grid).toHaveAttribute("aria-rowcount", /^[1-9]\d*$/u, { timeout: 30_000 });
    const all = await rowCount(rows);
    // Their filters are what put the rows there, so they show in the title rather than as chips.
    await expect(rows.locator("[data-slot=grid-filter-chip]")).toHaveCount(0);
    await rows.getByRole("searchbox", { name: "Search the grid" }).fill("Merger");
    await expect.poll(async () => rowCount(rows)).toBeLessThan(all);
    await expect(rows.getByRole("button", { exact: true, name: "Export" })).toBeVisible();
  });

  test("they close when the pivot's groups change", async ({ page }) => {
    await open(page);
    await canvasOf(page).dblclick({ position: firstFund.value });
    const rows = page.getByRole("region", { name: /^Rows behind /u });
    await expect(rows).toBeVisible();
    await page.getByRole("button", { name: "Remove ticker" }).click();
    await expect(rows).toHaveCount(0);
  });
});

test.describe("links", () => {
  test("a shared link reopens the same view", async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: "Remove ticker" }).click();
    await page.getByRole("button", { name: "Copy link to this view" }).click();
    await expect(page.getByRole("status").first()).toContainText("links to this view");
    const url = page.url();
    expect(url).toContain("layout=1.");
    await page.goto(url);
    await expect
      .poll(async () => layout(page))
      .toMatchObject({ group_by: ["fund", "strategy", "sector"] });
    await expect(listNamed(page, "Rows").getByRole("listitem")).toHaveText([
      "fund",
      "strategy",
      "sector",
    ]);
  });

  test("a link to a flat view opens a grid, whatever the preset", async ({ page }) => {
    await open(page, "preset=flat");
    await page.getByRole("button", { name: "Copy link to this view" }).click();
    await expect(page.getByRole("status").first()).toContainText("links to this view");
    const link = new URL(page.url()).searchParams.get("layout") ?? "";
    await open(page, `preset=pivot&layout=${link}`);
    await expect(pivotGrid(page)).toHaveAttribute("aria-rowcount", "150000");
    await expect(page.getByRole("complementary", { name: "Pivot settings" })).toHaveCount(0);
  });
});
