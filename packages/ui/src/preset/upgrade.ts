/* An upgrade of basis-ui in one step:
 *
 *   vp run upgrade [VERSION]             moves @basis/ui, and @basis/parallax where the app has it, to VERSION, such
 *                                        as 0.4.0, or to the release the feed tags `latest`, the two at one version
 *   vp run upgrade [VERSION] --dry-run   prints what that would do, and changes nothing
 *   vp run upgrade --continue            finishes an upgrade that stopped part-way, from the step it stopped at
 *
 * It refuses a working tree with changes not committed, so the upgrade's changes are a diff of their own. Its steps
 * are install, sync, codemods and verify: it installs the new version and prints its changelog's entries after the
 * installed version, runs `vp run sync` in a process of its own, so the new version's preset writes the framework's
 * files, moves the app's pins on `vite-plus` and `typescript` to the versions the release needs and installs again
 * (upgrade-pins.ts), runs the codemods the releases in between ship (codemods.ts), then `vp run verify`, and ends with
 * a summary of what to look at. Each step that passes is recorded (upgrade-progress.ts); one that fails ends the task
 * with an ERROR line naming the steps that ran and those that did not, and how to finish or undo the upgrade. A dry
 * run installs the new version in a folder of its own, outside the app, to read its changelog and run its codemods on
 * the app's files without writing them. Every failure ends with one ERROR line, after the output of the step that
 * failed. */

import path from "node:path";

import { excludeAdvice, git, refusedClone, uncommittedList } from "./git.ts";
import { appDependencies, compareVersions, exactVersion, installedVersion } from "./installed.ts";
import { TaskError } from "./task-error.ts";
import { pinsToMove } from "./upgrade-pins.ts";
import { clearProgress, readProgress, stoppedLine, writeProgress } from "./upgrade-progress.ts";
import type { Progress, UpgradeStep } from "./upgrade-progress.ts";
import type { ReleaseNotes } from "./upgrade-report.ts";
import {
  changelogText,
  codemodsDone,
  previewText,
  runsText,
  summaryText,
} from "./upgrade-report.ts";
import { changelogOf, codemodRuns, latestRelease, say, vp, withRelease } from "./upgrade-steps.ts";

/** The packages that release together, at one version. */
const released = ["@basis/ui", "@basis/parallax"];

/** What an upgrade moves: the packages the app has, and from which version to which. */
interface Move {
  readonly names: readonly string[];
  readonly from: string;
  readonly to: string;
}

const usage =
  "run vp run upgrade for the latest release, or vp run upgrade VERSION, such as vp run upgrade 0.4.0, with --dry-run to see what it would do, or vp run upgrade --continue to finish one that stopped";

/** The version asked for, if any, and whether this is a dry run or the rest of an upgrade that stopped, from the
 * task's arguments. */
function optionsOf(args: readonly string[]): {
  readonly asked: string | undefined;
  readonly dryRun: boolean;
  readonly continuing: boolean;
} {
  const rest = args.filter((arg) => arg !== "--dry-run" && arg !== "--continue");
  const [asked, ...extra] = rest;
  const dryRun = args.includes("--dry-run");
  const continuing = args.includes("--continue");
  if (
    extra.length > 0 ||
    (asked !== undefined && !exactVersion.test(asked)) ||
    (continuing && (dryRun || asked !== undefined))
  ) {
    throw new TaskError(
      `ERROR vp run upgrade takes one version at most, written exactly, and --dry-run, or --continue alone: ${usage}.`,
    );
  }
  return { asked, continuing, dryRun };
}

/** Whether the app's folder holds changes git has not committed, which only a dry run goes on with. */
function dirtyTree(root: string, dryRun: boolean): boolean {
  const status = git(root, ["status", "--porcelain", "--", "."]);
  if (status === undefined) {
    throw new TaskError(
      refusedClone(root, "vp run upgrade again") ??
        "ERROR this folder is not a git clone, so the upgrade's changes could be neither told from the app's nor undone: run vp run upgrade in the app's clone, with git on the PATH.",
    );
  }
  if (status !== "" && !dryRun) {
    throw new TaskError(
      `ERROR the working tree has changes not committed${uncommittedList(root, true)}, which the upgrade's own would mix with: commit them, or stash them with git stash, ${excludeAdvice.replace("keep ", "keeping ")}, then run vp run upgrade again; to finish an upgrade that stopped part-way, run vp run upgrade --continue.`,
    );
  }
  return status !== "";
}

