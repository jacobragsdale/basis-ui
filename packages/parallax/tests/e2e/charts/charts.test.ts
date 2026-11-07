/* `<Chart>` on the harness's charts page, as web/e2e/charts.spec.ts drives `<px-chart>`: every kind draws with a text
 * alternative, the legend hides and shows series, the crosshairs move together, the wheel zooms and a drag pans, and a
 * brush and a click narrow linked views. drawing.test.ts drives the technical card. */

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { drag, wheel } from "./gestures.ts";
import type { At } from "./gestures.ts";
import {
  card,
  centre,
  errorsOf,
  hoverMiddle,
  inked,
  inks,
  legendOf,
  linked,
  openCharts,
  plotOf,
  rowsIn,
  summaryOf,
  tipRows,
} from "./pages.ts";
import type { PlotBox } from "./pages.ts";

const kinds = [
  "Candlestick chart of date",
  "Line chart of close by ticker",
  "Line chart of close by ticker",
  "Candlestick chart of date",
  "Line chart of close, volume",
  "OHLC chart of date",
  "Area chart of close",
  "Stacked bar chart of sector by asset_class",
  "Horizontal bar chart of sector by long_short",
  "Histogram of beta by long_short",
  "Density of points of daily_pnl_usd",
  "Heatmap of sector by asset_class",
  "Donut chart of asset_class",
  "Pie chart of sector",
];

/** Each plot's accessible name, and the text alternative that describes it. */
async function namesAndWords(page: Page): Promise<readonly (readonly [string, string])[]> {
  return page.getByRole("application").evaluateAll((plots) =>
    plots.map((plot) => {
      const words = plot.ownerDocument.querySelector(
        `#${CSS.escape(plot.getAttribute("aria-describedby") ?? "")}`,
      );
      return [plot.getAttribute("aria-label") ?? "", words?.textContent ?? ""] as const;
    }),
  );
}

/** The legend's keys' colours. */
async function keyColours(entries: Locator): Promise<string[]> {
  return entries
    .locator('[aria-hidden="true"]')
    .evaluateAll((keys) => keys.map((key) => getComputedStyle(key).backgroundColor));
}

/** Whether toggling a series off inks less and keeps the other keys' colours, and toggling it on inks as before. */
async function togglesSeries(chart: Locator, entry: Locator): Promise<boolean> {
  const entries = legendOf(chart);
  const [before, ink] = [await keyColours(entries), await inked(chart.locator("canvas"))];
  await entry.click();
  await expect(entry).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => inked(chart.locator("canvas"))).toBeLessThan(ink);
  expect(await keyColours(entries)).toStrictEqual(before);
  await entry.click();
  await expect.poll(async () => inked(chart.locator("canvas"))).toBe(ink);
  return true;
}

/** Whether dragging left brings later days under the pointer. */
async function pansLater(page: Page, chart: Locator, at: PlotBox): Promise<boolean> {
  const title = chart.getByRole("tooltip").locator('[data-slot="chart-tip-title"]');
  await page.mouse.move(at.x, at.y);
  const before = await title.textContent();
  await drag(page, { from: at, to: { x: at.x - at.width / 4, y: at.y } });
  await page.mouse.move(at.x + 1, at.y);
  await page.mouse.move(at.x, at.y);
  await expect(title).not.toHaveText(before ?? "");
  return true;
}

/** Whether + zooms in and 0 shows everything again, from the keyboard. */
async function zoomsByKeys(page: Page, chart: Locator): Promise<boolean> {
  await plotOf(chart).focus();
  await page.keyboard.press("+");
  await expect(summaryOf(chart)).toContainText("zoomed");
  await page.keyboard.press("0");
  await expect(summaryOf(chart)).not.toContainText("zoomed");
  return true;
}

/** Whether Escape on a brushed chart drops the brush and lists every row again, the brush having selected more than an
 * eighth of `all` and fewer than half. */
async function brushCleared(chart: Locator, view: Locator, all: number): Promise<boolean> {
  await expect.poll(async () => rowsIn(view)).toBeLessThan(all / 2);
  expect(await rowsIn(view)).toBeGreaterThan(all / 8);
  await plotOf(chart).press("Escape");
  await expect(chart.locator('[data-slot="chart-brush"]')).toBeHidden();
  await expect.poll(async () => rowsIn(view)).toBe(all);
  return true;
}

/** Whether a click on a slice lists its positions, and a second lists them all again. */
async function selectsSlice(page: Page, plot: Locator, at: At): Promise<boolean> {
  const view = linked(page, "donut");
  await plot.click({ position: at });
  await expect(view.locator("h2")).toHaveText("Positions in Equity, the slice selected");
  await expect.poll(async () => rowsIn(view)).toBeLessThan(150_000);
  await plot.click({ position: at });
  await expect(view.locator('[data-slot="linked-rows"]')).toHaveText("150,000 rows");
  return true;
}

