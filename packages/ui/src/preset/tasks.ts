/* The framework tasks the preset gives every app, run by Node in the app's root as `node tasks.mjs TASK ARGS`:
 *
 *   vp run sync [--check]      the framework's files (sync.ts)
 *   vp run budget              each route's JavaScript and CSS against its budget, after vp build (budget.ts)
 *   vp run doctor              the desktop's setup (doctor.ts)
 *   vp run verify [--stage NAME] [--json]   every check, one verdict (verify.ts); `check-full`, its former name
 *   vp run review [BRANCH]     a pull request's summary (review.ts)
 *   fixtures                   the check of the fixtures in fixtures/, verify's fixtures stage (fixture-files.ts)
 *   suppressions               the check of the comments that turn a check off, verify's stage (suppressions.ts)
 *   vp run docs [NAME]         the installed version's docs and catalogue (docs.ts)
 *   vp run upgrade [VERSION]   a new @basis/ui, synced and checked (upgrade.ts)
 *
 * Every module is imported here, before any task runs, so `vp run upgrade` replacing the package mid-run cannot leave
 * this process loading a module of another version. Every failure is one line that starts with ERROR and ends with
 * the fix. */

import { budgetTask } from "./budget.ts";
import { docs } from "./docs.ts";
import { doctor } from "./doctor.ts";
import { checkFixtures } from "./fixture-files.ts";
import { review } from "./review.ts";
import { TaskError } from "./task-error.ts";
import { suppressionsTask } from "./suppressions.ts";
import { sync } from "./sync.ts";
import { upgrade } from "./upgrade.ts";
import { verify } from "./verify.ts";
import type { Verdict } from "./verify.ts";

/** A task: what it prints when it passes, or, as verify, what it prints either way and whether it failed. A failure
 * thrown as a TaskError prints its lines on stderr. */
type Task = (root: string, args: readonly string[]) => Promise<Verdict | string>;

/** `vp run check-full`, the name `vp run verify` had, which an app's own scripts may still call: it says so, on
 * stderr, so `--json` stays the only line on stdout, and runs verify. */
async function checkFull(root: string, args: readonly string[]): Promise<Verdict> {
  process.stderr.write(
    "vp run check-full is now vp run verify, which it runs: call vp run verify instead.\n",
  );
  return verify(root, args);
}

const tasks: ReadonlyMap<string, Task> = new Map<string, Task>([
  ["budget", budgetTask],
  ["check-full", checkFull],
  ["docs", docs],
  ["doctor", doctor],
  ["fixtures", checkFixtures],
  ["review", review],
  ["suppressions", suppressionsTask],
  ["sync", sync],
  ["upgrade", upgrade],
  ["verify", verify],
]);

/** Prints what a task did, and fails the process when it says it failed. */
function print(done: Verdict | string): void {
  const { failed, text } = typeof done === "string" ? { failed: false, text: done } : done;
  process.stdout.write(text === "" ? "" : `${text}\n`);
  if (failed) {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const [name = "", ...args] = process.argv.slice(2);
  try {
    const task = tasks.get(name);
    if (task === undefined) {
      throw new TaskError(
        `ERROR ${name} is no task of @basis/ui's: run one of ${[...tasks.keys()].join(", ")} with vp run.`,
      );
    }
    print(await task(process.cwd(), args));
  } catch (error) {
    process.stderr.write(
      `${error instanceof TaskError ? error.message : `ERROR vp run ${name} failed: ${String(error)}; run it again, and report the message if it repeats.`}\n`,
    );
    process.exitCode = 1;
  }
}

await main();
