/**
 * Data the app loads itself: Arrow bytes moved into the page's worker, the browser's limits, an engine that traps
 * and starts again, and exports written in the browser, read back.
 */

import { writeFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

import { expect, test } from "@playwright/test";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { tableFromArrays, tableToIPC } from "apache-arrow";

/** The limits `BrowserEngine` enforces, as the error messages state them. */
const MAX_ARROW_BYTES = 70_000_000;
const MAX_ROWS = 150_000;

const grid = (page: Page): Locator => page.locator('[role="grid"]');
const note = (page: Page): Locator => page.getByTestId("source-note");

async function open(page: Page): Promise<void> {
  await page.goto("/?preset=source");
  await expect(grid(page)).toHaveAttribute("aria-rowcount", "2000", { timeout: 60_000 });
}

/** Writes `bytes` to a file of the test's own and chooses it in the page's file input. */
async function choose(page: Page, info: TestInfo, name: string, bytes: Uint8Array): Promise<void> {
  const path = info.outputPath(name);
  writeFileSync(path, bytes);
  await page.locator('demo-source input[type="file"]').setInputFiles(path);
}

/** An Arrow stream of `rows` rows of `width` float columns, as an app's API would send it. */
function floats(rows: number, width: number): Uint8Array {
  const columns: Record<string, Float64Array> = {};
  for (let c = 0; c < width; c += 1) {
    columns[`v${String(c)}`] = Float64Array.from({ length: rows }, (_, i) => i * (c + 1));
  }
  return tableToIPC(tableFromArrays(columns), "stream");
}

/** The rows the export test loads, which every export must hold exactly. */
const ROWS = Array.from({ length: 1_000 }, (_, i) => ({ id: i + 1, desk: `Desk ${String(i % 5)}`, amount: (i + 1) * 0.25 }));

function exportRows(): Uint8Array {
  return tableToIPC(tableFromArrays({ id: Int32Array.from(ROWS, (r) => r.id), desk: ROWS.map((r) => r.desk), amount: Float64Array.from(ROWS, (r) => r.amount) }), "stream");
}

/** The files of a zip archive, such as an xlsx, by name. */
function unzip(zip: Buffer): Map<string, string> {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const entries = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const files = new Map<string, string>();
  for (let i = 0; i < entries; i += 1) {
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength);
    const local = zip.readUInt32LE(at + 42);
    const data = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const stored = zip.subarray(data, data + size);
    files.set(name, (method === 8 ? inflateRawSync(stored) : stored).toString("utf8"));
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  return files;
}

/** An xlsx's first sheet as rows of cell texts, shared strings resolved. */
function sheetRows(xlsx: Buffer): string[][] {
  const files = unzip(xlsx);
  const strings = [...(files.get("xl/sharedStrings.xml") ?? "").matchAll(/<si>.*?<t[^>]*>(.*?)<\/t>.*?<\/si>/gsu)].map((m) => m[1] ?? "");
  const rows: string[][] = [];
  for (const cell of (files.get("xl/worksheets/sheet1.xml") ?? "").matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>(.*?)<\/c>)/gsu)) {
    const [, column = "", row = "", attributes = "", body = ""] = cell;
    const value = /<v>(.*?)<\/v>/u.exec(body)?.[1] ?? /<t[^>]*>(.*?)<\/t>/u.exec(body)?.[1] ?? "";
    const text = attributes.includes('t="s"') ? (strings[Number(value)] ?? "") : value;
    const cells = (rows[Number(row) - 1] ??= []);
    cells[column.charCodeAt(0) - 65] = text;
  }
  return rows;
}

/**
 * The engine's module with its memory capped at `pages` of 64 KiB, so that a load that fits the browser's limits
 * still runs it out of memory, as a large one does on a real desktop.
 */
function capMemory(wasm: Buffer, pages: number): Buffer {
  const leb = (from: number): [number, number] => {
    let value = 0;
    let shift = 0;
    let at = from;
    let byte = 0x80;
    while ((byte & 0x80) !== 0) {
      byte = wasm[at] ?? 0;
      at += 1;
      value += (byte & 0x7f) * 2 ** shift;
      shift += 7;
    }
    return [value, at];
  };
  const encode = (value: number): number[] => {
    const out: number[] = [];
    let rest = value;
    do {
      const byte = rest % 128;
      rest = Math.floor(rest / 128);
      out.push(rest === 0 ? byte : byte | 0x80);
    } while (rest !== 0);
    return out;
  };
  const parts: Buffer[] = [wasm.subarray(0, 8)];
  let at = 8;
  while (at < wasm.length) {
    const id = wasm[at] ?? 0;
    const [size, start] = leb(at + 1);
    if (id === 5) {
      // One memory: its flags, then its initial pages; the maximum replaces any it had.
      const [initial] = leb(start + 2);
      const payload = Buffer.from([1, 0x01, ...encode(initial), ...encode(Math.max(initial, pages))]);
      parts.push(Buffer.from([5, ...encode(payload.length)]), payload);
    } else {
      parts.push(wasm.subarray(at, start + size));
    }
    at = start + size;
  }
  return Buffer.concat(parts);
}

