/* Type-checks the component catalogue's examples as an app compiles them: each is written to a module of its own in
 * packages/consumer, the app configured exactly as the README says, and checked there with the app's TypeScript. */

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

import type { Catalogue } from "./build.ts";

const consumer = new URL("../../../consumer/", import.meta.url);
const folder = new URL(".catalogue-examples/", consumer);

/** Writes each example into the consumer app's scratch folder, with a tsconfig that extends the app's. */
function writeExamples(catalogue: Catalogue): void {
  rmSync(folder, { force: true, recursive: true });
  mkdirSync(folder, { recursive: true });
  for (const component of catalogue.components) {
    if (component.example !== undefined) {
      writeFileSync(new URL(`${component.family}.tsx`, folder), component.example);
    }
  }
  const tsconfig = { extends: "../tsconfig.json", include: ["*.tsx"] };
  writeFileSync(new URL("tsconfig.json", folder), `${JSON.stringify(tsconfig, undefined, 2)}\n`);
}

/** tsc's report on every example in `catalogue`, or the empty string when they all compile. */
function exampleErrors(catalogue: Catalogue): string {
  writeExamples(catalogue);
  const tsc = new URL("node_modules/.bin/tsc", consumer).pathname;
  try {
    execFileSync(tsc, ["--noEmit", "-p", folder.pathname], { encoding: "utf8" });
    return "";
  } catch (error) {
    return error instanceof Error && "stdout" in error
      ? String(error.stdout).trim()
      : String(error);
  }
}

export { exampleErrors };
