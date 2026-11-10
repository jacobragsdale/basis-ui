/* Scrolling performance of `<Grid>` in Chromium with the GPU disabled and the CPU throttled four times, as a stand-in
 * for a Citrix desktop, measured as the Angular grid's grid-performance.spec.ts measured it (docs/grid-experiment.md):
 * 240 steps a mode, one animation frame each, 3 rows a step (smooth) and 40 (jumping). Results go to
 * test-results/grid-performance.json. It measures rather than checks, as shared runners are too noisy for a budget, so
 * it runs only when asked: `PARALLAX_PERFORMANCE=1 tests/e2e/grid/in-image.sh grid-performance`. */

import { mkdirSync, writeFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { CDPSession, Page } from "@playwright/test";

test.skip(
  process.env["PARALLAX_PERFORMANCE"] !== "1",
  "Scrolling is measured only when asked: set PARALLAX_PERFORMANCE=1.",
);

const steps = 240;
const throttle = 4;
const settleMs = 500;
const msPerSecond = 1000;
const rowPx = 24;
const modes = [
  ["smooth", 3],
  ["jumping", 40],
] as const;

interface Result {
  readonly preset: string;
  readonly mode: string;
  readonly frames: number;
  readonly meanFrameMs: number;
  readonly p95FrameMs: number;
  readonly maxFrameMs: number;
  readonly mainThreadMsPerFrame: number;
  readonly scriptMsPerFrame: number;
  readonly layoutAndStyleMsPerFrame: number;
}

const results: Result[] = [];

async function metrics(cdp: CDPSession): Promise<ReadonlyMap<string, number>> {
  const response = await cdp.send("Performance.getMetrics");
  return new Map(response.metrics.map((metric) => [metric.name, metric.value]));
}

function delta(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
  name: string,
): number {
  return ((after.get(name) ?? 0) - (before.get(name) ?? 0)) * msPerSecond;
}

function percentile(values: readonly number[], share: number): number {
  const sorted = values.toSorted((first, second) => first - second);
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
}

/** Scrolls the grid `steps` steps of `rows` rows, one animation frame each, and returns each frame's interval. */
async function scroll(page: Page, rows: number): Promise<readonly number[]> {
  return page.getByRole("grid").evaluate(
    async (scroller, { count, by }) => {
      const times = [performance.now()];
      for (let step = 0; step < count; step += 1) {
        Object.assign(scroller, { scrollTop: scroller.scrollTop + by });
        const { promise, resolve } = Promise.withResolvers<number>();
        requestAnimationFrame(resolve);
        // oxlint-disable-next-line eslint/no-await-in-loop -- each step waits for its frame, which is what is measured.
        await promise;
        times.push(performance.now());
      }
      return times.slice(1).map((time, index) => time - (times[index] ?? time));
    },
    { by: rowPx * rows, count: steps },
  );
}

/** What one mode of scrolling measured. */
function resultOf(
  run: { readonly preset: string; readonly mode: string; readonly intervals: readonly number[] },
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
): Result {
  const { intervals } = run;
  const frames = intervals.length;
  const layout =
    delta(before, after, "LayoutDuration") + delta(before, after, "RecalcStyleDuration");
  return {
    frames,
    layoutAndStyleMsPerFrame: layout / frames,
    mainThreadMsPerFrame: delta(before, after, "TaskDuration") / frames,
    maxFrameMs: Math.max(...intervals),
    meanFrameMs: intervals.reduce((sum, interval) => sum + interval, 0) / frames,
    mode: run.mode,
    p95FrameMs: percentile(intervals, 0.95),
    preset: run.preset,
    scriptMsPerFrame: delta(before, after, "ScriptDuration") / frames,
  };
}

/** Scrolls in one mode, measuring it. */
async function measure(
  page: Page,
  cdp: CDPSession,
  run: { readonly preset: string; readonly mode: string; readonly rows: number },
): Promise<Result> {
  const before = await metrics(cdp);
  const intervals = await scroll(page, run.rows);
  return resultOf({ ...run, intervals }, before, await metrics(cdp));
}

/** Opens a preset and waits for its rows, all of them: they show as they arrive, and the scroll is measured once the
 * last have. */
async function openWhole(page: Page, preset: string): Promise<void> {
  await page.goto(`/?preset=${preset}`);
  await expect(page.getByRole("grid")).toHaveAttribute("aria-rowcount", /^[1-9]\d*$/u, {
    timeout: 120_000,
  });
  await expect(page.locator('[data-slot="grid-status-loading"]')).toHaveCount(0, {
    timeout: 120_000,
  });
}

for (const preset of ["trades", "pivot"] as const) {
  test(`scrolling ${preset}`, async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    await openWhole(page, preset);
    await page.waitForTimeout(settleMs);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
    const smooth = await measure(page, cdp, { mode: modes[0][0], preset, rows: modes[0][1] });
    const jumping = await measure(page, cdp, { mode: modes[1][0], preset, rows: modes[1][1] });
    results.push(smooth, jumping);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  });
}

test.afterAll(() => {
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/grid-performance.json", JSON.stringify(results, null, 2));
  const rows = results.map((result) =>
    [
      result.preset,
      result.mode,
      `mean ${result.meanFrameMs.toFixed(1)} ms`,
      `p95 ${result.p95FrameMs.toFixed(1)} ms`,
      `max ${result.maxFrameMs.toFixed(1)} ms`,
      `main thread ${result.mainThreadMsPerFrame.toFixed(2)} ms`,
      `script ${result.scriptMsPerFrame.toFixed(2)} ms`,
      `layout and style ${result.layoutAndStyleMsPerFrame.toFixed(2)} ms`,
    ].join(", "),
  );
  process.stdout.write(`${rows.join("\n")}\n`);
});
