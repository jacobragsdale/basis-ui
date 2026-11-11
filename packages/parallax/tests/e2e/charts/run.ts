/* `vp run @basis/parallax#charts-e2e`: the React charts' end-to-end specs, in the Docker image of the pinned Playwright
 * version, against the built harness, which this script serves from the host. Fonts and text rendering differ between
 * machines, so the screenshots are compared only there, at threshold 0, as the Angular layer's are.
 *
 * It writes the datasets with `parallax-datagen` if they are missing, the same rows as the Angular demo's, builds the
 * harness, serves it, and runs `playwright test` in the image; arguments go to Playwright, such as spec names or
 * `--update-snapshots`. With `PARALLAX_PREBUILT=1` the harness is taken as built. */

import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const here = import.meta.dirname;
const parallax = path.join(here, "../../..");
const repo = path.join(parallax, "../..");
const data = path.join(here, "data");
const port = "8792";
const url = `http://127.0.0.1:${port}`;
/** How long the server has to answer, and how often it is asked, in milliseconds. */
const readyWithinMs = 30_000;
const pollEveryMs = 250;

/** The datasets the harness loads, and how `parallax-datagen` writes each: the Angular demo's, as its `data.sh` writes
 * them, and the fixed-income page's bonds. */
const datasets: readonly (readonly [string, readonly string[]])[] = [
  ["positions", ["positions", "--rows", "150000"]],
  ["trades", ["trades", "--rows", "150000"]],
  ["prices", ["prices", "--tickers", "50"]],
  ["bonds", ["bonds", "--rows", "600"]],
];

/** Runs a command to its end, failing with one line that says what failed. Cargo builds with one rustc job unless
 * `CARGO_BUILD_JOBS` says otherwise, as the engine's build does, since parallel jobs run small machines out of memory. */
function run(command: string, args: readonly string[], cwd: string): void {
  const env = { ...process.env, CARGO_BUILD_JOBS: process.env["CARGO_BUILD_JOBS"] ?? "1" };
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(
      `ERROR ${command} ${args.join(" ")} failed in ${cwd}: fix it, then run this again.`,
    );
  }
}

/** Writes the datasets that are missing. */
function writeData(): void {
  mkdirSync(data, { recursive: true });
  for (const [name, args] of datasets) {
    const out = path.join(data, `${name}.arrows`);
    if (!existsSync(out)) {
      const datagen = ["run", "--release", "--locked", "-q", "-p", "parallax-datagen", "--"];
      run("cargo", [...datagen, ...args, "--stream", "--out", out], parallax);
    }
  }
}

/** The installed Playwright's version, whose Docker image the specs run in. */
function playwrightVersion(): string {
  const manifest = path.join(parallax, "node_modules/@playwright/test/package.json");
  const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("version" in parsed) ||
    typeof parsed.version !== "string"
  ) {
    throw new Error(`ERROR ${manifest} names no version: run vp install.`);
  }
  return parsed.version;
}

/** Whether something answers at the harness's address. */
function answers(): boolean {
  return spawnSync("curl", ["-sf", url], { stdio: "ignore" }).status === 0;
}

/** Waits until the server answers, failing if it exits first or does not answer in time. */
async function ready(server: ChildProcess, deadline: number): Promise<void> {
  if (server.exitCode !== null) {
    throw new Error("ERROR the harness's server exited before it was ready: see its output above.");
  }
  if (answers()) {
    return;
  }
  if (Date.now() > deadline) {
    throw new Error(`ERROR the harness's server did not answer at ${url} within 30 s.`);
  }
  await sleep(pollEveryMs);
  await ready(server, deadline);
}

/** Runs Playwright in its image against the harness, returning its exit code. */
function playwright(args: readonly string[]): number {
  const image = `mcr.microsoft.com/playwright:v${playwrightVersion()}-noble`;
  const user = `${String(process.getuid?.() ?? 0)}:${String(process.getgid?.() ?? 0)}`;
  const environment = [
    "-e",
    "HOME=/tmp",
    "-e",
    `CI=${process.env["CI"] ?? ""}`,
    "-e",
    "PARALLAX_PINNED_IMAGE=1",
  ];
  const config = "tests/e2e/charts/playwright.config.ts";
  const memory = process.env["E2E_MEMORY"] ?? "8g";
  const name = `parallax-charts-e2e-${process.pid}`;
  const container = [
    "run",
    "--rm",
    "--name",
    name,
    "--memory",
    memory,
    "--network",
    "host",
    "--user",
    user,
    ...environment,
  ];
  const tests = ["node_modules/.bin/playwright", "test", "-c", config, ...args];
  const result = spawnSync(
    "docker",
    [...container, "-v", `${repo}:${repo}`, "-w", parallax, image, ...tests],
    {
      stdio: "inherit",
    },
  );
  return result.status ?? 1;
}

async function main(): Promise<number> {
  if (answers()) {
    throw new Error(
      `ERROR something already answers at ${url}: stop it, since the specs must run against this build.`,
    );
  }
  writeData();
  if (process.env["PARALLAX_PREBUILT"] !== "1") {
    run("vp", ["build"], path.join(here, "harness"));
  }
  const server = spawn("node", [path.join(here, "serve.ts"), "--port", port], { stdio: "inherit" });
  try {
    await ready(server, Date.now() + readyWithinMs);
    return playwright(process.argv.slice(2));
  } finally {
    server.kill();
  }
}

process.exitCode = await main();
