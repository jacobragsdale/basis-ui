/* `<Chart>` on the harness's fixed-income page: the views roadmap step 2.8 adds for the firm's desks, over a book of
 * bonds. The relative-value scatter draws each bond as a dot, names it in its tooltip, and a click on it narrows a
 * linked view to it. */

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { centre, errorsOf, legendOf, linked, open, plotOf, rowsIn, summaryOf } from "./pages.ts";
import type { PlotBox } from "./pages.ts";

/** How many charts the fixed-income page shows, and how many bonds its book holds. */
const fixedIncomeCount = 7;
const bonds = 600;

/** A CUSIP: nine letters and digits. */
const cusip = /^[\dA-Z]{9}$/u;

/** A chart of the fixed-income page, by its card's id. */
function fixedIncomeCard(page: Page, id: string): Locator {
  return page.locator(`section[data-card="${id}"] [data-slot="chart"]`);
}

/** Opens the fixed-income page, returning its relative-value scatter once it has drawn. */
async function openScatter(page: Page): Promise<Locator> {
  await open(page, "/?page=fixed-income", fixedIncomeCount);
  return fixedIncomeCard(page, "rich-cheap");
}

/** Where the pointer is put: the step along the plot's middle, from a fifth of its width, a hundredth a step. */
interface Sweep {
  readonly chart: Locator;
  readonly box: PlotBox;
  readonly step: number;
}

/** The most steps a sweep takes, across three fifths of the plot. */
const sweepSteps = 60;

/** Moves the pointer along the middle of a plot, step by step, until its tooltip names a bond, and returns where. */
async function hoverFrom({
  chart,
  box,
  step,
}: Sweep): Promise<{ readonly x: number; readonly y: number }> {
  if (step >= sweepSteps) {
    throw new Error("No bond's dot lies along the middle of the plot.");
  }
  const at = { x: box.left + box.width * (0.2 + step / 100), y: box.y };
  await chart.page().mouse.move(at.x, at.y);
  const title = chart.getByRole("tooltip").locator('[data-slot="chart-tip-title"]');
  const named = await title.textContent({ timeout: 200 }).catch(() => null);
  return cusip.test(named ?? "") ? at : hoverFrom({ box, chart, step: step + 1 });
}

/** Hovers a bond's dot on a scatter, returning where. */
async function hoverABond(chart: Locator): Promise<{ readonly x: number; readonly y: number }> {
  return hoverFrom({ box: await centre(plotOf(chart)), chart, step: 0 });
}

test("the relative-value scatter draws a dot per bond, by sector, with a text alternative", async ({
  page,
}) => {
  const errors = errorsOf(page);
  await open(page, "/?page=fixed-income", fixedIncomeCount);
  const chart = fixedIncomeCard(page, "rich-cheap");
  await expect(summaryOf(chart)).toHaveText(`${String(bonds)} dots`);
  await expect(plotOf(chart)).toHaveAccessibleName("Scatter plot of spread by sector from bonds");
  await expect(legendOf(chart)).toHaveText([
    "Communications",
    "Consumer",
    "Energy",
    "Financials",
    "Industrials",
    "Technology",
    "Utilities",
  ]);
  expect(errors).toStrictEqual([]);
});

test("a bond's tooltip names it, and lists its values under their columns' names", async ({
  page,
}) => {
  const chart = await openScatter(page);
  await hoverABond(chart);
  await expect(
    chart.getByRole("tooltip").locator('[data-slot="chart-tip-row"] span:last-child'),
  ).toHaveText([
    "spread",
    "duration",
    "dv01_usd",
    "fitted_spread",
    "issuer",
    "rating",
    "rich_cheap",
  ]);
});

test("a click on a bond narrows the linked bonds to it, and a second shows them all", async ({
  page,
}) => {
  const chart = await openScatter(page);
  const at = await hoverABond(chart);
  const title = chart.getByRole("tooltip").locator('[data-slot="chart-tip-title"]');
  const [named, view] = [await title.textContent(), linked(page, "rich-cheap")];
  expect(await rowsIn(view)).toBe(bonds);
  await page.mouse.click(at.x, at.y);
  await expect(view.getByRole("heading")).toHaveText(`Bond ${named ?? ""}`);
  await expect.poll(async () => rowsIn(view)).toBe(1);
  await page.mouse.click(at.x, at.y);
  await expect.poll(async () => rowsIn(view)).toBe(bonds);
});

/** A chart's text alternative, which describes its plot. */
async function wordsOf(chart: Locator): Promise<string> {
  return plotOf(chart).evaluate(
    (plot) =>
      plot.ownerDocument.querySelector(
        `#${CSS.escape(plot.getAttribute("aria-describedby") ?? "")}`,
      )?.textContent ?? "",
  );
}

/** Where each group of `labels` is read out in `words`, which lists them after the summary, each as `. Label:`. */
function placesIn(words: string, labels: readonly string[]): number[] {
  return labels.map((label) => words.indexOf(`. ${label}:`));
}

test("the DV01 ladder reads short to long, and ratings best first", async ({ page }) => {
  await open(page, "/?page=fixed-income", fixedIncomeCount);
  const ladder = await wordsOf(fixedIncomeCard(page, "dv01-ladder"));
  // The book's shortest bond matures in about ten months, so its first bucket is 1Y.
  const tenors = placesIn(ladder, ["1Y", "2Y", "3Y", "5Y", "7Y", "10Y", "20Y", "30Y"]);
  expect(tenors.every((at) => at >= 0)).toBe(true);
  expect(tenors).toStrictEqual(tenors.toSorted((first, second) => first - second));
  const ratings = await wordsOf(fixedIncomeCard(page, "ratings"));
  const notches = placesIn(ratings, [
    "AAA",
    "AA+",
    "AA",
    "AA-",
    "A+",
    "A",
    "A-",
    "BBB+",
    "BBB",
    "BBB-",
  ]);
  expect(notches.every((at) => at >= 0)).toBe(true);
  expect(notches).toStrictEqual(notches.toSorted((first, second) => first - second));
});

test("a scatter on a tenor axis draws every bond", async ({ page }) => {
  await open(page, "/?page=fixed-income", fixedIncomeCount);
  const chart = fixedIncomeCard(page, "tenor-axis");
  await expect(summaryOf(chart)).toHaveText(`${String(bonds)} dots`);
  await expect(plotOf(chart)).toHaveAccessibleName("Scatter plot of yield_to_maturity from bonds");
});

test("par reads in MM and rich/cheap in basis points, as the grid writes them", async ({
  page,
}) => {
  await open(page, "/?page=fixed-income", fixedIncomeCount);
  expect(await wordsOf(fixedIncomeCard(page, "par-by-sector"))).toMatch(
    /Financials: sum\(par\) [\d,]+\.\dMM/u,
  );
  expect(await wordsOf(fixedIncomeCard(page, "rich-cheap-bps"))).toMatch(
    /Energy: mean\(rich_cheap\) -?\d+\.\d\u00A0bp/u,
  );
});

test("a bond's price reads in 32nds in its tooltip", async ({ page }) => {
  await open(page, "/?page=fixed-income", fixedIncomeCount);
  const chart = fixedIncomeCard(page, "price-32nds");
  await hoverABond(chart);
  const price = chart.getByRole("tooltip").locator('[data-slot="chart-tip-row"]').first();
  await expect(price).toHaveText(/^\d+-\d\d\+?price$/u);
});