/** The installed version of `@basis/ui`, which an upgrade moves from. */
async function installedFrom(root: string): Promise<string> {
  const named = await appDependencies(root);
  const spec = named.get("@basis/ui");
  if (spec?.startsWith("workspace:") === true) {
    throw new TaskError(
      `ERROR @basis/ui is linked from this workspace (${spec}), so it moves with the workspace, not from the feed: run vp run sync when it changes, and vp run upgrade in an app that installs it from the feed.`,
    );
  }
  const from = await installedVersion(root, "@basis/ui");
  if (from === undefined) {
    throw new TaskError(
      "ERROR @basis/ui is not installed here, so there is no version to upgrade from: run vp install, then vp run upgrade again.",
    );
  }
  return from;
}

/** What to print when there is nothing to upgrade, `to` being the installed version; a version older than it fails. */
function settled(from: string, to: string, asked: string | undefined): string | undefined {
  const order = compareVersions(to, from);
  if (order < 0) {
    throw new TaskError(
      `ERROR @basis/ui ${from} is installed, newer than ${to}, and vp run upgrade moves only forward: to go back, revert the commit that upgraded it.`,
    );
  }
  return order === 0
    ? `@basis/ui ${from} is installed, ${asked === undefined ? "the latest release" : "the version asked for"}, so there is nothing to upgrade.`
    : undefined;
}

/** Installs the released packages the app has at the version the upgrade moves to, pinned exactly. */
function install(root: string, { from, names, to }: Move): void {
  say(`Upgrading ${names.join(" and ")} from ${from} to ${to}.`);
  if (!vp(root, ["add", "--save-exact", ...names.map((name) => `${name}@${to}`)])) {
    throw new TaskError(
      `ERROR vp add could not install ${names.join(" and ")} at ${to}, as its output above says: check that the feed has that version, with vp info @basis/ui versions, then run vp run upgrade again.`,
    );
  }
}

/** Runs `vp run sync`, in a process of its own, so the new version's preset writes the framework's files, then moves
 * the toolchain's pins and installs again, so verify runs on what the lockfile will install. */
async function sync(root: string, packageDir: string, version: string): Promise<void> {
  if (!vp(root, ["run", "sync"])) {
    throw new TaskError(
      `ERROR vp run sync failed for @basis/ui ${version}, as its ERROR lines above say: fix what they say.`,
    );
  }
  const pins = await pinsToMove(root, packageDir);
  const moved = [false, true].every((dev) => {
    const specs = pins.filter((pin) => pin.dev === dev).map((pin) => `${pin.name}@${pin.version}`);
    return (
      specs.length === 0 || vp(root, ["add", "--save-exact", ...(dev ? ["-D"] : []), ...specs])
    );
  });
  if (!moved) {
    throw new TaskError(
      `ERROR vp add could not move ${pins.map((pin) => `${pin.name} to ${pin.version}`).join(" and ")}, which @basis/ui ${version} needs, as its output above says: check that the feed has them.`,
    );
  }
  if (pins.length === 0 && !vp(root, ["install"])) {
    throw new TaskError(
      "ERROR vp install failed after vp run sync wrote the framework's files, as its output above says: fix what it says.",
    );
  }
}

/** Runs `vp run verify`, and the summary of the upgrade, which ends in an ERROR line when verify fails. */
function verified(root: string, progress: Progress, sections: ReleaseNotes["sections"]): string {
  const passed = vp(root, ["run", "verify"]);
  const codemods = progress.codemods ?? { files: [], runs: 0 };
  const summary = summaryText(progress, { codemods, sections }, passed);
  if (!passed) {
    say(summary);
    throw new TaskError(
      `ERROR @basis/ui ${progress.to} is installed, its files synced and its codemods run, but vp run verify fails, as its output above says: fix what it says.`,
    );
  }
  return summary;
}

/** Runs `step` of the upgrade unless it has run, and records it once it passes; a failure ends the task with its own
 * lines and the one that says how far the upgrade got. */
