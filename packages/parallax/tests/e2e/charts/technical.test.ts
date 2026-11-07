/* The harness's technical-analysis page, as web/e2e/technical.spec.ts drives the Angular demo's: its controls remake
 * the chart, which keeps its zoom, brush and drawings where they still fit, and its days follow a brush. The Angular
 * demo's header link, which this page has no header for, is left out. */

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { drag, wheel } from "./gestures.ts";
import {
  centre,
  errorsOf,
  legendOf,
  linked,
  open,
  plotOf,
  rowsIn,
  summaryOf,
  tipLabels,
  tipRows,
} from "./pages.ts";
import type { PlotBox } from "./pages.ts";

/** Opens the technical page, returning its chart once it has drawn. */
async function openTechnical(page: Page): Promise<Locator> {
  await open(page, "/?page=technical", 1);
  return page.locator('[data-slot="technical-chart"] [data-slot="chart"]');
}

/** The middle of the chart's price, the top of its plot above the panes. */
async function priceOf(chart: Locator): Promise<PlotBox> {
  const box = await centre(plotOf(chart));
  return { ...box, y: box.top + box.height * 0.2 };
}

/** The labels of the tooltip's rows at the middle of the price. */
async function readout(page: Page, chart: Locator): Promise<string[]> {
  const at = await priceOf(chart);
  await page.mouse.move(at.x, at.y);
  await expect(chart.getByRole("tooltip")).toBeVisible();
  return tipLabels(chart.getByRole("tooltip"));
}

/** Brushes from `from` to `to`, as shares of the plot's width, across the price. */
async function brush(
  page: Page,
  chart: Locator,
  [from, to]: readonly [number, number],
): Promise<void> {
  const at = await priceOf(chart);
  const [left, right] = [at.left + at.width * from, at.left + at.width * to];
  await drag(page, { from: { x: left, y: at.y }, to: { x: right, y: at.y } }, true);
}

/** The close the tooltip reads at the middle of the price. */
async function closeAt(page: Page, chart: Locator): Promise<number> {
  const at = await priceOf(chart);
  await page.mouse.move(at.x, at.y);
  const text = await tipRows(chart).filter({ hasText: "Close" }).locator("strong").textContent();
  return Number(text?.replaceAll(",", "") ?? "NaN");
}

/** Whether turning an indicator on keeps the zoom, the brush and the rows it selects. */
async function keepsZoomAndBrush(page: Page, chart: Locator, narrowed: number): Promise<boolean> {
  await page.getByLabel("WMA 20").check();
  await expect(legendOf(chart).filter({ hasText: "WMA 20" })).toBeVisible();
  await expect(summaryOf(chart)).toContainText("zoomed in");
  await expect(chart.locator('[data-slot="chart-brush"]')).toBeVisible();
  expect(await rowsIn(linked(page, "technical"))).toBe(narrowed);
  return true;
}

/** Whether another start date draws other rows: everything shown, unbrushed, with more days than `all`. */
async function startsAfresh(page: Page, chart: Locator, all: number): Promise<boolean> {
  await page.getByRole("combobox", { name: "Since" }).selectOption("2020-01-01");
  await expect(summaryOf(chart)).not.toContainText("zoomed in");
  await expect(chart.locator('[data-slot="chart-brush"]')).toBeHidden();
  await expect.poll(async () => rowsIn(linked(page, "technical"))).toBeGreaterThan(all);
  return true;
}

test("the controls start where they say, and an indicator turned off leaves the chart", async ({
  page,
}) => {
  const errors = errorsOf(page);
  const chart = await openTechnical(page);
  await expect(page.getByRole("combobox", { name: "Since" })).toHaveValue("2024-01-01");
  await expect(page.getByRole("combobox", { name: "Chart kind" })).toHaveValue("candlestick");
  expect(await readout(page, chart)).toContain("RSI 14");
  await page.getByLabel("RSI 14").uncheck();
  await expect.poll(async () => readout(page, chart)).not.toContain("RSI 14");
  await page.getByLabel("ATR 14").check();
  await expect.poll(async () => readout(page, chart)).toContain("ATR 14");
  expect(errors).toStrictEqual([]);
});

test("comparing three tickers reads percentages and turns off what does not fit", async ({
  page,
}) => {
  const chart = await openTechnical(page);
  await page.getByLabel("Compare three tickers").check();
  // Averages are in prices and ATR needs candles: neither fits a comparison.
  await expect(page.getByLabel("SMA 50")).toBeDisabled();
  await expect(page.getByLabel("ATR 14")).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Ticker" })).toBeDisabled();
  const at = await priceOf(chart);
  await page.mouse.move(at.x, at.y);
  await expect(tipRows(chart).locator("strong").first()).toHaveText(/%$/u);
});

test("Shift and drag lists the brushed days, and another ticker shows all of its own", async ({
  page,
}) => {
  const chart = await openTechnical(page);
  const days = linked(page, "technical");
  await expect(days.locator('[data-slot="linked-rows"]')).toHaveText(/^[\d,]+ rows$/u);
  const all = await rowsIn(days);
  await brush(page, chart, [0.4, 0.6]);
  await expect.poll(async () => rowsIn(days)).toBeLessThan(all / 2);
  await page.getByRole("combobox", { name: "Ticker" }).selectOption("NV");
  await expect.poll(async () => rowsIn(days)).toBe(all);
  // NV trades near 50, QYE near 10,000: the chart is NV's now.
  await expect.poll(async () => closeAt(page, chart)).toBeLessThan(1000);
});

test("an indicator keeps the zoom and the brush; another start date shows everything again", async ({
  page,
}) => {
  const chart = await openTechnical(page);
  const days = linked(page, "technical");
  const at = await priceOf(chart);
  await page.mouse.move(at.x, at.y);
  await wheel(page, 5, -100);
  await expect(summaryOf(chart)).toContainText("zoomed in");
  const all = await rowsIn(days);
  await drag(page, { from: { x: at.x - 60, y: at.y }, to: { x: at.x + 60, y: at.y } }, true);
  await expect.poll(async () => rowsIn(days)).toBeLessThan(all);
  await expect(
    keepsZoomAndBrush(page, chart, await rowsIn(days)).then(async () =>
      startsAfresh(page, chart, all),
    ),
  ).resolves.toBe(true);
});
