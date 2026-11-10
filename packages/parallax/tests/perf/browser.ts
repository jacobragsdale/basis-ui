/* The bench's browser: headless Chromium with the end-to-end suites' flags, plain or with the whole browser under
 * spike 0.3's CPU quota, and what the bench asks of the harness's page in it. */

import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { chromium } from "@playwright/test";
import type { Browser, Page, Worker } from "@playwright/test";

import type { Run } from "./budgets.ts";
import type { BenchState, ScrollFigures, Step } from "./harness/protocol.ts";
import { browserProcess } from "./processes.ts";

/** The end-to-end suites' flags: no GPU, as on the Citrix desktops parallax targets. */
const chromiumFlags = [
  "--disable-gpu",
  "--disable-gpu-compositing",
  "--disable-software-rasterizer",
  // For measuring alone: `gc()`, so that memory at rest is read after a collection rather than whenever one ran.
  "--js-flags=--expose-gc",
];
/** Spike 0.3's proxy for a Citrix desktop: a CPU quota on the whole browser. */
const quota = ["-p", "CPUQuota=40%", "-p", "CPUQuotaPeriodSec=10ms"];
const loadWithinMs = 1_800_000;
const msPerSecond = 1000;
const pollMs = 100;
const executableMode = 0o755;
const megabyte = 1_000_000;
/** The scroll: as the grid's performance spec scrolls smoothly, 240 frames of 3 rows. */
const scrollSteps = 240;
const scrollRows = 3;

/** `text` quoted for the shell. */
function quoted(text: string): string {
  return `'${text.replaceAll("'", String.raw`'\''`)}'`;
}

/** A script that starts the browser at `executable` under the CPU quota, for Playwright to launch in its place. */
function throttledLauncher(executable: string): string {
  const folder = mkdtempSync(path.join(tmpdir(), "parallax-bench-"));
  const script = path.join(folder, "chromium");
  const command = ["systemd-run", "--user", "--scope", "--quiet", ...quota, "--", executable];
  writeFileSync(script, `#!/bin/sh\nexec ${command.map((part) => quoted(part)).join(" ")} "$@"\n`);
  chmodSync(script, executableMode);
  return script;
}

/** The headless browser Playwright launches by default, found by launching it once. */
async function defaultExecutable(): Promise<string> {
  const browser = await chromium.launch({ args: chromiumFlags });
  try {
    const found = browserProcess();
    if (found === null) {
      throw new Error(
        "ERROR the bench found no browser among its processes: run it on Linux, where /proc says.",
      );
    }
    return found.executable;
  } finally {
    await browser.close();
  }
}

/** Launches the browser, plain or under the quota, checking that the quota's scope holds it. */
async function launch(mode: Run["mode"], executable: string): Promise<Browser> {
  const browser = await chromium.launch({
    args: chromiumFlags,
    ...(mode === "throttled" ? { executablePath: throttledLauncher(executable) } : {}),
  });
  const cgroup = browserProcess()?.cgroup ?? "";
  if (mode === "throttled" && !cgroup.includes(".scope")) {
    await browser.close();
    throw new Error(
      `ERROR the throttled browser is not in a systemd scope (${cgroup}): check that systemd-run --user works here, or run --modes plain.`,
    );
  }
  return browser;
}

/** The browser's version, from a browser launched for it. */
async function browserVersion(): Promise<string> {
  const browser = await chromium.launch({ args: chromiumFlags });
  const version = browser.version();
  await browser.close();
  return version;
}

/** Waits until the page's dataset is loaded and drawn, or has failed. */
async function loaded(page: Page): Promise<BenchState> {
  const deadline = Date.now() + loadWithinMs;
  for (;;) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- polling until the load ends is the point.
    const state = await page.evaluate(() => globalThis.parallaxBench?.state() ?? null);
    if (state?.status === "failed" || (state !== null && state.loadedMs !== null)) {
      return state;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `ERROR the page did not load within ${String(loadWithinMs / msPerSecond)} s.`,
      );
    }
    // oxlint-disable-next-line eslint/no-await-in-loop -- as above.
    await sleep(pollMs);
  }
}

/** Shows a step's layout and returns the milliseconds until the grid drew it. */
async function change(page: Page, step: Step): Promise<number> {
  return page.evaluate(async (layout) => {
    const bench = globalThis.parallaxBench;
    if (bench === undefined) {
      throw new Error("The harness's page has no handle.");
    }
    return bench.change(layout);
  }, step.layout);
}

/** Scrolls the page's grid and returns what it measured. */
async function scroll(page: Page): Promise<ScrollFigures> {
  return page.evaluate(
    async ({ steps, rows }) => {
      const bench = globalThis.parallaxBench;
      if (bench === undefined) {
        throw new Error("The harness's page has no handle.");
      }
      return bench.scroll(steps, rows);
    },
    { rows: scrollRows, steps: scrollSteps },
  );
}

/** The page's engine worker. */
function engineWorker(page: Page): Worker {
  const worker = page.workers().find((each) => each.url().includes("worker"));
  if (worker === undefined) {
    throw new Error("ERROR the harness's page has no engine worker to measure.");
  }
  return worker;
}

/** Collects the garbage where it runs, in the page or a worker, with the `gc()` that `--expose-gc` gives. */
function collect(): void {
  const gc: unknown = Reflect.get(globalThis, "gc");
  if (typeof gc === "function") {
    Reflect.apply(gc, globalThis, []);
  }
}

/** Collects the garbage of the page and of its engine's worker, such as the Arrow bytes a load has finished with. */
async function collectGarbage(page: Page): Promise<void> {
  await page.evaluate(collect);
  await engineWorker(page).evaluate(collect);
}

/** The engine's WebAssembly memory, in MB, as the harness's worker reports it. */
async function wasmMB(page: Page): Promise<number> {
  const bytes = await engineWorker(page).evaluate(() => {
    const read: unknown = Reflect.get(globalThis, "parallaxBenchMemory");
    return typeof read === "function" ? Number(Reflect.apply(read, globalThis, [])) : 0;
  });
  return bytes / megabyte;
}

const settings = {
  flags: chromiumFlags,
  scroll: `${String(scrollSteps)} frames of ${String(scrollRows)} rows`,
  throttle: `systemd-run --user --scope ${quota.join(" ")}`,
} as const;

export {
  browserVersion,
  change,
  collectGarbage,
  defaultExecutable,
  launch,
  loaded,
  scroll,
  settings,
  wasmMB,
};
