/* The demo's own frame and pages, as the Angular demo's specs drove them: its pages open from the sidebar with no
 * server, the mode and density follow the appearance menu, the performance overlay measures and reports, the small
 * tables are held whole, and a link opens the view it was copied from. */

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { errorsOf, figure, gridsDrawn, inTurn, noteOf, open } from "./helpers.ts";

/** The pages, in the sidebar's order. */
const titles = [
  "Positions pivot",
  "150,000 trades",
  "Largest trades",
  "Daily prices",
  "Small tables",
  "Data from the app",
  "Dashboard",
  "Breakdowns",
  "Charts",
  "Technical analysis",
  "Small charts",
  "Fixed income",
];
const origin = "http://127.0.0.1:8791/";
const settleMs = 300;

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
});

/** Counts the protocol messages the page posts to its engine's worker, from before the page's own script runs: each
 * is a request a view makes of the engine. */
async function countEngineRequests(page: Page): Promise<() => Promise<number>> {
  await page.addInitScript(() => {
    let sent = 0;
    Object.defineProperty(globalThis, "engineRequests", { get: () => sent });
    const post: unknown = Reflect.get(Worker.prototype, "postMessage");
    Object.defineProperty(Worker.prototype, "postMessage", {
      value(this: Worker, ...args: unknown[]): unknown {
        const [message] = args;
        if (
          typeof message === "object" &&
          message !== null &&
          Reflect.get(message, "kind") === "message"
        ) {
          sent += 1;
        }
        return typeof post === "function" ? Reflect.apply(post, this, args) : undefined;
      },
    });
  });
  return async () => page.evaluate(() => Number(Reflect.get(globalThis, "engineRequests")));
}

/** How many requests the page posts in a moment of rest. */
async function postedAtRest(page: Page, sent: () => Promise<number>): Promise<number> {
  const before = await sent();
  await page.waitForTimeout(settleMs);
  return (await sent()) - before;
}

/** A grid's host's resolved token, which its canvas draws with. */
async function token(page: Page, name: string): Promise<string> {
  return page
    .getByRole("grid")
    .first()
    .evaluate(
      (grid, property) =>
        getComputedStyle(grid.closest("[data-px-scheme]") ?? grid)
          .getPropertyValue(property)
          .trim(),
      name,
    );
}

/** How tall the first grid's rows are together, which the density sets. */
async function scrolled(page: Page): Promise<number> {
  return page
    .getByRole("grid")
    .first()
    .evaluate((grid) => grid.scrollHeight);
}

/** The sidebar's links. */
function sidebar(page: Page): Locator {
  return page.getByRole("navigation", { name: "Pages" });
}

/** Moves to a page from the sidebar and waits for its grid's rows. */
async function visit(page: Page, title: string, rows: string): Promise<void> {
  await sidebar(page).getByRole("link", { name: title }).click();
  await expect(sidebar(page).getByRole("link", { name: title })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(page.getByRole("grid").first()).toHaveAttribute("aria-rowcount", rows, {
    timeout: 120_000,
  });
}

/** Records the requests the page makes beyond the demo's own files, and its sockets. */
function outside(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith(origin)) {
      urls.push(request.url());
    }
  });
  page.on("websocket", (socket) => urls.push(socket.url()));
  return urls;
}

/** Scrolls the grid to each of `tops` in turn, a moment at each. */
async function scrollThrough(page: Page, tops: readonly number[]): Promise<void> {
  await inTurn(tops, async (top) => {
    await page.getByRole("grid").evaluate((grid, to) => {
      grid.scrollTo({ top: to });
    }, top);
    await page.waitForTimeout(settleMs);
  });
}

/** Sorts a small table three times, by clicking its first header. */
async function sortThrice(page: Page, table: string): Promise<void> {
  const header = page.locator(`section[data-table="${table}"] [role="grid"] canvas`).first();
  await inTurn([1, 2, 3], async () => {
    await header.click({ position: { x: 40, y: 12 } });
    await page.waitForTimeout(settleMs / 2);
  });
}

/** Chooses each of `choices` in the appearance menu, which stays open between them. */
async function choose(page: Page, choices: readonly string[]): Promise<void> {
  await page.getByRole("button", { name: "Appearance" }).click();
  await inTurn(choices, async (name) => {
    await page.getByRole("menuitemradio", { name }).click();
  });
  await page.keyboard.press("Escape");
}

/** Waits until each of the overlay's figures says what it should. */
async function figuresShow(
  page: Page,
  figures: Readonly<Record<string, string | RegExp>>,
): Promise<void> {
  await inTurn(Object.entries(figures), async ([key, text]) => {
    await expect(figure(page, key)).toContainText(text, { timeout: 10_000 });
  });
}

