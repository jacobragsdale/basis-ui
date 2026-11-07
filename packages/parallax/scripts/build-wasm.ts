/* Builds the engine for the browser: parallax-wasm for wasm32 in release, then wasm-bindgen's glue for it, into
 * `wasm/`, which `vp pack` bundles into the package. Run it with `vp run @basis/parallax#wasm`; the package's `build`
 * and `test` tasks run it first, and Vite+ replays it from its cache until the Rust changes.
 *
 * It needs the Rust toolchain `rust-toolchain.toml` names and the `wasm-bindgen` command at the version in
 * `Cargo.lock`. Each failure is one line that starts with ERROR and ends with the fix. */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = fileURLToPath(new URL("../wasm", import.meta.url));

/** A failure the build reports as one line, saying what failed and how to fix it. */
class BuildError extends Error {
  public override readonly name = "BuildError";
}

function fail(message: string): never {
  throw new BuildError(message);
}

/** Runs a command in the package's folder, printing its output, and returns what it wrote to stdout. */
function run(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): string {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (result.error !== undefined) {
    fail(`${command} did not start (${result.error.message}); install it and put it on PATH.`);
  }
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed; its output is above.`);
  }
  return result.stdout;
}

/** The wasm-bindgen version Cargo.lock pins, which the command-line tool must match. */
function lockedBindgen(): string {
  const lock = readFileSync(new URL("../Cargo.lock", import.meta.url), "utf8");
  const version = /\[\[package\]\]\nname = "wasm-bindgen"\nversion = "(?<version>[^"]+)"/u.exec(
    lock,
  )?.groups?.["version"];
  if (version === undefined) {
    fail(
      "Cargo.lock names no wasm-bindgen; run `cargo update -p wasm-bindgen` in packages/parallax.",
    );
  }
  return version;
}

function checkBindgen(version: string): void {
  const installed = run("wasm-bindgen", ["--version"]).trim();
  if (installed !== `wasm-bindgen ${version}`) {
    fail(
      `${installed} is installed, but Cargo.lock pins wasm-bindgen ${version}; install that one with \`cargo install wasm-bindgen-cli --version ${version} --locked\`.`,
    );
  }
}

/** Where cargo writes its build, which CARGO_TARGET_DIR may move. */
function targetDirectory(): string {
  const metadata: unknown = JSON.parse(
    run("cargo", ["metadata", "--format-version", "1", "--no-deps"]),
  );
  if (
    typeof metadata === "object" &&
    metadata !== null &&
    "target_directory" in metadata &&
    typeof metadata.target_directory === "string"
  ) {
    return metadata.target_directory;
  }
  return fail(
    "cargo metadata named no target directory; check that `cargo metadata` runs in packages/parallax.",
  );
}

function build(): void {
  const version = lockedBindgen();
  checkBindgen(version);
  /* Parallel rustc jobs have run machines with little free memory out of it, so one job unless the caller sets
   * CARGO_BUILD_JOBS, as CI does. */
  run(
    "cargo",
    ["build", "--release", "--locked", "-p", "parallax-wasm", "--target", "wasm32-unknown-unknown"],
    { ...process.env, CARGO_BUILD_JOBS: process.env["CARGO_BUILD_JOBS"] ?? "1" },
  );
  run("wasm-bindgen", [
    "--target",
    "web",
    // Function names are a quarter of the module and only name frames in stack traces (spike 0.3).
    "--remove-name-section",
    "--out-dir",
    outDir,
    "--out-name",
    "parallax_wasm",
    `${targetDirectory()}/wasm32-unknown-unknown/release/parallax_wasm.wasm`,
  ]);
  process.stdout.write(`Wrote ${outDir}\n`);
}

try {
  build();
} catch (error: unknown) {
  if (!(error instanceof BuildError)) {
    throw error;
  }
  process.stderr.write(`ERROR ${error.message}\n`);
  process.exitCode = 1;
}