test("every chart kind draws its data, with a text alternative and no errors", async ({ page }) => {
  const errors = errorsOf(page);
  await openCharts(page);
  const described = await namesAndWords(page);
  expect(described.map(([name], index) => name.startsWith(kinds[index] ?? "?"))).toStrictEqual(
    kinds.map(() => true),
  );
  // The text alternative says what is drawn, and the values shown.
  expect(described.every(([, words]) => /\d/u.test(words))).toBe(true);
  // Axes alone ink a few thousand pixels; data inks far more.
  expect(Math.min(...(await inks(page)))).toBeGreaterThan(5000);
  await expect(page.locator('[data-slot="chart"] [role="alert"]')).toHaveCount(0);
  expect(errors).toStrictEqual([]);
});

test("the legend hides a series and shows it again, keeping the others' colours", async ({
  page,
}) => {
  await openCharts(page);
  const chart = card(page, "closes-log");
  await expect(legendOf(chart)).toHaveCount(3);
  await expect(togglesSeries(chart, legendOf(chart).nth(1))).resolves.toBe(true);
  await expect(legendOf(chart).nth(1)).toHaveAttribute("aria-pressed", "true");
});

test("hovering a line reads every ticker at the nearest day, and the candles follow the crosshair", async ({
  page,
}) => {
  await openCharts(page);
  const [line, candles] = [card(page, "closes-log"), card(page, "candles")];
  const at = await hoverMiddle(line);
  await expect(line.getByRole("tooltip").locator('[data-slot="chart-tip-title"]')).toHaveText(
    /\d/u,
  );
  // One row per ticker, each a value and the ticker's name.
  await expect(tipRows(line).locator("strong")).toHaveText(
    Array.from({ length: 3 }, () => /^-?[\d,.]+$/u),
  );
  await expect(tipRows(line).locator("span:last-child")).toHaveText([/NV/u, /QYE/u, /ZREZ/u]);
  // The candles, of the same dataset, x and axis, read the bucket under the same day.
  await expect(candles.locator('[data-slot="chart-crosshair"]')).toBeVisible();
  await expect(tipRows(candles)).toHaveCount(4);
  await page.mouse.move(at.x, at.top - 20);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("the wheel zooms, dragging pans, and a double-click or 0 shows everything", async ({
  page,
}) => {
  await openCharts(page);
  const candles = card(page, "candles");
  const at = await centre(plotOf(candles));
  await page.mouse.move(at.x, at.y);
  await wheel(page, 20, -100);
  // Zoomed in far enough, each candle is a day.
  await expect(summaryOf(candles)).toHaveText(/day candles, zoomed in/u);
  await expect(pansLater(page, candles, at)).resolves.toBe(true);
  await page.mouse.dblclick(at.x, at.y);
  await expect(summaryOf(candles)).not.toContainText("zoomed");
  await expect(zoomsByKeys(page, candles)).resolves.toBe(true);
});

test("Shift and drag on the candles lists the selected days, and Escape lists them all again", async ({
  page,
}) => {
  await openCharts(page);
  const [candles, days] = [card(page, "candles"), linked(page, "candles")];
  await expect(days.locator('[data-slot="linked-rows"]')).toHaveText(/^[\d,]+ rows$/u);
  const [all, at] = [await rowsIn(days), await centre(plotOf(candles))];
  const span = at.width / 8;
  await drag(page, { from: { x: at.x - span, y: at.y }, to: { x: at.x + span, y: at.y } }, true);
  await expect(candles.locator('[data-slot="chart-brush"]')).toBeVisible();
  await expect(days.locator("h2")).toHaveText("QYE's days in the selected candles");
  // A quarter of the plot holds about a quarter of the days.
  await expect(brushCleared(candles, days, all)).resolves.toBe(true);
});

test.describe("pies", () => {
  test("a donut's slices are sized by the measure, and its legend notes each share", async ({
    page,
  }) => {
    await openCharts(page);
    const donut = legendOf(card(page, "donut"));
    await expect(donut).toHaveText([/^Equity\s*\d+\.\d\d%$/u, /^Bond/u, /^Future/u, /^Option/u]);
    // Past seven sectors the engine puts the rest in Other, last.
    const pie = legendOf(card(page, "pie"));
    await expect(pie).toHaveCount(8);
    await expect(pie.last()).toContainText("Other");
  });

  test("clicking a slice lists its positions, and clicking it again lists them all", async ({
    page,
  }) => {
    await openCharts(page);
    const donut = card(page, "donut");
    const rows = linked(page, "donut").locator('[data-slot="linked-rows"]');
    await expect(rows).toHaveText("150,000 rows", { timeout: 60_000 });
    const box = await centre(plotOf(donut));
    // Equity, the largest slice, starts at twelve o'clock: just right of it, on the ring.
    const at = {
      x: box.width / 2 + 10,
      y: box.height / 2 - (Math.min(box.width, box.height) / 2 - 8) * 0.8,
    };
    await plotOf(donut).hover({ position: at });
    await expect(donut.getByRole("tooltip")).toContainText("Equity");
    await expect(selectsSlice(page, plotOf(donut), at)).resolves.toBe(true);
  });
});