test("the app's data loads into the worker and shows the status its API sent", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  // The API read the data 20 minutes ago, blanked 2 NaNs itself and left 3 for the engine.
  await expect(page.locator(".px-status-age")).toContainText("20 min ago");
  await expect(page.locator(".px-badge-warning")).toHaveText("5 NaN shown blank");
  await page.locator(".px-status-info").click();
  await expect(page.locator(".px-info")).toContainText(/Dataset\s*orders/u);
  await expect(page.locator(".px-info")).toContainText(/Rows in table\s*2,000/u);
  expect(errors).toEqual([]);
});

test("loads past the limits are refused with the limit and the size, and one at the row limit loads", async ({ page }, info) => {
  await open(page);
  await choose(page, info, "too-big.arrows", new Uint8Array(MAX_ARROW_BYTES + 1));
  await expect(note(page)).toHaveText(
    "too-big.arrows did not load: too_big is 70000001 bytes of Arrow, more than the 70000000 a table in the browser holds; have its API filter or aggregate the data to fit",
    { timeout: 60_000 }
  );
  await choose(page, info, "rows.arrows", floats(MAX_ROWS + 1, 1));
  await expect(note(page)).toHaveText("rows.arrows did not load: rows has 150001 rows, more than the 150000 a table in the browser holds; have its API filter or aggregate the data to fit", {
    timeout: 60_000
  });
  // Refused loads leave the grid as it was.
  await expect(grid(page)).toHaveAttribute("aria-rowcount", "2000");
  await choose(page, info, "limit.arrows", floats(MAX_ROWS, 1));
  await expect(note(page)).toHaveText("Loaded 150,000 rows from limit.arrows.", { timeout: 60_000 });
  await expect(grid(page)).toHaveAttribute("aria-rowcount", "150000", { timeout: 60_000 });
});

test("an engine that runs out of memory is replaced, and a later load works", async ({ page }, info) => {
  // The engine's memory capped at 32 MB: room for the page's sample, not for 24 MB more.
  await page.route("**/parallax/parallax_wasm_bg.wasm", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: capMemory(await response.body(), 512) });
  });
  const workers: string[] = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  await open(page);
  expect(workers.length).toBe(1);
  await choose(page, info, "huge.arrows", floats(MAX_ROWS, 20));
  const reason =
    /^huge\.arrows did not load: The engine in this page stopped after a fatal error \(RuntimeError: unreachable\), most likely because it ran out of memory\. It has started again without its tables: load the data again\.$/u;
  await expect(note(page)).toHaveText(reason, { timeout: 60_000 });
  // The view of the sample failed with the same reason, and a new worker took the old one's place.
  await expect(page.locator(".px-error")).toContainText("most likely because it ran out of memory");
  await expect.poll(() => workers.length).toBe(2);
  await choose(page, info, "after.arrows", floats(1_000, 3));
  await expect(note(page)).toHaveText("Loaded 1,000 rows from after.arrows.", { timeout: 60_000 });
  await expect(grid(page)).toHaveAttribute("aria-rowcount", "1000", { timeout: 60_000 });
  await expect(page.locator(".px-error")).toHaveCount(0);
});

test("exports are written in the browser and read back cell for cell", async ({ page }, info) => {
  let posted = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/export")) {
      posted += 1;
    }
  });
  await open(page);
  await choose(page, info, "export.arrows", exportRows());
  await expect(grid(page)).toHaveAttribute("aria-rowcount", "1000", { timeout: 60_000 });

  const workbook = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const xlsx = await workbook;
  expect(xlsx.suggestedFilename()).toMatch(/^export-\d{4}-\d{2}-\d{2}-\d{4}\.xlsx$/u);
  const { readFileSync } = await import("node:fs");
  const rows = sheetRows(readFileSync(await xlsx.path()));
  expect(rows[0]).toEqual(["id", "desk", "amount"]);
  expect(rows.length).toBe(ROWS.length + 1);
  for (const [i, expected] of ROWS.entries()) {
    const [id, desk, amount] = rows[i + 1] ?? [];
    expect([Number(id), desk, Number(amount)]).toEqual([expected.id, expected.desk, expected.amount]);
  }

  const table = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: "More export formats" }).click();
  await page.getByRole("menuitem", { name: /CSV/u }).click();
  const csv = await table;
  expect(csv.suggestedFilename()).toMatch(/^export-\d{4}-\d{2}-\d{2}-\d{4}\.csv$/u);
  const text = readFileSync(await csv.path(), "utf8");
  expect(text.startsWith("﻿id,desk,amount\n")).toBe(true);
  const lines = text.slice(1).trimEnd().split("\n").slice(1);
  // CSV holds every digit as the engine writes it, such as 247.0 for a whole double.
  expect(lines.map((line) => line.split(",")).map(([id, desk, amount]) => [id, desk, Number(amount)])).toEqual(ROWS.map((r) => [String(r.id), r.desk, r.amount]));
  // Nothing was posted anywhere.
  expect(posted).toBe(0);
});
