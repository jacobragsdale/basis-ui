/* The steps of `vp run upgrade` (upgrade.ts): running vp, asking the feed for its latest release, reading a release's
 * changelog and running its codemods, and installing a release outside the app for a dry run to read. */

import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { parseChangelog, releasesBetween } from "./changelog.ts";
import { codemodsBetween, runCodemods, shippedCodemods } from "./codemods.ts";
import { exactVersion, ignored, versionSchema } from "./installed.ts";
import { TaskError } from "./task-error.ts";
import type { ReleaseNotes } from "./upgrade-report.ts";

/** The failure when `vp` itself could not be run, as `spawnSync` reports it. */
function unrunnable(error: Error): TaskError {
  return new TaskError(
    `ERROR vp run upgrade could not run vp (${error.message}): check that Vite+'s vp is on the PATH, as vp --version shows, then run vp run upgrade again.`,
  );
}

/** Runs `vp ARGS` in `folder`, its output the task's, or kept back unless it fails when `quiet`, and says whether it
 * passed. */
function vp(folder: string, args: readonly string[], quiet = false): boolean {
  const ran = spawnSync("vp", args, {
    cwd: folder,
    encoding: "utf8",
    stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (ran.error !== undefined) {
    throw unrunnable(ran.error);
  }
  if (quiet && ran.status !== 0) {
    process.stderr.write(`${ran.stdout}${ran.stderr}`);
  }
  return ran.status === 0;
}

/** Prints a part of the upgrade's report as it goes, before the output of the next step. */
function say(text: string): void {
  process.stdout.write(`${text}\n\n`);
}

/** The latest release's version, which the feed's `latest` tag names. `@basis/ui@latest` would not do: pnpm resolves
 * it to the newest version older than its `minimumReleaseAge`, so a release out today would be passed over. */
function latestRelease(root: string): string {
  const asked = spawnSync("vp", ["info", "@basis/ui", "dist-tags.latest"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (asked.error !== undefined) {
    throw unrunnable(asked.error);
  }
  const version = asked.stdout.trim().split("\n").at(-1) ?? "";
  if (asked.status !== 0 || !exactVersion.test(version)) {
    throw new TaskError(
      "ERROR the feed named no latest release of @basis/ui, as the output above says: check the @basis registry in .npmrc and the network, or name the version, as in vp run upgrade 0.4.0.",
    );
  }
  return version;
}

/** The version of the package at `packageDir` and its changelog's sections after `from`, or `undefined` for sections
 * when it ships no changelog. */
async function changelogOf(
  packageDir: string,
  from: string,
): Promise<{ readonly sections: ReleaseNotes["sections"]; readonly version: string }> {
  const manifest = await readFile(path.join(packageDir, "package.json"), "utf8");
  const { version } = versionSchema.parse(JSON.parse(manifest));
  const text = await readFile(path.join(packageDir, "CHANGELOG.md"), "utf8").catch(ignored);
  const sections = text === null ? undefined : releasesBetween(parseChangelog(text), from, version);
  return { sections, version };
}

/** What the codemods the package at `packageDir`, at `version`, ships after `from` change in the app, written to its
 * files when `write` is true. */
async function codemodRuns(
  root: string,
  packageDir: string,
  between: { readonly from: string; readonly version: string; readonly write: boolean },
): Promise<ReleaseNotes["runs"]> {
  const { from, version, write } = between;
  const codemods = codemodsBetween(await shippedCodemods(packageDir, version), from, version);
  return runCodemods(root, codemods, write);
}

/** The release at `to`, installed in a folder of its own with the app's registry settings, for a dry run to read; the
 * folder is removed once `read` is done with it. */
async function withRelease<Result>(
  root: string,
  to: string,
  read: (packageDir: string) => Promise<Result>,
): Promise<Result> {
  const made = await mkdtemp(path.join(tmpdir(), "basis-upgrade-"));
  const folder = await realpath(made);
  try {
    await writeFile(
      path.join(folder, "package.json"),
      JSON.stringify({ name: "basis-upgrade-preview", private: true }),
    );
    // The app's registry settings, and basis-ui's releases installing the day they are out, as the app's own do.
    await copyFile(path.join(root, ".npmrc"), path.join(folder, ".npmrc")).catch(ignored);
    await writeFile(
      path.join(folder, "pnpm-workspace.yaml"),
      'minimumReleaseAgeExclude:\n  - "@basis/*"\n',
    );
    if (!vp(folder, ["add", "--save-exact", "--ignore-scripts", `@basis/ui@${to}`], true)) {
      throw new TaskError(
        `ERROR vp add could not fetch @basis/ui ${to} to read it, as its output above says: check that the feed has that version, with vp info @basis/ui versions, then run vp run upgrade --dry-run again.`,
      );
    }
    return await read(path.join(folder, "node_modules/@basis/ui"));
  } finally {
    await rm(folder, { force: true, recursive: true });
  }
}

export { changelogOf, codemodRuns, latestRelease, say, vp, withRelease };
