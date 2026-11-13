/* The bench's datasets, written by `parallax-datagen` with seed 42 into tests/perf/data, which git ignores, and its
 * page, built on the package's build. */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import type { BenchDataset } from "./harness/protocol.ts";

const parallax = path.join(import.meta.dirname, "../..");
const data = path.join(import.meta.dirname, "data");

/** Runs a command to its end, failing with one line that says what failed. Cargo builds with one rustc job unless
 * `CARGO_BUILD_JOBS` says otherwise, as the engine's build does, since parallel jobs run small machines out of memory. */
function run(command: string, args: readonly string[]): void {
  const env = { ...process.env, CARGO_BUILD_JOBS: process.env["CARGO_BUILD_JOBS"] ?? "1" };
  const result = spawnSync(command, args, { cwd: parallax, env, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(
      `ERROR ${command} ${args.join(" ")} failed in ${parallax}: fix it, then run this again.`,
    );
  }
}

/** What a command prints, trimmed. */
function output(command: string, args: readonly string[]): string {
  return spawnSync(command, args, { cwd: parallax, encoding: "utf8" }).stdout.trim();
}

function arrowFile(dataset: BenchDataset, rows: number): string {
  return path.join(data, `${dataset}-${String(rows)}.arrows`);
}

/** Where cargo writes its build, which `CARGO_TARGET_DIR` may move out of the package, as `scripts/build-wasm.ts` finds
 * it: cargo metadata's `target_directory`. */
function targetDirectory(): string {
  const metadata: unknown = JSON.parse(
    output("cargo", ["metadata", "--format-version", "1", "--no-deps"]),
  );
  if (
    typeof metadata === "object" &&
    metadata !== null &&
    "target_directory" in metadata &&
    typeof metadata.target_directory === "string"
  ) {
    return metadata.target_directory;
  }
  throw new Error(
    `ERROR cargo metadata named no target directory: check that \`cargo metadata\` runs in ${parallax}.`,
  );
}

/** Writes the datasets that are missing, as Arrow IPC streams: the same seed and options always give the same bytes. */
function writeData(datasets: readonly BenchDataset[], sizes: readonly number[]): void {
  mkdirSync(data, { recursive: true });
  run("cargo", ["build", "--release", "--locked", "-p", "parallax-datagen"]);
  const missing = sizes.flatMap((rows) =>
    datasets
      .map((dataset) => ({ dataset, out: arrowFile(dataset, rows), rows }))
      .filter(({ out }) => !existsSync(out)),
  );
  const datagen = path.join(targetDirectory(), "release", "parallax-datagen");
  for (const { dataset, out, rows } of missing) {
    const args = [dataset, "--rows", String(rows), "--seed", "42", "--stream", "--out", out];
    run(datagen, args);
  }
}

/** Builds the harness's page on the package's build, which `vp run @basis/parallax#bench` builds first. */
function buildHarness(): void {
  run("vp", ["build", "tests/perf/harness"]);
}

export { arrowFile, buildHarness, data, output, parallax, writeData };
