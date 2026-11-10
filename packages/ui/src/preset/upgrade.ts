/* An upgrade of basis-ui in one step:
 *
 *   vp run upgrade [VERSION]             moves @basis/ui, and @basis/parallax where the app has it, to VERSION, such
 *                                        as 0.4.0, or to the release the feed tags `latest`, the two at one version
 *   vp run upgrade [VERSION] --dry-run   prints what that would do, and changes nothing
 *
 * It refuses a working tree with changes not committed, so the upgrade's changes are a diff of their own. It installs
 * the new version, prints its changelog's entries after the installed version, runs `vp run sync` in a process of its
 * own, so the new version's preset writes the framework's files, then the codemods the releases in between ship
 * (codemods.ts), and `vp run verify`, and ends with a summary of what to look at. A dry run installs the new version in
 * a folder of its own, outside the app, to read its changelog and run its codemods on the app's files without
 * writing them. Every failure ends with one ERROR line, after the output of the step that failed. */

import path from "node:path";

import { git } from "./git.ts";
import { appDependencies, compareVersions, exactVersion, installedVersion } from "./installed.ts";
import { TaskError } from "./task-error.ts";
import { changelogText, previewText, runsText, summaryText } from "./upgrade-report.ts";
import type { ReleaseNotes } from "./upgrade-report.ts";
import { changelogOf, codemodRuns, latestRelease, say, vp, withRelease } from "./upgrade-steps.ts";

/** The packages that release together, at one version. */
const released = ["@basis/ui", "@basis/parallax"];

/** What an upgrade moves: the packages the app has, and from which version to which. */
interface Move {
  readonly names: readonly string[];
  readonly from: string;
  readonly to: string;
}

/** The version asked for, if any, and whether this is a dry run, from the task's arguments. */
function optionsOf(args: readonly string[]): {
  readonly asked: string | undefined;
  readonly dryRun: boolean;
} {
  const rest = args.filter((arg) => arg !== "--dry-run");
  const [asked, ...extra] = rest;
  if (extra.length > 0 || (asked !== undefined && !exactVersion.test(asked))) {
    throw new TaskError(
      "ERROR vp run upgrade takes one version at most, written exactly, and --dry-run: run vp run upgrade for the latest release, or vp run upgrade VERSION, such as vp run upgrade 0.4.0, with --dry-run to see what it would do.",
    );
  }
  return { asked, dryRun: rest.length < args.length };
}

/** Whether the app's folder holds changes git has not committed, which only a dry run goes on with. */
function dirtyTree(root: string, dryRun: boolean): boolean {
  const status = git(root, ["status", "--porcelain", "--", "."]);
  if (status === undefined) {
    throw new TaskError(
      "ERROR this folder is not a git clone, so the upgrade's changes could be neither told from the app's nor undone: run vp run upgrade in the app's clone, with git on the PATH.",
    );
  }
  if (status !== "" && !dryRun) {
    throw new TaskError(
      "ERROR the working tree has changes not committed, which the upgrade's own would mix with: commit them, or stash them with git stash, then run vp run upgrade again.",
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

/** Runs `vp run sync`, in a process of its own, so the new version's preset writes the framework's files. */
function sync(root: string, version: string): void {
  if (!vp(root, ["run", "sync"])) {
    throw new TaskError(
      `ERROR @basis/ui ${version} is installed, but vp run sync failed, as its ERROR lines above say: fix what they say, then run vp run sync and vp run verify.`,
    );
  }
}

/** Runs `vp run verify`, and the summary of the upgrade, which ends in an ERROR line when verify fails. */
function verified(root: string, move: Move, notes: ReleaseNotes): string {
  const passed = vp(root, ["run", "verify"]);
  const summary = summaryText(move, notes, passed);
  if (!passed) {
    say(summary);
    throw new TaskError(
      `ERROR @basis/ui ${move.to} is installed, its files synced and its codemods run, but vp run verify fails, as its output above says: fix what it says, then commit the upgrade.`,
    );
  }
  return summary;
}

/** A real upgrade: install, print the changelog, sync, run the codemods, verify, and print the summary. */
async function upgradeApp(root: string, move: Move): Promise<string> {
  install(root, move);
  const packageDir = path.join(root, "node_modules/@basis/ui");
  const { sections, version } = await changelogOf(packageDir, move.from);
  say(changelogText(sections, version));
  sync(root, version);
  const runs = await codemodRuns(root, packageDir, { from: move.from, version, write: true });
  say(runsText(runs));
  return verified(root, { ...move, to: version }, { runs, sections });
}

/** A dry run: what the upgrade would print and change, with nothing changed. */
async function preview(root: string, move: Move, dirty: boolean): Promise<string> {
  return withRelease(root, move.to, async (packageDir) => {
    const { sections, version } = await changelogOf(packageDir, move.from);
    const runs = await codemodRuns(root, packageDir, { from: move.from, version, write: false });
    return previewText({ ...move, to: version }, { runs, sections }, dirty);
  });
}

/** `vp run upgrade [VERSION] [--dry-run]`. */
async function upgrade(root: string, args: readonly string[]): Promise<string> {
  const { asked, dryRun } = optionsOf(args);
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

export { upgrade };
