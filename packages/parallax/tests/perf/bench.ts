/* `vp run @basis/parallax#bench`: the scale harness. It writes trades and positions at each size with
 * `parallax-datagen`, seed 42, into tests/perf/data, which git ignores; builds the harness page on the package's build;
 * serves both; and drives headless Chromium with the end-to-end suites' flags, plain and with the whole browser under
 * spike 0.3's CPU quota, a Citrix desktop's proxy. For each dataset, size and mode it records the time to first rows
 * and to fully loaded, the engine's WebAssembly memory after the load and at its peak, the browser's resident memory
 * at rest and at its peak, each change of `harness/protocol.ts`'s rounds, and, while scrolling at each device pixel
 * ratio, the grid's drawing time, the main thread's busy time and the device pixels repainted per frame (`measure.ts`).
 *
 * It writes one JSON file and checks it against tests/perf/budgets.json, failing with a line for each figure over its
 * budget. `flags.ts` lists the flags, which can make a run short: `--sizes 150000 --modes plain`. */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, loadavg } from "node:os";
import path from "node:path";

import { browserVersion, defaultExecutable, settings } from "./browser.ts";
import { isResults, named, overBudget, shown } from "./budgets.ts";
import type { Results, Run } from "./budgets.ts";
import { buildHarness, data, output, parallax, writeData } from "./data.ts";
import { options } from "./flags.ts";
import type { Options } from "./flags.ts";
import { measure } from "./measure.ts";
import { serve } from "./serve.ts";

const site = path.join(import.meta.dirname, "harness/dist");

/** A run's figures in a few lines, as it ends. */
function summary(result: Run): string {
  const load = result.loadAverage.before.map((each) => each.toFixed(1)).join(" ");
  const head = `${named(result)}, ${result.arrowMB.toFixed(0)} MB of Arrow, load average ${load}`;
  const figures = Object.entries(result.figures).map(
    ([name, value]) => `${name} ${shown(name, value)}`,
  );
  const failed = result.error === null ? [] : [`  failed: ${result.error}`];
  return [head, ...failed, `  ${figures.join(", ")}`].join("\n");
}

/** Prints a line for each figure over its budget, and returns the exit code. */
function check(results: Results, profile: string): number {
  if (profile === "none") {
    return 0;
  }
  const lines = overBudget(results, profile);
  for (const line of lines) {
    process.stderr.write(`${line}\n`);
  }
  return lines.length === 0 ? 0 : 1;
}

function readResults(file: string): Results {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isResults(parsed)) {
    throw new Error(`ERROR ${file} holds no runs: give the JSON file a bench wrote.`);
  }
  return parsed;
}

/** Every run the options ask for, sizes one at a time and smallest first: the largest needs about 4.3 GB. */
async function measureAll(chosen: Options, executable: string): Promise<readonly Run[]> {
  const { server, url } = await serve(site, data);
  const plans = chosen.sizes.flatMap((rows) =>
    chosen.datasets.flatMap((dataset) =>
      chosen.modes.map((mode) => ({
        dataset,
        mode,
        ratios: chosen.ratios,
        rounds: chosen.rounds,
        rows,
        url,
      })),
    ),
  );
  const runs: Run[] = [];
  try {
    for (const plan of plans) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one run at a time, each with the machine to itself.
      const result = await measure(plan, executable);
      process.stdout.write(`${summary(result)}\n`);
      runs.push(result);
    }
  } finally {
    server.close();
  }
  return runs;
}

/** The results file's description of the machine and the browser. */
async function meta(
  chosen: Options,
  { executable, started, before }: { executable: string; started: string; before: number[] },
): Promise<Readonly<Record<string, unknown>>> {
  return {
    ...settings,
    browser: `Chromium ${await browserVersion()}, headless, ${executable}`,
    commit: output("git", ["rev-parse", "HEAD"]),
    cpu: `${cpus()[0]?.model ?? "unknown"}, ${String(cpus().length)} logical cores`,
    ended: new Date().toISOString(),
    loadAverage: { after: loadavg(), before },
    ratios: chosen.ratios,
    rounds: chosen.rounds,
    started,
  };
}

/** Measures every run the options ask for, writes the results file, and checks it against the budgets. */
async function bench(chosen: Options): Promise<number> {
  const executable = await defaultExecutable();
  const started = { before: loadavg(), executable, started: new Date().toISOString() };
  const runs = await measureAll(chosen, executable);
  const results: Results = { meta: await meta(chosen, started), runs };
  mkdirSync(path.dirname(chosen.out), { recursive: true });
  writeFileSync(chosen.out, `${JSON.stringify(results, null, 2)}\n`);
  process.stdout.write(`Wrote ${chosen.out}\n`);
  return check(results, chosen.budgets);
}

async function main(): Promise<number> {
  const chosen = options(parallax);
  if (chosen.check !== null) {
    return check(readResults(chosen.check), chosen.budgets);
  }
  if (!chosen.prebuilt) {
    writeData(chosen.datasets, chosen.sizes);
    buildHarness();
  }
  return bench(chosen);
}

try {
  process.exitCode = await main();
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