/** Clicks a grid's last row, just above its totals row, and copies it. */
async function copyLastRow(table: Locator): Promise<void> {
  await table.getByRole("grid").evaluate((grid) => {
    grid.scrollTo({ top: grid.scrollHeight });
  });
  const canvas = table.locator("canvas").first();
  const box = await canvas.boundingBox();
  await canvas.click({ position: { x: 40, y: (box?.height ?? 0) - 36 } });
  await table.page().keyboard.press("ControlOrMeta+c");
}

/** Copies the overlay's report, and reads it from the clipboard. */
async function copiedReport(page: Page): Promise<string> {
  const overlay = page.getByRole("region", { name: "Performance" });
  await overlay.getByRole("button", { name: "Copy report" }).click();
  await expect(overlay.locator("output")).toHaveText("Copied");
  return page.evaluate(async () => navigator.clipboard.readText());
}

test("every page opens from the sidebar, with no server and nothing fetched but the demo's files", async ({
  page,
}) => {
  const errors = errorsOf(page);
  const elsewhere = outside(page);
  await open(page, "/");
  await gridsDrawn(page);
  expect(await sidebar(page).getByRole("link").allTextContents()).toStrictEqual(titles);
  await visit(page, "150,000 trades", "150000");
  await visit(page, "Daily prices", "136150");
  await visit(page, "Fixed income", "600");
  await expect(page.locator('[data-slot="grid-error"]')).toHaveCount(0);
  expect({ elsewhere, errors }).toStrictEqual({ elsewhere: [], errors: [] });
});

test("the mode and the density follow the appearance menu, on this page and the next", async ({
  page,
}) => {
  // A pivot, whose few thousand rows are short enough that the row height shows in the scroll height.
  await open(page, "/");
  await gridsDrawn(page);
  const [light, comfortable] = [await token(page, "--_px-background"), await scrolled(page)];
  await choose(page, ["Dark", "Compact"]);
  await expect.poll(async () => token(page, "--_px-background")).not.toBe(light);
  await expect.poll(async () => scrolled(page)).toBeLessThan(comfortable);
  await visit(page, "Largest trades", "150000");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/u);
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
});

test("the performance overlay measures the page and copies its report", async ({ page }) => {
  await open(page, "/trades");
  await gridsDrawn(page, [150_000]);
  await page.getByRole("button", { name: "Performance" }).click();
  await expect(figure(page, "frame")).toContainText("median", { timeout: 10_000 });
  // Scrolling draws and asks for rows, which gives the drawing and request-to-draw figures.
  await scrollThrough(page, [2000, 20_000, 200_000, 2_000_000]);
  await figuresShow(page, { draw: /[\d.]+ ms per frame/u, latency: "median", memory: "MB" });
  const report = await copiedReport(page);
  expect(report).toContain(
    "Showing: 150,000 trades, trades, grids, light mode, comfortable density",
  );
  expect(report).toMatch(/Rows asked to drawn: [\d.]+ ms median/u);
});

test("the small tables open in their places, and the overlay times each from input to screen", async ({
  page,
}) => {
  await open(page, "/small-tables");
  await gridsDrawn(page, [300, 500]);
  await page.getByRole("button", { name: "Performance" }).click();
  await figuresShow(page, {
    "first-rows-blotter": "after opening",
    "first-rows-book": "after opening",
  });
  // Inputs count from when the overlay opened, so sorting now gives each grid its input-to-screen figure.
  await sortThrice(page, "book");
  await sortThrice(page, "blotter");
  const timed = /ms median, [\d.]+ ms p95 of \d+ changes/u;
  await figuresShow(page, { "input-blotter": timed, "input-book": timed });
});

test("a table of a few hundred rows is held whole, so scrolling it and copying from it ask for nothing", async ({
  page,
}) => {
  const sent = await countEngineRequests(page);
  await open(page, "/small-tables");
  await gridsDrawn(page, [300, 500]);
  // The first rows are what is in view; the whole table follows them.
  await expect.poll(async () => postedAtRest(page, sent)).toBe(0);
  const [quiet, blotter] = [await sent(), page.locator('section[data-table="blotter"]')];
  await copyLastRow(blotter);
  await expect(noteOf(blotter)).toContainText("Copied");
  expect(await sent()).toBe(quiet);
});

test("a link copied from a view opens that view", async ({ page }) => {
  await open(page, "/largest-trades");
  await gridsDrawn(page, [150_000]);
  await page.getByRole("button", { name: "Copy link to this view" }).click();
  await expect(page.locator("header output")).toHaveText(
    "A link to this view is on the clipboard.",
  );
  const link = await page.evaluate(async () => navigator.clipboard.readText());
  expect(link).toMatch(/^http:\/\/127\.0\.0\.1:8791\/#\/largest-trades\?layout=/u);
  await page.goto(link);
  await expect(page.locator("header output")).toHaveText("A view opened from a shared link.");
  await page.getByRole("button", { name: "Layout" }).click();
  await expect(page.getByTestId("layout-json")).toContainText('"gross_amount_local"');
});
