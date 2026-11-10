/* The framework tasks the preset gives every app, run by Node in the app's root as `node tasks.mjs TASK ARGS`:
 *
 *   vp run sync [--check]      the framework's files (sync.ts)
 *   vp run budget              each route's JavaScript and CSS against its budget, after vp build (budget.ts)
 *   vp run doctor              the desktop's setup (doctor.ts)
 *   vp run review [BRANCH]     a pull request's summary (review.ts), and `checked`, check-full's last step
 *   fixtures                   check-full's check of the fixtures in fixtures/ (fixture-files.ts)
 *   suppressions               check-full's check of the comments that turn a check off (suppressions.ts)
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
import { recordCheck, review } from "./review.ts";
import { TaskError } from "./shot-options.ts";
import { suppressionsTask } from "./suppressions.ts";
import { sync } from "./sync.ts";
import { upgrade } from "./upgrade.ts";

type Task = (root: string, args: readonly string[]) => Promise<string>;

const tasks: ReadonlyMap<string, Task> = new Map([
  ["budget", budgetTask],
  ["checked", recordCheck],
  ["docs", docs],
  ["doctor", doctor],
  ["fixtures", checkFixtures],
  ["review", review],
  ["suppressions", suppressionsTask],
  ["sync", sync],
  ["upgrade", upgrade],
]);

async function main(): Promise<void> {
  const [name = "", ...args] = process.argv.slice(2);
  try {
    const task = tasks.get(name);
    if (task === undefined) {
      throw new TaskError(
        `ERROR ${name} is no task of @basis/ui's: run one of ${[...tasks.keys()].join(", ")} with vp run.`,
      );
    }
    const done = await task(process.cwd(), args);
    process.stdout.write(done === "" ? "" : `${done}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof TaskError ? error.message : `ERROR vp run ${name} failed: ${String(error)}; run it again, and report the message if it repeats.`}\n`,
    );
    process.exitCode = 1;
  }
}

await main();
