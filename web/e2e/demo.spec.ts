/** The demo's own controls: its views, theme, row density and the performance overlay. */

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

async function ready(page: Page): Promise<void> {
  await expect(page.locator('[role="grid"]').first()).toHaveAttribute("aria-rowcount", /^[1-9]\d*$/, { timeout: 120_000 });
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
});

test("every view opens from its tab, and the browser-held ones say so", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await ready(page);
  const titles = await page.getByRole("navigation", { name: "Views" }).getByRole("link").allTextContents();
  expect(titles).toEqual(["Positions pivot", "Pivot in the browser", "1,000,000 trades", "Largest trades", "Daily prices", "Small tables", "Dashboard", "Breakdowns", "Charts", "Technical analysis"]);
  for (const [title, where] of [
    ["1,000,000 trades", null],
    ["Daily prices", "in browser"],
    ["Pivot in the browser", "in browser"],
    ["Positions pivot", null]
  ] as const) {
    await page.getByRole("link", { name: title }).click();
    await ready(page);
    await expect(page.getByRole("link", { name: title })).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".px-error")).toHaveCount(0);
    if (where === null) {
      await expect(page.locator(".px-status-where")).toHaveCount(0);
    } else {
      await expect(page.locator(".px-status-where")).toHaveText(where);
    }
  }
  expect(errors).toEqual([]);
});

