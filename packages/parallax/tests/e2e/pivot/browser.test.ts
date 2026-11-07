/* The pivot runs in the page's WebAssembly worker, on the bytes the page loaded, and nothing leaves the page: ported
 * from the Angular demo's browser.spec.ts. */

import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { tableFromIPC } from "apache-arrow";

import { canvasOf, downloadPath, firstFund, open, rowCount, scrollToEnd } from "./helpers.ts";

/** Rows per fund and asset class in Arrow bytes, and per fund as `Total`. */
function countsIn(bytes: Uint8Array): Map<string, number> {
  const table = tableFromIPC(bytes);
  const funds = table.getChild("fund");
  const classes = table.getChild("asset_class");
  const counts = new Map<string, number>();
  const add = (key: string): void => {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (let index = 0; index < table.numRows; index += 1) {
    const fund = String(funds?.get(index));
    add(`${fund} | ${String(classes?.get(index))}`);
    add(`${fund} | Total`);
  }
  return counts;
}

/** Rows per fund and asset class in the positions the harness serves, counted here from the bytes the page loads. */
async function countsInData(page: Page): Promise<Map<string, number>> {
  const response = await page.request.get("/data/positions.arrows");
  expect(response.ok()).toBe(true);
  return countsIn(await response.body());
}

/** The counts the pivot's CSV export shows for each fund's row, by fund and asset class. */
function countsShown(csv: string): Map<string, number> {
  const [header = "", ...lines] = csv.slice(1).trimEnd().split("\n");
  // Each pivot column is its asset class, then its measure; the fund is the second column of each fund's row.
  const columns = header
    .split(",")
    .map((name) => /^(?<column>.*) \| count\(\*\)$/u.exec(name)?.groups?.["column"] ?? null);
  const shown = new Map<string, number>();
  for (const cells of lines.map((line) => line.split(",")).filter((line) => line[0] === "1")) {
    for (const [index, column] of columns.entries()) {
      if (column !== null && cells[index] !== "") {
        shown.set(`${cells[1] ?? ""} | ${column}`, Number(cells[index]));
      }
    }
  }
  return shown;
}

/** The pivot's CSV export. */
async function csvOf(page: Page): Promise<string> {
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: "More export formats" }).click();
  await page.getByRole("menuitem", { name: /CSV/u }).click();
  return readFileSync(await downloadPath(download), "utf8");
}

test("a pivot in the browser counts exactly the rows the data holds", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  const shown = countsShown(await csvOf(page));
  const expected = await countsInData(page);
  expect(expected.size).toBeGreaterThan(8);
  expect(shown).toStrictEqual(expected);
  expect(errors).toStrictEqual([]);
});

test("the pivot follows layout changes with nothing leaving the page", async ({ page }) => {
  const left: string[] = [];
  page.on("websocket", (socket) => left.push(socket.url()));
  await open(page);
  page.on("request", (request) => left.push(request.url()));
  const before = await rowCount(page);
  // Collapsing the first fund is answered by the worker, as are the last rows a scroll asks for.
  await canvasOf(page).click({ position: firstFund.marker });
  await expect.poll(async () => rowCount(page), { timeout: 30_000 }).toBeLessThan(before);
  await scrollToEnd(page);
  await page.waitForTimeout(500);
  expect(left).toStrictEqual([]);
});
