/* What the specs share: opening a harness page once its charts have drawn, finding a chart and its parts, counting what
 * its canvas inks, and the middle of its plot. */

import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/** How many charts the charts page shows. */
const chartCount = 14;

/** How many pixels of a canvas differ from its top-left pixel, the surface. */
async function inked(canvas: Locator): Promise<number> {
  return canvas.evaluate((element) => {
    const context = element instanceof HTMLCanvasElement ? element.getContext("2d") : null;
    if (context === null) {
      return 0;
    }
    const { width, height } = context.canvas;
    // A pixel's four channels as one number: the canvas is opaque, so only its colour can differ.
    const pixels = new Uint32Array(context.getImageData(0, 0, width, height).data.buffer);
    const [surface] = pixels;
    return pixels.filter((pixel) => pixel !== surface).length;
  });
}

/** What every chart on the page inks. */
async function inks(page: Page): Promise<readonly number[]> {
  const canvases = await page.locator('[data-slot="chart-plot"] canvas').all();
  return Promise.all(canvases.map(async (canvas) => inked(canvas)));
}

/** The chart of a charts-page card, by the card's id. */
function card(page: Page, id: string): Locator {
  return page.locator(`section[data-card="${id}"] [data-slot="chart"]`);
}

/** The plot of a chart, which takes the pointer and the keys. */
function plotOf(chart: Locator): Locator {
  return chart.locator('[data-slot="chart-plot"]');
}

/** What a chart's status line says it draws. */
function summaryOf(chart: Locator): Locator {
  return chart.locator('[data-slot="chart-summary"]');
}

/** A chart's legend entries. */
function legendOf(chart: Locator): Locator {
  return chart.getByRole("group", { name: "Series" }).getByRole("button");
}

/** A chart's tooltip's rows. */
function tipRows(chart: Locator): Locator {
  return chart.getByRole("tooltip").locator('[data-slot="chart-tip-row"]');
}

/** A view a chart narrows, by the chart that narrows it. */
function linked(page: Page, by: string): Locator {
  return page.locator(`section[data-linked="${by}"]`);
}

/** How many rows a linked view says it has. */
async function rowsIn(view: Locator): Promise<number> {
  const text = await view.locator('[data-slot="linked-rows"]').textContent();
  return Number(text?.replaceAll(/\D/gu, "") ?? "0");
}

/** Waits until `count` charts on the page say what they draw, which they say once they have their data. */
async function drawn(page: Page, count: number): Promise<void> {
  const summaries = page.locator('[data-slot="chart-summary"]');
  await expect(summaries).toHaveCount(count);
  await expect(summaries.filter({ hasNotText: "loading", hasText: /\w/u })).toHaveCount(count, {
    timeout: 120_000,
  });
}

/** Opens a harness page and waits for its charts to draw. */
async function open(page: Page, path: string, count: number): Promise<void> {
  await page.goto(path);
  await drawn(page, count);
}

/** Opens the charts page. */
async function openCharts(page: Page): Promise<void> {
  await open(page, "/?page=charts", chartCount);
}

/** A plot's box, and its middle, in page pixels. */
interface PlotBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly left: number;
}

/** The middle of a plot, in page pixels, scrolled into view, since mouse coordinates are the viewport's. */
async function centre(plot: Locator): Promise<PlotBox> {
  await plot.scrollIntoViewIfNeeded();
  const box = await plot.boundingBox();
  if (box === null) {
    throw new Error("the plot is not on the page");
  }
  return {
    height: box.height,
    left: box.x,
    top: box.y,
    width: box.width,
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

/** Moves the pointer to the middle of a chart's plot, returning the plot's box. */
async function hoverMiddle(chart: Locator): Promise<PlotBox> {
  const at = await centre(plotOf(chart));
  await chart.page().mouse.move(at.x, at.y);
  return at;
}

/** A tooltip's rows' labels, the dates some end with cut off. */
async function tipLabels(tip: Locator): Promise<string[]> {
  const labels = await tip.locator('[data-slot="chart-tip-row"] span:last-child').allTextContents();
  return labels.map((label) => label.replace(/, \d{4}-\d{2}-\d{2}$/u, ""));
}

/** Collects the page's uncaught errors, to check there were none. */
function errorsOf(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

export {
  card,
  centre,
  chartCount,
  drawn,
  errorsOf,
  hoverMiddle,
  inked,
  inks,
  legendOf,
  linked,
  open,
  openCharts,
  plotOf,
  rowsIn,
  summaryOf,
  tipLabels,
  tipRows,
};
export type { PlotBox };
