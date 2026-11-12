/* Data the app loads itself, on the "Data from the app" page: Arrow bytes moved into the page's worker, the browser's
 * limits, an engine that traps and starts again, and exports written in the browser, read back. */

import { readFileSync, writeFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { tableFromArrays, tableToIPC } from "apache-arrow";

import { open } from "./helpers.ts";
import { capMemory, sheetRows } from "./files.ts";

/** The limits the engine in the browser enforces, as its errors state them. */
const maxArrowBytes = 500_000_000;
const maxRows = 10_000_000;
/** The engine's memory, capped at 32 MB in 64 KiB pages: room for the page's sample, not for 24 MB more. */
const cappedPages = 512;
/** The rows of 20 doubles that make those 24 MB, within the browser's limits. */
const capRows = 150_000;
const loadMs = 60_000;

/** The rows the export test loads, which every export must hold exactly. */
const exportRows = Array.from({ length: 1000 }, (_row, index) => ({
  amount: (index + 1) * 0.25,
  desk: `Desk ${String(index % 5)}`,
  id: index + 1,
}));

function grid(page: Page): Locator {
  return page.getByRole("grid");
}

function note(page: Page): Locator {
  return page.getByTestId("source-note");
}

async function openSource(page: Page): Promise<void> {
  await open(page, "/data-from-the-app");
  await expect(grid(page)).toHaveAttribute("aria-rowcount", "2000", { timeout: loadMs });
}

/** Writes `bytes` to a file of the test's own and chooses it in the page's file input. */
async function choose(
  page: Page,
  info: TestInfo,
  { name, bytes }: { readonly name: string; readonly bytes: Uint8Array },
): Promise<void> {
  const path = info.outputPath(name);
  writeFileSync(path, bytes);
  await page.getByLabel("Open an Arrow stream file").setInputFiles(path);
}

/** An Arrow stream of `rows` rows of `width` float columns, as an app's API would send it. */
function floats(rows: number, width: number): Uint8Array {
  const columns: Record<string, Float64Array> = {};
  for (let column = 0; column < width; column += 1) {
    columns[`v${String(column)}`] = Float64Array.from(
      { length: rows },
      (_row, index) => index * (column + 1),
    );
  }
  return tableToIPC(tableFromArrays(columns), "stream");
}

function exportStream(): Uint8Array {
  return tableToIPC(
    tableFromArrays({
      id: Int32Array.from(exportRows, (row) => row.id),
      desk: exportRows.map((row) => row.desk),
      amount: Float64Array.from(exportRows, (row) => row.amount),
    }),
    "stream",
  );
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
});

test("the app's data loads into the worker and shows the status its API sent", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openSource(page);
  // The API read the data 20 minutes ago, blanked 2 NaNs itself and left 3 for the engine.
  await expect(page.locator('[data-slot="grid-status-age"]')).toContainText("20 min ago");
  await expect(page.locator('[data-slot="grid-status"] [data-slot="badge"]')).toHaveText(
    "5 NaN shown blank",
  );
  await page.getByRole("button", { name: "About this data" }).click();
  const about = page.locator('[data-slot="grid-about"]');
  await expect(about).toContainText(/Dataset\s*orders/u);
  await expect(about).toContainText(/Rows in table\s*2,000/u);
  expect(errors).toStrictEqual([]);
});

test("loads past the limits are refused with the limit and the size, and one at the row limit loads", async ({
  page,
}, info) => {
  await openSource(page);
  await choose(page, info, { bytes: new Uint8Array(maxArrowBytes + 1), name: "too-big.arrows" });
  await expect(note(page)).toHaveText(
    "too-big.arrows did not load: too_big is 500000001 bytes of Arrow, more than the 500000000 a table in the browser holds; have its API filter or aggregate the data to fit.",
    { timeout: loadMs },
  );
  await choose(page, info, { bytes: floats(maxRows + 1, 1), name: "rows.arrows" });
  await expect(note(page)).toHaveText(
    "rows.arrows did not load: rows has 10000001 rows, more than the 10000000 a table in the browser holds; have its API filter or aggregate the data to fit",
    { timeout: loadMs },
  );
  // Refused loads leave the grid as it was.
  await expect(grid(page)).toHaveAttribute("aria-rowcount", "2000");
  await choose(page, info, { bytes: floats(maxRows, 1), name: "limit.arrows" });
  await expect(note(page)).toHaveText("Loaded 10,000,000 rows from limit.arrows.", {
    timeout: loadMs,
  });
  await expect(grid(page)).toHaveAttribute("aria-rowcount", "10000000", { timeout: loadMs });
});

