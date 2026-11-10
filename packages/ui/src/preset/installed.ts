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
  exactVersion,
  ignored,
  installedVersion,
  manifestSchema,
  versionSchema,
};
