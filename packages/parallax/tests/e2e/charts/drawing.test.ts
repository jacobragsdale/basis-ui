/* The charts page's technical card and comparison, as web/e2e/charts.spec.ts drives them: indicator panes and their
 * readings, the drawing tools, the measure tool, and a comparison's percentage changes and events. */

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { drag, sweepFor } from "./gestures.ts";
import type { At } from "./gestures.ts";
import {
  card,
  centre,
  hoverMiddle,
  inked,
  legendOf,
  openCharts,
  plotOf,
  tipLabels,
  tipRows,
} from "./pages.ts";
import type { PlotBox } from "./pages.ts";

/** The labels the technical card's tooltip reads: the candle's prices and volume, then every indicator line. */
const technicalReadings = [
  "Open",
  "High",
  "Low",
  "Close",
  "Volume",
  "SMA 50",
  "BB 20 2 upper",
  "BB 20 2 middle",
  "BB 20 2 lower",
  "RSI 14",
  "MACD",
  "Signal",
  "Histogram",
];

/** A point on the technical card's price, the top of its plot above the panes. */
function onPrice(box: PlotBox): At {
  return { x: box.x, y: box.top + box.height * 0.2 };
}

/** Moves the pointer off the chart, so no tooltip covers what is drawn. */
async function away(page: Page, box: PlotBox): Promise<void> {
  await page.mouse.move(box.x, box.top - 200);
}

/** What the canvas inks with the pointer away from it. */
async function inkedAway(page: Page, chart: Locator): Promise<number> {
  await away(page, await centre(plotOf(chart)));
  return inked(chart.locator("canvas"));
}

/** Draws a trend line across the price, checking the tool is put down and the line selected after. */
async function drawTrend(page: Page, chart: Locator, box: PlotBox): Promise<void> {
  const trend = chart.getByRole("button", { name: "Trend line" });
  await expect(chart.getByRole("button", { name: "Delete drawing" })).toBeDisabled();
  await trend.click();
  await expect(trend).toHaveAttribute("aria-pressed", "true");
  const at = onPrice(box);
  const span = box.width / 4;
  await drag(page, {
    from: { x: at.x - span, y: at.y + 40 },
    to: { x: at.x + span, y: at.y - 30 },
  });
  await expect(chart.getByRole("button", { name: "Delete drawing" })).toBeEnabled();
  await expect(trend).toHaveAttribute("aria-pressed", "false");
}

/** Whether Delete removes the selected drawing, the canvas then inking `before`. */
async function deletes(page: Page, chart: Locator, before: number): Promise<boolean> {
  await plotOf(chart).focus();
  await page.keyboard.press("Delete");
  await expect(chart.getByRole("button", { name: "Delete drawing" })).toBeDisabled();
  await expect.poll(async () => inkedAway(page, chart)).toBe(before);
  return true;
}

/** Places a note on the price, typing its text. */
async function placeNote(page: Page, chart: Locator, box: PlotBox): Promise<void> {
  await chart.getByRole("button", { name: "Note" }).click();
  const at = onPrice(box);
  await page.mouse.click(at.x, at.y);
  const text = chart.getByRole("textbox", { name: "Note text" });
  await expect(text).toBeFocused();
  await text.fill("Breakout");
  await text.press("Enter");
  await expect(text).toHaveCount(0);
}

test("the technical card stacks RSI, MACD and volume under the candles, and its tooltip reads every indicator", async ({
  page,
}) => {
  await openCharts(page);
  const chart = card(page, "technical");
  await expect(legendOf(chart)).toHaveText(["SMA 50", "BB 20 2"]);
  // Panes add their own inked area under the price.
  expect(await inked(chart.locator("canvas"))).toBeGreaterThan(40_000);
  const at = await hoverMiddle(chart);
  await expect(chart.getByRole("tooltip").locator('[data-slot="chart-tip-title"]')).toHaveText(
    /^Week of \d{4}-\d{2}-\d{2}$/u,
  );
  expect(await tipLabels(chart.getByRole("tooltip"))).toStrictEqual(technicalReadings);
  // Hiding the bands takes them out of the tooltip too.
  await legendOf(chart).filter({ hasText: "BB 20 2" }).click();
  await page.mouse.move(at.x + 1, at.y);
  await expect(tipRows(chart)).toHaveCount(10);
});

test("the drawing tools draw a trend line and a note, select one and delete it", async ({
  page,
}) => {
  await openCharts(page);
  const chart = card(page, "technical");
  const box = await centre(plotOf(chart));
  const before = await inkedAway(page, chart);
  await drawTrend(page, chart, box);
  await expect.poll(async () => inkedAway(page, chart)).not.toBe(before);
  // Delete removes it, and the chart draws as before.
  await expect(deletes(page, chart, before)).resolves.toBe(true);
  // A note asks for its text and keeps it on Enter, selected.
  await placeNote(page, chart, box);
  await expect(chart.getByRole("button", { name: "Delete drawing" })).toBeEnabled();
  await expect.poll(async () => inkedAway(page, chart)).not.toBe(before);
});

test("compare mode reads percentage changes, and events show in the tooltip", async ({ page }) => {
  await openCharts(page);
  // A comparison's every value is a percentage change.
  const compare = card(page, "compare");
  await hoverMiddle(compare);
  const values = tipRows(compare).locator("strong");
  await expect(values.first()).toHaveText(/%$/u);
  const texts = await values.allTextContents();
  expect(texts.every((value) => /^-?[\d,.]+%$|^[A-Z]/u.test(value))).toBe(true);
  // Across the technical card's weekly candles, some week reports earnings.
  const [technical, box] = [card(page, "technical"), await centre(plotOf(card(page, "technical")))];
  const swept = {
    end: box.left + box.width - 10,
    words: "earnings",
    x: box.left + 60,
    y: onPrice(box).y,
  };
  expect(await sweepFor(page, technical, swept)).toBe(true);
});

test("the measure tool shows what the engine measured across a band, and Escape puts it away", async ({
  page,
}) => {
  await openCharts(page);
  const technical = card(page, "technical");
  const box = await centre(plotOf(technical));
  const { y } = onPrice(box);
  await technical.getByRole("button", { name: "Measure" }).click();
  await drag(page, {
    from: { x: box.x - box.width / 4, y },
    to: { x: box.x + box.width / 8, y: y - 20 },
  });
  const measured = technical.locator('[data-slot="chart-measure"]');
  // The change and its percentage, the bars across, and the values at each end.
  await expect(measured).toContainText(/%\)\s*change[\s\S]*\d+\s*bars[\s\S]*→/u);
  // Escape puts it away.
  await plotOf(technical).press("Escape");
  await expect(measured).toHaveCount(0);
});
