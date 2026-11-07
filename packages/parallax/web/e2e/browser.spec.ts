/** Views run in the page's WebAssembly worker, on the bytes the page loaded, and nothing leaves the page. */

import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { tableFromIPC } from "apache-arrow";

async function open(page: Page, preset: string): Promise<void> {
  await page.goto(`/?preset=${preset}`);
  await expect(page.locator('[role="grid"]')).toHaveAttribute("aria-rowcount", /^[1-9]\d*$/, { timeout: 120_000 });
}

/** Rows per fund and asset class in the positions the demo serves, counted here from the same bytes the page loads. */
async function countsInData(page: Page): Promise<Map<string, number>> {
  const response = await page.request.get("/data/positions.arrows");
  expect(response.ok()).toBe(true);
  const table = tableFromIPC(await response.body());
  const funds = table.getChild("fund");
  const classes = table.getChild("asset_class");
  const counts = new Map<string, number>();
  for (let row = 0; row < table.numRows; row += 1) {
    const fund = String(funds?.get(row));
    for (const key of [`${fund} | ${String(classes?.get(row))}`, `${fund} | Total`]) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

test("a pivot in the browser counts exactly the rows the data holds", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page, "pivot");
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: "More export formats" }).first().click();
  await page.getByRole("menuitem", { name: /CSV/u }).click();
  const [header = "", ...lines] = readFileSync(await (await download).path(), "utf8")
    .slice(1)
    .trimEnd()
    .split("\n");
  // Each pivot column is its asset class, then its measure; the fund is the second column of each fund's row.
  const columns = header.split(",").map((name) => /^(.*) \| count\(\*\)$/u.exec(name)?.[1] ?? null);
  const shown = new Map<string, number>();
  for (const line of lines) {
    const cells = line.split(",");
    if (cells[0] !== "1") {
      continue;
    }
    for (const [i, column] of columns.entries()) {
      if (column !== null && cells[i] !== "") {
        shown.set(`${cells[1] ?? ""} | ${column}`, Number(cells[i]));
      }
    }
  }
  const expected = await countsInData(page);
  expect(expected.size).toBeGreaterThan(8);
  expect(shown).toEqual(expected);
  expect(errors).toEqual([]);
});

test("the views follow layout changes with nothing leaving the page", async ({ page }) => {
  const sockets: string[] = [];
  page.on("websocket", (socket) => sockets.push(socket.url()));
  await open(page, "pivot");
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  const before = Number(await page.locator('[role="grid"]').getAttribute("aria-rowcount"));
  // Collapsing the first fund is answered by the worker.
  await page.locator("canvas.px-canvas").click({ position: { x: 24, y: 24 * 2 + 12 } });
  await expect(page.locator('[role="grid"]')).not.toHaveAttribute("aria-rowcount", String(before), { timeout: 30_000 });
  await page.locator(".px-scroll").evaluate((element) => {
    element.scrollTo({ top: element.scrollHeight });
  });
  await page.waitForTimeout(500);
  expect(requests).toEqual([]);
  expect(sockets).toEqual([]);
});
