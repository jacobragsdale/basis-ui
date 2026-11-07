/* The pointer and keyboard gestures the specs make, each step awaited before the next. */

import type { Locator, Page } from "@playwright/test";

/** How far each step of a sweep moves the pointer, in pixels. */
const sweepStep = 7;

/** A point on the page, in CSS pixels. */
interface At {
  readonly x: number;
  readonly y: number;
}

/** Runs `step` on each item in turn, each once the one before has finished. */
async function inTurn<TItem>(
  items: readonly TItem[],
  step: (item: TItem, index: number) => Promise<void>,
  index = 0,
): Promise<void> {
  const item = items[index];
  if (item === undefined) {
    return;
  }
  await step(item, index);
  await inTurn(items, step, index + 1);
}

/** Runs `step` `times` times in turn. */
async function repeat(times: number, step: () => Promise<void>): Promise<void> {
  if (times <= 0) {
    return;
  }
  await step();
  await repeat(times - 1, step);
}

/** Turns the wheel `times` times over where the pointer is: up zooms in. */
async function wheel(page: Page, times: number, deltaY: number): Promise<void> {
  await repeat(times, async () => page.mouse.wheel(0, deltaY));
}

/** Presses, drags to `to` in steps, and lets go; with `shift`, Shift is held throughout, which brushes. */
async function drag(
  page: Page,
  { from, to }: { readonly from: At; readonly to: At },
  shift = false,
): Promise<void> {
  if (shift) {
    await page.keyboard.down("Shift");
  }
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  if (shift) {
    await page.keyboard.up("Shift");
  }
}

/** Moves the pointer along `y` from `x` to `end`, a few pixels at a time, until `chart`'s tooltip says `words`. */
async function sweepFor(
  page: Page,
  chart: Locator,
  {
    words,
    x,
    y,
    end,
  }: { readonly words: string; readonly x: number; readonly y: number; readonly end: number },
): Promise<boolean> {
  if (x >= end) {
    return false;
  }
  await page.mouse.move(x, y);
  // The tooltip's element stays on the page while hidden, holding what it last read.
  const text = await chart.locator('[data-slot="chart-tip"]').textContent();
  return (
    text?.includes(words) === true || sweepFor(page, chart, { end, words, x: x + sweepStep, y })
  );
}

export { drag, inTurn, repeat, sweepFor, wheel };
export type { At };
