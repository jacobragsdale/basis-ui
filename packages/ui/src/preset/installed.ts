/* What the app at a root has installed, and what its package.json names, for the tasks that compare the two. */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { z } from "zod";

const versionSchema = z.object({ version: z.string() });
const versionsSchema = z.record(z.string(), z.string());
/** What a package.json says of its dependencies. */
const manifestSchema = z.object({
  dependencies: versionsSchema.optional(),
  devDependencies: versionsSchema.optional(),
});

/** What a promise's failure is turned into where only success matters: nothing. */
function ignored(): null {
  return null;
}

/** A version written exactly, as basis-ui's packages are pinned, such as `0.4.0` or `0.5.0-rc.1`. */
const exactVersion = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/u;

/** How two prerelease identifiers compare, as semver orders them: numbers by value, before any word. */
function compareIdentifiers(left: string, right: string): number {
  const numeric = /^\d+$/u;
  if (numeric.test(left) && numeric.test(right)) {
    return Math.sign(Number(left) - Number(right));
  }
  if (numeric.test(left) !== numeric.test(right)) {
    return numeric.test(left) ? -1 : 1;
  }
  return left.localeCompare(right, "en");
}

/** How two lists compare, item by item with `compare`, then a shorter list before a longer one it begins. */
function compareLists(
  left: readonly string[],
  right: readonly string[],
  compare: (one: string, other: string) => number,
): number {
  const index = left.findIndex(
    (item, at) => at >= right.length || compare(item, right[at] ?? "") !== 0,
  );
  if (index === -1) {
    return Math.sign(left.length - right.length);
  }
  const other = right[index];
  return other === undefined ? 1 : compare(left[index] ?? "", other);
}

/** How two numbers of a version compare. */
function compareNumbers(left: string, right: string): number {
  return Math.sign(Number(left) - Number(right));
}

/** How two exact versions compare, as semver orders them: below zero when `left` is older, zero when they are one. A
 * prerelease, such as `0.5.0-rc.1`, comes before its release. */
function compareVersions(left: string, right: string): number {
  const [leftCore = "", ...leftPre] = left.split("-");
  const [rightCore = "", ...rightPre] = right.split("-");
  const cores = compareLists(leftCore.split("."), rightCore.split("."), compareNumbers);
  if (cores !== 0 || (leftPre.length === 0 && rightPre.length === 0)) {
    return cores;
  }
  if (leftPre.length === 0 || rightPre.length === 0) {
    return leftPre.length === 0 ? 1 : -1;
  }
  return compareLists(
    leftPre.join("-").split("."),
    rightPre.join("-").split("."),
    compareIdentifiers,
  );
}

/** The version of `name` installed for the app at `root`, or `undefined` when it is not installed. It reads the
 * package's folder in the app's node_modules first, as installed now, since Node caches what it resolved once, which
 * `vp run upgrade` changes mid-run. */
async function installedVersion(root: string, name: string): Promise<string | undefined> {
  try {
    const direct = path.join(root, "node_modules", name, "package.json");
    const manifest = existsSync(direct)
      ? direct
      : createRequire(path.join(root, "package.json")).resolve(`${name}/package.json`);
    return versionSchema.parse(JSON.parse(await readFile(manifest, "utf8"))).version;
  } catch {
    return undefined;
  }
}

/** Every dependency the app's package.json names, development ones included, with its version spec. */
async function appDependencies(root: string): Promise<ReadonlyMap<string, string>> {
  const text = await readFile(path.join(root, "package.json"), "utf8").catch(() => "{}");
  const manifest = manifestSchema.safeParse(JSON.parse(text));
  const { dependencies = {}, devDependencies = {} } = manifest.success ? manifest.data : {};
  return new Map(Object.entries({ ...devDependencies, ...dependencies }));
}

/** The command that installs the Chromium Playwright `version` pins. It runs that Playwright from the feed, since it is
 * `@basis/ui`'s dependency rather than the app's, so `vp exec playwright` finds no command in an app. */
function chromiumInstall(version: string): string {
  return `vp dlx playwright@${version} install chromium`;
}

export {
  appDependencies,
  chromiumInstall,
  compareVersions,
  exactVersion,
  ignored,
  installedVersion,
  manifestSchema,
  versionSchema,
};