async function step(
  { root, progress }: { readonly root: string; readonly progress: Progress },
  name: UpgradeStep,
  action: () => Promise<Partial<Progress>>,
): Promise<Progress> {
  if (progress.done.includes(name)) {
    return progress;
  }
  let changed: Partial<Progress> = {};
  try {
    changed = await action();
  } catch (error) {
    const said =
      error instanceof TaskError
        ? error.message
        : `ERROR the upgrade's ${name} step failed: ${String(error)}.`;
    throw new TaskError(`${said}\n${stoppedLine(progress, name)}`);
  }
  const next = { ...progress, ...changed, done: [...progress.done, name] };
  await writeProgress(root, next);
  return next;
}

/** The upgrade's steps after the install, those of `progress` not yet run: sync, the codemods and verify. */
async function finish(root: string, started: Progress): Promise<string> {
  const packageDir = path.join(root, "node_modules/@basis/ui");
  const { sections, unreadable, version } = await changelogOf(packageDir, started.from);
  if (!started.done.includes("sync")) {
    say(changelogText(sections, version, unreadable));
  }
  let progress = await step({ progress: started, root }, "sync", async () => {
    await sync(root, packageDir, version);
    return {};
  });
  progress = await step({ progress, root }, "codemods", async () => {
    const runs = await codemodRuns(root, packageDir, { from: started.from, version, write: true });
    say(runsText(runs));
    const failed = runs.flatMap((run) => run.failed);
    if (failed.length > 0) {
      throw new TaskError(failed.join("\n"));
    }
    return { codemods: codemodsDone(runs) };
  });
  let summary = "";
  await step({ progress, root }, "verify", async () => {
    summary = verified(root, progress, sections);
    return Promise.resolve({});
  });
  await clearProgress(root);
  return summary;
}

/** A real upgrade: install, then the steps after it. */
async function upgradeApp(root: string, move: Move): Promise<string> {
  install(root, move);
  const progress: Progress = { ...move, done: ["install"] };
  await writeProgress(root, progress);
  return finish(root, progress);
}

/** `vp run upgrade --continue`: the steps of the upgrade that stopped, from the one it stopped at. */
async function continueUpgrade(root: string): Promise<string> {
  const progress = await readProgress(root);
  if (progress === undefined) {
    throw new TaskError(
      "ERROR no upgrade stopped part-way in this clone, so there is nothing to continue: run vp run upgrade to start one.",
    );
  }
  const installed = await installedVersion(root, "@basis/ui");
  if (installed !== progress.to) {
    await clearProgress(root);
    throw new TaskError(
      `ERROR the upgrade that stopped moved @basis/ui to ${progress.to}, but ${installed ?? "no version"} is installed, so it was undone: run vp run upgrade to start again.`,
    );
  }
  return finish(root, progress);
}

/** A dry run: what the upgrade would print and change, with nothing changed. */
async function preview(root: string, move: Move, dirty: boolean): Promise<string> {
  return withRelease(root, move.to, async (packageDir) => {
    const { sections, unreadable, version } = await changelogOf(packageDir, move.from);
    const runs = await codemodRuns(root, packageDir, { from: move.from, version, write: false });
    return previewText({ ...move, to: version }, { runs, sections, unreadable }, dirty);
  });
}

/** `vp run upgrade [VERSION] [--dry-run]`, an upgrade from its start. */
async function startUpgrade(
  root: string,
  { asked, dryRun }: { readonly asked: string | undefined; readonly dryRun: boolean },
): Promise<string> {
  const dirty = dirtyTree(root, dryRun);
  const from = await installedFrom(root);
  const to = asked ?? latestRelease(root);
  const nothing = settled(from, to, asked);
  if (nothing !== undefined) {
    return nothing;
  }
  const named = await appDependencies(root);
  const names = released.filter((name) => name === "@basis/ui" || named.has(name));
  return dryRun ? preview(root, { from, names, to }, dirty) : upgradeApp(root, { from, names, to });
}

/** `vp run upgrade [VERSION] [--dry-run]`, or `vp run upgrade --continue`. */
async function upgrade(root: string, args: readonly string[]): Promise<string> {
  const options = optionsOf(args);
  return options.continuing ? continueUpgrade(root) : startUpgrade(root, options);
}

export { upgrade };
