/* The toolchain an upgrade moves with @basis/ui (upgrade.ts): the app's own pins on `vite-plus`, which @basis/ui
 * peers on at one version, and on `typescript`, which the synced pnpm-workspace.yaml overrides orval's to. An app that
 * pins either exactly, as the template does, is moved to the version the new release needs, in the field that names
 * it, so the lockfile the upgrade leaves installs as verify ran it. */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { exactVersion, ignored } from "./installed.ts";

const versionsSchema = z.record(z.string(), z.string());
const appManifestSchema = z.object({
  dependencies: versionsSchema.optional(),
  devDependencies: versionsSchema.optional(),
});
const releaseManifestSchema = z.object({ peerDependencies: versionsSchema.optional() });

/** A pin to move: the package, the version the release needs, and whether package.json names it a development one. */
interface Pin {
  readonly name: string;
  readonly version: string;
  readonly dev: boolean;
}

/** The versions the release at `packageDir` needs of the toolchain, where it names them exactly. */
async function wantedVersions(packageDir: string): Promise<ReadonlyMap<string, string>> {
  const manifestText = await readFile(path.join(packageDir, "package.json"), "utf8");
  const manifest = releaseManifestSchema.safeParse(JSON.parse(manifestText));
  const workspaceFile = path.join(packageDir, "sync/pnpm-workspace.yaml");
  const workspace = await readFile(workspaceFile, "utf8").catch(ignored);
  const typescript = /^\s+typescript:\s*"?(?<version>[^\s"]+)"?\s*$/mu.exec(workspace ?? "")
    ?.groups?.["version"];
  const vitePlus = manifest.success ? manifest.data.peerDependencies?.["vite-plus"] : undefined;
  return new Map(
    [
      ["vite-plus", vitePlus],
      ["typescript", typescript],
    ].filter((entry): entry is [string, string] => exactVersion.test(entry[1] ?? "")),
  );
}

/** Each pin of the app at `root` that the release at `packageDir` needs moved: one the app pins exactly, at another
 * version. A range the app wrote is its own, and left. */
async function pinsToMove(root: string, packageDir: string): Promise<readonly Pin[]> {
  const wanted = await wantedVersions(packageDir);
  const manifestText = await readFile(path.join(root, "package.json"), "utf8");
  const parsed = appManifestSchema.safeParse(JSON.parse(manifestText));
  const { dependencies = {}, devDependencies = {} } = parsed.success ? parsed.data : {};
  return [...wanted].flatMap(([name, version]): Pin[] => {
    const dev = Object.hasOwn(devDependencies, name);
    const spec = dev ? devDependencies[name] : dependencies[name];
    return spec !== undefined && exactVersion.test(spec) && spec !== version
      ? [{ dev, name, version }]
      : [];
  });
}

export { pinsToMove };
export type { Pin };