/** The engine's module, from now on served with its memory capped. */
async function capEngine(page: Page): Promise<void> {
  await page.route("**/parallax_wasm_bg*.wasm", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ body: capMemory(await response.body(), cappedPages), response });
  });
}

test("an engine that runs out of memory is replaced, and a later load works", async ({
  page,
}, info) => {
  await capEngine(page);
  const workers: string[] = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  await openSource(page);
  await choose(page, info, { bytes: floats(capRows, 20), name: "huge.arrows" });
  await expect(note(page)).toHaveText(
    /^huge\.arrows did not load: The engine in this page stopped after a fatal error \(RuntimeError: unreachable\), most likely because it ran out of memory\. It has started again without its tables: load the data again\.$/u,
    { timeout: loadMs },
  );
  // A new worker took the old one's place, and the sample, which had loaded, loads in it again.
  await expect.poll(() => workers.length).toBe(2);
  await expect(grid(page)).toHaveAttribute("aria-rowcount", "2000", { timeout: loadMs });
  await choose(page, info, { bytes: floats(1000, 3), name: "after.arrows" });
  await expect(grid(page)).toHaveAttribute("aria-rowcount", "1000", { timeout: loadMs });
});

/** Downloads the grid's export, from the Export button or, for CSV, its menu, and reads the file. */
async function exported(
  page: Page,
  format: "xlsx" | "csv",
): Promise<{ readonly name: string; readonly bytes: Buffer }> {
  const download = page.waitForEvent("download", { timeout: loadMs });
  if (format === "xlsx") {
    await page.getByRole("button", { exact: true, name: "Export" }).click();
  } else {
    await page.getByRole("button", { name: "More export formats" }).click();
    await page.getByRole("menuitem", { name: /CSV/u }).click();
  }
  const file = await download;
  return { bytes: readFileSync(await file.path()), name: file.suggestedFilename() };
}

/** Each row's id, desk and amount, as the export test loads them. */
const expected = exportRows.map((row) => [row.id, row.desk, row.amount]);

/** Opens the page, records any request that sends something, and loads the export test's rows. */
async function loadExportRows(page: Page, info: TestInfo): Promise<string[]> {
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET") {
      sent.push(request.url());
    }
  });
  await openSource(page);
  await choose(page, info, { bytes: exportStream(), name: "export.arrows" });
  await expect(grid(page)).toHaveAttribute("aria-rowcount", "1000", { timeout: loadMs });
  return sent;
}

test("an Excel export is written in the browser and read back cell for cell", async ({
  page,
}, info) => {
  const sent = await loadExportRows(page, info);
  const xlsx = await exported(page, "xlsx");
  expect(xlsx.name).toMatch(/^export-\d{4}-\d{2}-\d{2}-\d{4}\.xlsx$/u);
  const [heading, ...rows] = sheetRows(xlsx.bytes);
  expect(heading).toStrictEqual(["ID", "Desk", "Amount"]);
  expect(rows.map(([id, desk, amount]) => [Number(id), desk, Number(amount)])).toStrictEqual(
    expected,
  );
  expect(sent).toStrictEqual([]);
});

test("a CSV export holds every digit as the engine writes it", async ({ page }, info) => {
  const sent = await loadExportRows(page, info);
  const csv = await exported(page, "csv");
  expect(csv.name).toMatch(/^export-\d{4}-\d{2}-\d{2}-\d{4}\.csv$/u);
  const [heading, ...lines] = csv.bytes.toString("utf8").trimEnd().split("\n");
  expect(heading).toBe("\uFEFFID,Desk,Amount");
  // Such as 247.0 for a whole double, which Number reads back exactly.
  expect(
    lines
      .map((line) => line.split(","))
      .map(([id, desk, amount]) => [Number(id), desk, Number(amount)]),
  ).toStrictEqual(expected);
  expect(sent).toStrictEqual([]);
});