test("the theme and row density follow their pickers and survive moving to another view", async ({ page }) => {
  // A pivot, whose few thousand rows are short enough that the row height shows in the scroll height.
  await page.goto("/?preset=pivot");
  await ready(page);
  const token = (): Promise<string> => page.locator("px-grid").evaluate((element) => getComputedStyle(element).getPropertyValue("--_px-background").trim());
  const contentHeight = (): Promise<number> => page.locator(".px-scroll").evaluate((element) => element.scrollHeight);
  expect(await token()).toBe("rgb(255, 255, 255)");
  await page.getByLabel("Theme").selectOption("dark");
  await expect.poll(token).toBe("rgb(22, 24, 29)");
  const compact = await contentHeight();
  await page.getByLabel("Row height").selectOption("comfortable");
  await expect.poll(contentHeight).toBeGreaterThan(compact);
  await page.getByRole("link", { name: "Largest trades" }).click();
  await ready(page);
  await expect(page.getByRole("link", { name: "Largest trades" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByLabel("Theme")).toHaveValue("dark");
  await expect(page.getByLabel("Row height")).toHaveValue("comfortable");
  expect(await token()).toBe("rgb(22, 24, 29)");
});

test("the performance overlay measures the page and copies its report", async ({ page }) => {
  await page.goto("/?preset=trades");
  await ready(page);
  await page.getByRole("button", { name: "Performance" }).click();
  const figure = (key: string): Locator => page.locator(`demo-performance [data-figure="${key}"]`);
  await expect(figure("frame")).toContainText("median", { timeout: 10_000 });
  // Scrolling draws and asks for rows, which gives the drawing and request-to-draw figures.
  for (const top of [2_000, 20_000, 200_000, 2_000_000]) {
    await page.locator(".px-scroll").evaluate((element, to) => {
      element.scrollTo({ top: to });
    }, top);
    await page.waitForTimeout(300);
  }
  await expect(figure("latency")).toContainText("median", { timeout: 10_000 });
  await expect(figure("draw")).toContainText(/[\d.]+ ms per frame/, { timeout: 10_000 });
  // The heap figure shows at once; the whole tab's, which an isolated page allows, arrives when the browser answers.
  await expect(figure("memory")).toContainText("MB", { timeout: 10_000 });
  await expect(figure("memory-scope")).toHaveText(/^(whole tab, workers included|JavaScript heap of the page, without workers or canvases)$/);
  await page.locator("demo-performance").getByRole("button", { name: "Copy report" }).click();
  await expect(page.locator("demo-performance [role=status]")).toHaveText("Copied");
  const report = await page.evaluate(() => navigator.clipboard.readText());
  expect(report).toContain("parallax performance report");
  expect(report).toContain("Showing: trades, grid, light theme, compact rows");
  expect(report).toMatch(/Rows asked to drawn: [\d.]+ ms median/);
  // examples/experiment.toml isolates the page, but a server already running may not.
  const isolated = await page.evaluate(() => crossOriginIsolated);
  expect(report).toContain(`Cross-origin isolated: ${isolated ? "yes" : "no"}`);
  expect(report).toMatch(/Memory: \d+ MB/);
});

test("the small tables open in their places, and the overlay times each one from input to screen", async ({ page }) => {
  await page.goto("/?preset=small");
  const book = page.locator('section[data-table="book"]');
  const blotter = page.locator('section[data-table="blotter"]');
  for (const [table, rows] of [
    [book, "300"],
    [blotter, "500"]
  ] as const) {
    await expect(table.locator('[role="grid"]')).toHaveAttribute("aria-rowcount", new RegExp(`^${rows}$`), { timeout: 120_000 });
  }
  await expect(book.locator(".px-status-where")).toHaveText("in browser");
  await expect(blotter.locator(".px-status-where")).toHaveCount(0);
  await page.getByRole("button", { name: "Performance" }).click();
  const figure = (key: string): Locator => page.locator(`demo-performance [data-figure="${key}"]`);
  await expect(figure("first-rows-book")).toContainText("after opening", { timeout: 10_000 });
  await expect(figure("first-rows-blotter")).toContainText("after opening");
  // Inputs count from when the overlay opened, so sorting now gives each grid its input-to-screen figure.
  for (const table of [book, blotter]) {
    for (let click = 0; click < 3; click += 1) {
      await table.locator("canvas.px-canvas").click({ position: { x: 40, y: 12 } });
      await page.waitForTimeout(150);
    }
  }
  await expect(figure("input-book")).toContainText(/ms median, [\d.]+ ms p95 of \d+ changes/, { timeout: 10_000 });
  await expect(figure("input-blotter")).toContainText(/ms median, [\d.]+ ms p95 of \d+ changes/, { timeout: 10_000 });
  await page.locator("demo-performance").getByRole("button", { name: "Copy report" }).click();
  const report = await page.evaluate(() => navigator.clipboard.readText());
  expect(report).toContain("Showing: book and blotter, grids, light theme, compact rows");
  expect(report).toMatch(/Input to screen \(book\): [\d.]+ ms median/);
  expect(report).toMatch(/Input to screen \(blotter\): [\d.]+ ms median/);
});

test("a table of a few hundred rows is held whole, so scrolling it and copying from it ask for nothing", async ({ page }) => {
  let sent = 0;
  page.on("websocket", (socket) => {
    socket.on("framesent", () => {
      sent += 1;
    });
  });
  await page.goto("/?preset=small");
  // The blotter runs on the server, so its requests cross the socket.
  const blotter = page.locator('section[data-table="blotter"]');
  await expect(blotter.locator('[role="grid"]')).toHaveAttribute("aria-rowcount", "500", { timeout: 120_000 });
  // The first rows are what is in view; the whole table follows them.
  await expect
    .poll(async () => {
      const before = sent;
      await page.waitForTimeout(300);
      return sent - before;
    })
    .toBe(0);
  const quiet = sent;
  const scroll = blotter.locator(".px-scroll");
  await scroll.evaluate((element) => {
    element.scrollTo({ top: element.scrollHeight });
  });
  await page.waitForTimeout(300);
  const canvas = blotter.locator("canvas.px-canvas");
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error("the blotter's canvas is not on the page");
  }
  // The last row sits just above the totals row.
  await canvas.click({ position: { x: 40, y: box.height - 36 } });
  await page.keyboard.press("ControlOrMeta+c");
  await expect(blotter.locator(".px-status-message")).toContainText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\S/);
  await scroll.evaluate((element) => {
    element.scrollTo({ top: element.scrollHeight / 2 });
  });
  await page.waitForTimeout(300);
  expect(sent).toBe(quiet);
});

