/* A scroll that moves pixels: after a scroll by rows, or across, the canvas is what painting it whole would draw, pixel
 * for pixel, and only the rows or columns the scroll exposed were painted. These tests run at the ratio of each browser
 * project: 1, and 1.25 and 1.5 in the projects that start Chromium at those ratios. */

import "@basis/ui/styles.css";

import { expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import type { LayoutInput } from "#layout/layout.ts";

import { gatedWorker } from "./gated-worker.ts";
import type { GatedWorker } from "./gated-worker.ts";
import {
  differences,
  expectPaintedWhole,
  frames,
  paintedWhole,
  pixels,
  rowsArea,
  scrollBy,
  showGrid,
} from "./scroll-copy-helpers.tsx";
import type { OneDraw, Shown } from "./scroll-copy-helpers.tsx";

/** A distance across that is whole device pixels at 1, 1.25 and 1.5. */
const across = 100;
/** How far a grid with pinned columns is scrolled across first, so that the pinned columns' edge already shows. */
const pinnedStart = 40;
/** A step of rows smaller than the body, and how many of them pass the 40 rows the grid holds past those in view. */
const rowStep = 5;
const steps = 10;

/** A draw that copied and painted `paintedPx` device pixels. */
function copied(paintedPx: number): OneDraw {
  return { copies: 1, fullDraws: 0, paintedPx };
}

test("a scroll by rows copies the rows that stay and paints only the rows it exposed", async () => {
  const shown = await showGrid();
  expect(await scrollBy(shown, { rows: 3 })).toStrictEqual(copied(rowsArea(shown, 3)));
  await expectPaintedWhole(shown);
  expect(await scrollBy(shown, { rows: -2 })).toStrictEqual(copied(rowsArea(shown, 2)));
  await expectPaintedWhole(shown);
});

test("a scroll across copies the columns that stay and paints only the strip it exposed", async () => {
  const shown = await showGrid();
  const strip = across * globalThis.devicePixelRatio * shown.canvas.height;
  expect(await scrollBy(shown, { left: across })).toStrictEqual(copied(strip));
  await expectPaintedWhole(shown);
  expect(await scrollBy(shown, { left: -across })).toStrictEqual(copied(strip));
  await expectPaintedWhole(shown);
});

/** How many full redraws a scroll by `by` made. */
async function fullDraws(shown: Shown, by: Parameters<typeof scrollBy>[1]): Promise<number> {
  const draw = await scrollBy(shown, by);
  return draw.fullDraws;
}

test("pinned columns, the header and the totals row stay put while the rest scroll", async () => {
  const layout = {
    pinned: ["book", "id"],
    totals: [{ aggregate: "sum", column: "amount_0" }],
  } satisfies LayoutInput;
  const shown = await showGrid({ layout });
  // The pinned columns' edge shows once anything is scrolled, so the first scroll across paints everything.
  expect(await fullDraws(shown, { left: pinnedStart })).toBe(1);
  expect(await fullDraws(shown, { left: across })).toBe(0);
  await expectPaintedWhole(shown);
  expect(await scrollBy(shown, { rows: 4 })).toStrictEqual(copied(rowsArea(shown, 4)));
  await expectPaintedWhole(shown);
  // Back at the left edge, where the edge goes, everything is painted.
  expect(await fullDraws(shown, { left: -(across + pinnedStart) })).toBe(1);
});

/** Chooses the third row and selects a cell of the fifth, so that a check, a tint and a ring are drawn, then moves the
 * pointer away. */
async function chooseAndSelect(shown: Shown): Promise<void> {
  const { canvas, metrics } = shown;
  const rowAt = (row: number): number => metrics.headerPx + (row + 0.5) * metrics.rowPx;
  await userEvent.click(canvas, { position: { x: 16, y: rowAt(2) } });
  await userEvent.click(canvas, { position: { x: canvas.clientWidth - 60, y: rowAt(4) } });
  await shown.away();
  await frames();
}

test("a grouped grid's group column, checkboxes, selection and focus move with their rows", async () => {
  const layout = { detail: true, expand_depth: 1, group_by: ["book"] } satisfies LayoutInput;
  // Four books' group rows over the rows.
  const rows = 3004;
  const shown = await showGrid({ grid: { rowKey: "id", selectable: true }, layout, rows });
  await chooseAndSelect(shown);
  expect(await fullDraws(shown, { rows: 2 })).toBe(0);
  await expectPaintedWhole(shown);
});

/** Scrolls `steps` steps of `rows` rows, each drawn before the next; returns how many of them copied. */
async function stepRows(shown: Shown, rows: number): Promise<number> {
  let copies = 0;
  for (let step = 0; step < steps; step += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each step is drawn before the next.
    const draw = await scrollBy(shown, { rows });
    copies += draw.copies;
  }
  return copies;
}

/** Whether the canvas shows `picture`, pixel for pixel. */
function shows(shown: Shown, picture: Uint8ClampedArray): boolean {
  return differences(shown.canvas, [pixels(shown.canvas), picture]).count === 0;
}

/** Whether the canvas shows `picture` a few frames from now. */
async function shownAfterFrames(shown: Shown, picture: Uint8ClampedArray): Promise<boolean> {
  await frames();
  return shows(shown, picture);
}

/** Scrolls down past the rows the grid holds while the engine's answers wait, then back before they arrive; returns how
 * many steps each way copied. */
async function awayAndBack(shown: Shown, gate: GatedWorker): Promise<readonly number[]> {
  gate.close();
  const down = await stepRows(shown, rowStep);
  return [down, await stepRows(shown, -rowStep)];
}

test("a copy keeps the rows in view from a late frame, and paints rows still to come when they arrive", async () => {
  const gate = gatedWorker();
  const shown = await showGrid({ worker: gate.start });
  const top = await paintedWhole(shown);
  expect(await awayAndBack(shown, gate)).toStrictEqual([steps, steps]);
  expect(shows(shown, top)).toBe(true);
  // The late answer, for the rows left behind, arrives and is not shown.
  gate.deliver();
  expect(await shownAfterFrames(shown, top)).toBe(true);
  gate.open();
  // Down again with the engine answering: rows a copy exposed before their frame came are painted when it does.
  await stepRows(shown, rowStep);
  await expectPaintedWhole(shown);
});
