/* An upgrade of basis-ui in one step:
 *
 *   vp run upgrade            moves @basis/ui, and @basis/parallax where the app has it, to the release the feed tags
 *                             `latest`
 *   vp run upgrade VERSION    moves them to VERSION, such as 0.4.0, the two always at one version
 *
 * then runs `vp run sync` and `vp run verify`, each in a process of its own, so the new version's preset writes the
 * framework's files and checks the app. Every failure ends with one ERROR line, after the output of the step that
 * failed. */

import { spawnSync } from "node:child_process";

import { appDependencies, exactVersion, installedVersion } from "./installed.ts";
import { TaskError } from "./task-error.ts";

/** The packages that release together, at one version. */
const released = ["@basis/ui", "@basis/parallax"];

/** The failure when `vp` itself could not be run, as `spawnSync` reports it. */
function unrunnable(error: Error): TaskError {
  return new TaskError(
    `ERROR vp run upgrade could not run vp (${error.message}): check that Vite+'s vp is on the PATH, as vp --version shows, then run vp run upgrade again.`,
  );
}

/** Runs `vp ARGS` in the app's root, its output the task's, and says whether it passed. */
function vp(root: string, args: readonly string[]): boolean {
  const ran = spawnSync("vp", args, { cwd: root, stdio: "inherit" });
  if (ran.error !== undefined) {
    throw unrunnable(ran.error);
  }
  return ran.status === 0;
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

/** The version to move to, from the task's arguments. */
function targetOf(args: readonly string[]): string {
  const [target = "latest", ...extra] = args;
  if (extra.length > 0 || (target !== "latest" && !exactVersion.test(target))) {
    throw new TaskError(
      "ERROR vp run upgrade takes one version at most, written exactly: run vp run upgrade for the latest release, or vp run upgrade VERSION, such as vp run upgrade 0.4.0.",
    );
  }
  return target;
}

/** Installs the released packages the app has at `target`, pinned exactly. */
async function install(root: string, target: string): Promise<void> {
  const named = await appDependencies(root);
  const names = released.filter((name) => named.has(name));
  if (!vp(root, ["add", "--save-exact", ...names.map((name) => `${name}@${target}`)])) {
    throw new TaskError(
      `ERROR vp add could not install ${names.join(" and ")} at ${target}, as its output above says: check that the feed has that version, with vp info @basis/ui versions, then run vp run upgrade again.`,
    );
  }
}

/** `vp run upgrade [VERSION]`. */
async function upgrade(root: string, args: readonly string[]): Promise<string> {
  const named = targetOf(args);
  const target = named === "latest" ? latestRelease(root) : named;
  const before = await installedVersion(root, "@basis/ui");
  await install(root, target);
  const after = (await installedVersion(root, "@basis/ui")) ?? target;
  if (!vp(root, ["run", "sync"])) {
    throw new TaskError(
      `ERROR @basis/ui ${after} is installed, but vp run sync failed, as its ERROR lines above say: fix what they say, then run vp run sync and vp run verify.`,
    );
  }
  if (!vp(root, ["run", "verify"])) {
    throw new TaskError(
      `ERROR @basis/ui ${after} is installed and its files synced, but vp run verify fails, as its output above says: fix what it says, then commit the upgrade.`,
    );
  }
  return `Upgraded @basis/ui from ${before ?? "nothing"} to ${after}, wrote its framework files, and vp run verify passed: commit package.json, the lockfile and the synced files together.`;
}

export { upgrade };
