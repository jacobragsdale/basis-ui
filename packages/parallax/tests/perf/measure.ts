/* One run of the bench: a dataset at a size, plain or throttled. The page loads once at each device pixel ratio, in a
 * browser started at that ratio; the first load also rests, has its memory read, and runs the rounds of
 * changes; every load scrolls, once for each round. Each figure is the median of its samples. */

import { statSync } from "node:fs";
import { loadavg } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";

import type { Browser, Page } from "@playwright/test";

import { change, collectGarbage, launch, loaded, scroll, wasmMB } from "./browser.ts";
import type { Run } from "./budgets.ts";
import { arrowFile } from "./data.ts";
import { stepsOf } from "./harness/protocol.ts";
import type { BenchDataset } from "./harness/protocol.ts";
import { resident, samplePeak } from "./processes.ts";

const viewport = { height: 900, width: 1400 };
/** How long the page rests after its load, its garbage collected, before it is measured, so that the work a load
 * leaves behind, which shares the throttled browser's quota, is done. */
const restMs = 3000;
const sampleEveryMs = 250;
const megabyte = 1_000_000;

/** What a run measures. */
interface Plan {
  readonly dataset: BenchDataset;
  readonly rows: number;
  readonly mode: Run["mode"];
  readonly ratios: readonly number[];
  readonly rounds: number;
  /** Where the harness is served. */
  readonly url: string;
}

function median(values: readonly number[]): number {
  const sorted = values.toSorted((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? 0) + upper) / 2;
}

/** The samples a run collects, by figure. */
class Samples {
  readonly #samples = new Map<string, number[]>();

  public add(name: string, value: number): void {
    this.#samples.set(name, [...(this.#samples.get(name) ?? []), value]);
  }

  public get all(): Readonly<Record<string, readonly number[]>> {
    return Object.fromEntries(this.#samples);
  }

  public get medians(): Readonly<Record<string, number>> {
    return Object.fromEntries([...this.#samples].map(([name, values]) => [name, median(values)]));
  }
}

/** The rounds of changes on a loaded page, each step's time added to `samples` as `NAMEMs`. */
async function rounds(page: Page, plan: Plan, samples: Samples): Promise<void> {
  const steps = Array.from({ length: plan.rounds }, () => stepsOf(plan.dataset)).flat();
  for (const step of steps) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each change is timed alone, so they run one after another.
    samples.add(`${step.name}Ms`, await change(page, step));
  }
}

/** Reads the memory at rest, after the rest, runs the rounds, and reads the engine's memory at its peak. */
async function atRest(page: Page, plan: Plan, samples: Samples): Promise<void> {
  const rest = resident();
  samples.add("rssAtRestMB", rest.rssMB);
  samples.add("pssAtRestMB", rest.pssMB);
  samples.add("wasmLoadedMB", await wasmMB(page));
  await rounds(page, plan, samples);
  samples.add("wasmPeakMB", await wasmMB(page));
}

/** Opens the page and waits for its load, adding its times to `samples`. */
async function openPage(page: Page, plan: Plan, samples: Samples): Promise<void> {
  await page.goto(`${plan.url}/?dataset=${plan.dataset}&rows=${String(plan.rows)}`);
  const state = await loaded(page);
  if (state.status === "failed" || state.firstRowsMs === null || state.loadedMs === null) {
    throw new Error(state.error ?? "the page failed to load.");
  }
  samples.add("firstRowsMs", state.firstRowsMs);
  samples.add("loadedMs", state.loadedMs);
}

/** Scrolls the page's grid once for each round, so that each ratio's drawing figure is a median too, adding its
 * figures at the ratio to `samples`. */
async function scrollPage(
  page: Page,
  { ratio, rounds: count }: { ratio: number; rounds: number },
  samples: Samples,
): Promise<void> {
  for (let round = 0; round < count; round += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each scroll is timed alone.
    const scrolled = await scroll(page);
    samples.add(`drawMsPerFrame@${String(ratio)}`, scrolled.drawMsPerFrame);
    samples.add(`p95FrameMs@${String(ratio)}`, scrolled.p95FrameMs);
    samples.add(`longFrames@${String(ratio)}`, scrolled.longFrames);
    samples.add(`busyMsPerFrame@${String(ratio)}`, scrolled.busyMsPerFrame);
    samples.add(`paintedPxPerFrame@${String(ratio)}`, scrolled.paintedPxPerFrame);
    samples.add(`paintedShare@${String(ratio)}`, scrolled.paintedPxPerFrame / scrolled.canvasPx);
    samples.add(`copiesPerFrame@${String(ratio)}`, scrolled.copies / Math.max(1, scrolled.frames));
  }
}

/** Loads the page at one ratio and measures it, the rest and the rounds only on the first. */
async function measurePage(
  browser: Browser,
  plan: Plan,
  { ratio, first, samples }: { ratio: number; first: boolean; samples: Samples },
): Promise<void> {
  const context = await browser.newContext({ deviceScaleFactor: ratio, viewport });
  try {
    const page = await context.newPage();
    await openPage(page, plan, samples);
    await collectGarbage(page);
    await sleep(restMs);
    if (first) {
      await atRest(page, plan, samples);
    }
    await scrollPage(page, { ratio, rounds: plan.rounds }, samples);
  } finally {
    // The context ends before the next starts, freeing its renderer and worker.
    await context.close();
  }
}

/** Measures the page at each ratio, in a browser started at it, one after another. */
async function measurePages(plan: Plan, executable: string, samples: Samples): Promise<void> {
  for (const [index, ratio] of plan.ratios.entries()) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one browser at a time, so that each has the machine to itself.
    const browser = await launch(plan.mode, executable, ratio);
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- as above.
      await measurePage(browser, plan, { first: index === 0, ratio, samples });
    } finally {
      // oxlint-disable-next-line eslint/no-await-in-loop -- as above.
      await browser.close();
    }
  }
}

/** One run, a fresh browser at each ratio, with the browsers' resident memory sampled throughout for its peak. */
async function measure(plan: Plan, executable: string): Promise<Run> {
  const before = loadavg();
  const samples = new Samples();
  const peak = samplePeak(sampleEveryMs);
  const error = await measurePages(plan, executable, samples).then(
    () => null,
    (error_: unknown) => (error_ instanceof Error ? error_.message : String(error_)),
  );
  const most = peak();
  samples.add("rssPeakMB", most.rssMB);
  samples.add("pssPeakMB", most.pssMB);
  return {
    arrowMB: statSync(arrowFile(plan.dataset, plan.rows)).size / megabyte,
    dataset: plan.dataset,
    error,
    figures: samples.medians,
    key: `${plan.dataset} ${String(plan.rows)} ${plan.mode}`,
    loadAverage: { after: loadavg(), before },
    mode: plan.mode,
    rows: plan.rows,
    samples: samples.all,
  };
}

export { measure };
export type { Plan };
