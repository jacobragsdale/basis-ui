/* Grouping a grid: from a header's menu, or by dropping a header on the group panel, with every row under its group:
 * ported from the Angular demo's grid.spec.ts. */

import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  blotterRows,
  canvasOf,
  copied,
  downloadPath,
  openMenu,
  rowCount,
  smallTable,
} from "./helpers.ts";

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
});

/** Groups the blotter by its fourth column, the fund, from the column's menu. */
async function groupByFund(page: Page, section: Locator): Promise<void> {
  const menu = await openMenu(page, section, 3);
  await menu.getByRole("menuitem", { name: "Group by this column" }).click();
}

/** Exports the grid in `section` as CSV and returns its lines, without its byte order mark. */
async function csvLines(page: Page, section: Locator): Promise<readonly string[]> {
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await section.getByRole("button", { name: "More export formats" }).click();
  await page.getByRole("menuitem", { name: /CSV/u }).click();
  return readFileSync(await downloadPath(download), "utf8")
    .slice(1)
    .trim()
    .split("\n");
}

/** Drags the blotter's first header onto its group panel, and checks the panel says it would group by it. */
async function dropOnPanel(page: Page, section: Locator): Promise<void> {
  const canvas = await canvasOf(section).boundingBox();
  const panel = section.getByRole("region", { name: "Groups" });
  const target = await panel.boundingBox();
  await page.mouse.move((canvas?.x ?? 0) + 40, (canvas?.y ?? 0) + 12);
  await page.mouse.down();
  await page.mouse.move((canvas?.x ?? 0) + 70, (canvas?.y ?? 0) + 12, { steps: 3 });
  await page.mouse.move((target?.x ?? 0) + 200, (target?.y ?? 0) + (target?.height ?? 0) / 2, {
    steps: 8,
  });
  await expect(panel).toHaveAttribute("data-drop", "true");
  await page.mouse.up();
}

test("Group by this column lists the rows under their groups, which collapse, expand, copy and export", async ({
  page,
}) => {
  const section = await smallTable(page, "blotter");
  const panel = section.getByRole("region", { name: "Groups" });
  // The blotter's fourth column is the fund; its menu groups by it.
  await groupByFund(page, section);
  await expect(panel.locator("[data-slot=grid-group-chip]")).toHaveText(["fund"]);
  // Every group is open: the rows and a row for each fund above its rows.
  await expect.poll(async () => rowCount(section)).toBeGreaterThan(blotterRows);
  const all = await rowCount(section);
  await panel.getByRole("button", { name: "Collapse all" }).click();
  await expect(section.getByRole("grid")).toHaveAttribute(
    "aria-rowcount",
    String(all - blotterRows),
  );
  await panel.getByRole("button", { name: "Expand all" }).click();
  await expect(section.getByRole("grid")).toHaveAttribute("aria-rowcount", String(all));
});

test("a group's cell copies its label and count, and the CSV holds each group over its rows", async ({
  page,
}) => {
  const section = await smallTable(page, "blotter");
  await groupByFund(page, section);
  await expect.poll(async () => rowCount(section)).toBeGreaterThan(blotterRows);
  const funds = (await rowCount(section)) - blotterRows;
  // A group's cell copies its label and count, as the export writes it.
  await canvasOf(section).click({ position: { x: 40, y: 36 } });
  expect(await copied(page, section)).toMatch(/^\S.* \(\d+\)$/u);
  // The CSV holds each group, at level 1, and each row under it, at level 2.
  const lines = await csvLines(page, section);
  expect(lines[0]?.startsWith("level,fund,")).toBe(true);
  expect(lines.filter((line) => line.startsWith("1,"))).toHaveLength(funds);
  expect(lines.filter((line) => line.startsWith("2,"))).toHaveLength(blotterRows);
});

test("a header dropped on the group panel groups by its column, and its chip ungroups it", async ({
  page,
}) => {
  const section = await smallTable(page, "blotter");
  const panel = section.getByRole("region", { name: "Groups" });
  await expect(panel).toContainText("Drag a column header here");
  await dropOnPanel(page, section);
  await expect(panel.locator("[data-slot=grid-group-chip]")).toHaveCount(1);
  await expect.poll(async () => rowCount(section)).toBeGreaterThan(blotterRows);
  await panel.getByRole("button", { name: /^Stop grouping by /u }).click();
  await expect(panel.locator("[data-slot=grid-group-chip]")).toHaveCount(0);
  await expect(section.getByRole("grid")).toHaveAttribute("aria-rowcount", String(blotterRows));
});
