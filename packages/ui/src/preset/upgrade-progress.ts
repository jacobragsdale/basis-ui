/* How far an upgrade got (upgrade.ts): the steps that ran, kept in the clone's git folder, where `git status` never
 * shows it, so that an upgrade that stops part-way can be finished with `vp run upgrade --continue`, or undone. The
 * file is written once the install has run and removed once verify passes. It is read by the version the upgrade moved
 * to, whose tasks `vp run upgrade --continue` runs, so its form stays the same from one release to the next. */

import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { git } from "./git.ts";
import { ignored } from "./installed.ts";
import { TaskError } from "./task-error.ts";
import { listed } from "./upgrade-report.ts";

/** An upgrade's steps, in the order it takes them. `sync` installs again after it writes the framework's files. */
const upgradeSteps = ["install", "sync", "codemods", "verify"] as const;
type UpgradeStep = (typeof upgradeSteps)[number];

/** How many codemods ran, and the files they changed, for the summary. */
const codemodsSchema = z.object({ files: z.array(z.string()).readonly(), runs: z.number() });
const progressSchema = z.object({
  codemods: codemodsSchema.optional(),
  done: z.array(z.enum(upgradeSteps)).readonly(),
  from: z.string(),
  names: z.array(z.string()).readonly(),
  to: z.string(),
});
type Progress = z.infer<typeof progressSchema>;

/** The file that holds an upgrade's progress, in the clone's git folder. */
function progressFile(root: string): string {
  const file = git(root, ["rev-parse", "--git-path", "basis-ui-upgrade.json"]);
  if (file === undefined) {
    throw new TaskError(
      "ERROR this folder is not a git clone, so the upgrade's progress cannot be kept: run vp run upgrade in the app's clone, with git on the PATH.",
    );
  }
  return path.resolve(root, file);
}

/** The progress of an upgrade that stopped, or `undefined` when none did. */
async function readProgress(root: string): Promise<Progress | undefined> {
  const text = await readFile(progressFile(root), "utf8").catch(ignored);
  if (text === null) {
    return undefined;
  }
  const parsed = progressSchema.safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : undefined;
}

async function writeProgress(root: string, progress: Progress): Promise<void> {
  await writeFile(progressFile(root), `${JSON.stringify(progress)}\n`);
}

async function clearProgress(root: string): Promise<void> {
  await rm(progressFile(root), { force: true });
}

/** The ERROR line of an upgrade that stopped at `step`: which steps ran, which did not, and how to finish or undo it. */
function stoppedLine(progress: Progress, step: UpgradeStep): string {
  const ran = upgradeSteps.filter((each) => progress.done.includes(each));
  const left = upgradeSteps.filter((each) => !progress.done.includes(each));
  return `ERROR the upgrade of @basis/ui from ${progress.from} to ${progress.to} stopped at ${step}, after ${listed(ran)} ran: fix what the lines above say, then run vp run upgrade --continue, which runs ${listed(left)}; or undo the upgrade with git restore . and git clean -fd ., since it began on a clean tree, then vp install.`;
}

export { clearProgress, readProgress, stoppedLine, upgradeSteps, writeProgress };
export type { Progress, UpgradeStep };