test.describe("dashboard", () => {
  /** The middle of a donut tile's largest slice, which starts at twelve o'clock, on its ring. */
  async function largestSlice(page: Page, tile: string): Promise<{ readonly plot: Locator; readonly at: { readonly x: number; readonly y: number } }> {
    const plot = page.locator(`section[data-tile="${tile}"] .px-chart-plot`);
    const box = await plot.boundingBox();
    if (box === null) {
      throw new Error(`no ${tile} chart`);
    }
    const radius = Math.min(box.width, box.height) / 2 - 4;
    return { plot, at: { x: box.width / 2 + 6, y: box.height / 2 - radius * 0.8 } };
  }

  test("a slice clicked filters its table's grid, whose export holds the rows shown, and a second click shows them all", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/?preset=dashboard");
    const book = page.locator('section[data-table="book"]');
    const grid = book.locator('[role="grid"]');
    await expect(grid).toHaveAttribute("aria-rowcount", "300", { timeout: 120_000 });
    await expect(page.locator("demo-dashboard px-chart")).toHaveCount(5);
    await expect(page.locator("demo-dashboard .px-error")).toHaveCount(0);
    // Small tiles keep no status bar of their own.
    for (const bar of await page.locator("demo-dashboard px-chart px-status-bar").all()) {
      await expect(bar).toBeHidden();
    }
    const { plot, at } = await largestSlice(page, "asset-class");
    await plot.click({ position: at });
    await expect(book.locator("px-grid-toolbar .px-chip")).toHaveText(["asset_class = Equity"]);
    const shown = Number(await grid.getAttribute("aria-rowcount"));
    expect(shown).toBeLessThan(300);
    const download = page.waitForEvent("download", { timeout: 60_000 });
    await book.getByRole("button", { name: "More export formats" }).click();
    await book.getByRole("menuitem", { name: /CSV/ }).click();
    const text = await import("node:fs").then(async (fs) => fs.readFileSync(await (await download).path(), "utf8"));
    expect(text.trim().split("\n").length).toBe(shown + 1);
    await plot.click({ position: at });
    await expect(grid).toHaveAttribute("aria-rowcount", "300");
    await expect(book.locator("px-grid-toolbar .px-chip")).toHaveCount(0);
    // The blotter's chart filters the blotter.
    const side = await largestSlice(page, "trades-by-side");
    await side.plot.click({ position: side.at });
    await expect(page.locator('section[data-table="blotter"] px-grid-toolbar .px-chip')).toHaveText(["side = Buy"]);
    expect(errors).toEqual([]);
  });
});

test.describe("breakdowns", () => {
  /** A point on the largest slice of a pie, which starts at twelve o'clock, inside its rim. */
  async function largestSlice(page: Page, chart: string): Promise<{ readonly plot: Locator; readonly at: { readonly x: number; readonly y: number } }> {
    const plot = page.locator(`section[data-breakdown="${chart}"] .px-chart-plot`);
    const box = await plot.boundingBox();
    if (box === null) {
      throw new Error(`no ${chart} chart`);
    }
    const radius = Math.min(box.width, box.height) / 2 - 16;
    return { plot, at: { x: box.width / 2 + 10, y: box.height / 2 - radius * 0.8 } };
  }

  test("draws ten big pies, donuts and bars, and a click narrows the other charts of its dataset until its chip clears it", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/?preset=breakdowns");
    const sections = page.locator("demo-breakdowns section[data-breakdown]");
    await expect(sections).toHaveCount(10);
    await expect(page.locator("demo-breakdowns .px-status-rows").filter({ hasText: "loading" })).toHaveCount(0, { timeout: 120_000 });
    await expect(page.locator("demo-breakdowns .px-error")).toHaveCount(0);
    expect((await sections.first().boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(400);
    const filtered = (id: string): Locator => page.locator(`section[data-breakdown="${id}"]`);
    // The largest region, North America, narrows every other positions chart, and none of the trades'.
    const region = await largestSlice(page, "notional-by-region");
    await region.plot.click({ position: region.at });
    const chip = page.locator('[data-dataset="positions"] .chip');
    await expect(chip).toContainText("region: North America");
    await expect(filtered("pnl-by-strategy")).toHaveAttribute("data-filtered", "true");
    await expect(filtered("notional-by-region")).toHaveAttribute("data-filtered", "false");
    await expect(filtered("trades-by-status")).toHaveAttribute("data-filtered", "false");
    await expect(page.locator('[data-dataset="trades"] .chip')).toHaveCount(0);
    // Another chart's pick replaces it: the region donut is narrowed now, to the largest fund.
    const fund = await largestSlice(page, "positions-by-fund");
    await fund.plot.click({ position: fund.at });
    await expect(chip).toContainText("fund: ");
    await expect(filtered("notional-by-region")).toHaveAttribute("data-filtered", "true");
    await expect(filtered("positions-by-fund")).toHaveAttribute("data-filtered", "false");
    await chip.click();
    await expect(chip).toHaveCount(0);
    await expect(page.locator('demo-breakdowns section[data-filtered="true"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
