/* `vp run verify`: every check of an app, one verdict (docs/design.md, What a developer sees).
 *
 *   vp run verify                 runs every stage to its end, whatever fails, then prints one summary
 *   vp run verify --stage NAME    runs the stages named, each --stage one, in their order
 *   vp run verify --json          prints the report as one line of JSON, VerifyReport (verify-report.ts)
 *
 * The stages are sync, client, fixtures, config, lint, types, tests, build, budget and suppressions. Each failure is
 * one ERROR line that ends with its fix, and in the JSON its file, line, rule, message and fix. When every stage runs
 * and passes on a commit with nothing uncommitted, it records the commit for `vp run review`. The preset passes the
 * app's budget as `--budget ROUTE=JS,CSS`, as it does to `vp run budget`. */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { budgetTask } from "./budget.ts";
import { checkFixtures } from "./fixture-files.ts";
import { recordCheck } from "./review.ts";
import { TaskError } from "./shot-options.ts";
import { suppressionsIn } from "./suppressions.ts";
import { driftProblems, planSync, syncedApp } from "./sync.ts";
import { buildFindings } from "./verify-build.ts";
import { findingOfLine, reportOf, reportText, stageNames } from "./verify-report.ts";
import type { Finding, StageName, StageRun } from "./verify-report.ts";
import { testFindings } from "./verify-tests.ts";
import { lintFindings, runNode, typeFindings } from "./verify-tools.ts";

/** The client tasks' script, beside this module, as the preset names it. */
const clientScript = fileURLToPath(
  new URL(import.meta.url.endsWith(".ts") ? "client.ts" : "client.mjs", import.meta.url),
);

interface Options {
  readonly budget: readonly string[];
  readonly json: boolean;
  readonly stages: readonly StageName[];
  /** Whether every stage runs, as only a whole run is recorded for `vp run review`. */
  readonly whole: boolean;
}

interface Run {
  readonly root: string;
  readonly options: Options;
  /** Whether this run's build stage passed, `undefined` until it has run. */
  built?: boolean;
}

type Stage = (run: Run) => Promise<readonly Finding[]> | readonly Finding[];

/** The findings of a framework task that throws its ERROR lines, as `vp run sync --check` does. */
async function linesOf(task: () => Promise<unknown>): Promise<readonly Finding[]> {
  try {
    await task();
    return [];
  } catch (error) {
    if (!(error instanceof TaskError)) {
      throw error;
    }
    return error.message
      .split("\n")
      .filter((line) => line.startsWith("ERROR "))
      .map((line) => findingOfLine(line));
  }
}

/** The drift check's problems for the `sync` stage or the `config` stage; an app that holds no framework file, as
 * ctzd's, has none for `sync`. */
async function drift(root: string, part: "config" | "sync"): Promise<readonly Finding[]> {
  const plan = await planSync(root);
  if (part === "sync" && !(await syncedApp(root, plan))) {
    return [];
  }
  const problems = await driftProblems(root, plan);
  return problems[part].map(({ file, text }) => findingOfLine(text, file));
}

function clientFindings(root: string): readonly Finding[] {
  const ran = runNode(root, [clientScript, "check"]);
  return ran.stderr
    .split("\n")
    .filter((line) => line.startsWith("ERROR "))
    .map((line) => findingOfLine(line));
}

const notWeighed =
  "ERROR the budget was not weighed, since the build failed: fix the build stage's ERROR lines, then run vp run verify --stage build --stage budget.";

/** Each route over its budget, against this run's build, or a build of its own when the run has no build stage. */
async function budgetFindings(run: Run): Promise<readonly Finding[]> {
  const { budget } = run.options;
  if (budget.length === 0) {
    return [];
  }
  const built = run.built ?? buildFindings(run.root).length === 0;
  if (!built) {
    return [findingOfLine(notWeighed)];
  }
  return linesOf(async () => budgetTask(run.root, budget));
}

async function suppressionFindings(root: string): Promise<readonly Finding[]> {
  const found = await suppressionsIn(root);
  return found.flatMap(({ file, line, refusal }) =>
    refusal === undefined
      ? []
      : [findingOfLine(refusal.replace(/^ERROR /u, `ERROR ${file}:${String(line)}: `))],
  );
}

const stages: Readonly<Record<StageName, Stage>> = {
  budget: budgetFindings,
  build: (run) => {
    const found = buildFindings(run.root);
    run.built = found.length === 0;
    return found;
  },
  client: ({ root }) => clientFindings(root),
  config: async ({ root }) => drift(root, "config"),
  fixtures: async ({ root }) => linesOf(async () => checkFixtures(root, [])),
  lint: ({ root }) => lintFindings(root),
  suppressions: async ({ root }) => suppressionFindings(root),
  sync: async ({ root }) => drift(root, "sync"),
  tests: ({ root }) => testFindings(root),
  types: ({ root }) => typeFindings(root),
};

const usage = `run vp run verify, with --stage NAME for each stage to run alone, of ${stageNames.join(", ")}, and --json for the report as JSON`;

function isStage(name: string): name is StageName {
  return (stageNames as readonly string[]).includes(name);
}

interface Flag {
  readonly flag: string;
  readonly value?: string;
}

/** The flag at `index` of `args`, with its value, as `--stage lint` or `--stage=lint` give it, and how many arguments
 * it takes. */
function flagAt(args: readonly string[], index: number): Flag & { readonly width: number } {
  const arg = args[index] ?? "";
  const equals = arg.indexOf("=");
  if (equals !== -1) {
    return { flag: arg.slice(0, equals), value: arg.slice(equals + 1), width: 1 };
  }
  const value = arg === "--json" ? undefined : args[index + 1];
  return value === undefined ? { flag: arg, width: 1 } : { flag: arg, value, width: 2 };
}

function flagsOf(args: readonly string[]): readonly Flag[] {
  const flags: Flag[] = [];
  for (let index = 0; index < args.length;) {
    const { width, ...flag } = flagAt(args, index);
    flags.push(flag);
    index += width;
  }
  return flags;
}

/** Fails on a flag verify does not take, or a stage it does not have. */
function checkFlags(flags: readonly Flag[]): void {
  const wrong = flags.find(({ flag, value }) =>
    flag === "--json"
      ? value !== undefined
      : !["--stage", "--budget"].includes(flag) || value === undefined,
  );
  if (wrong !== undefined) {
    const given = [wrong.flag, wrong.value ?? ""].join(" ").trim();
    throw new TaskError(`ERROR vp run verify takes no ${given}: ${usage}.`);
  }
  const unknown = flags.find(({ flag, value = "" }) => flag === "--stage" && !isStage(value));
  if (unknown !== undefined) {
    throw new TaskError(`ERROR ${unknown.value ?? ""} is no stage of vp run verify: ${usage}.`);
  }
}

/** The options `args` give, or a failure that names the one it cannot read. */
function optionsOf(args: readonly string[]): Options {
  const flags = flagsOf(args);
  checkFlags(flags);
  const valuesOf = (wanted: string): string[] =>
    flags.flatMap(({ flag, value }) => (flag === wanted && value !== undefined ? [value] : []));
  const named = new Set(valuesOf("--stage"));
  const whole = named.size === 0;
  return {
    budget: valuesOf("--budget"),
    json: flags.some(({ flag }) => flag === "--json"),
    stages: stageNames.filter((name) => whole || named.has(name)),
    whole,
  };
}

async function runStage(run: Run, name: StageName): Promise<StageRun> {
  const start = performance.now();
  let findings: readonly Finding[] = [];
  try {
    findings = await stages[name](run);
  } catch (error) {
    findings =
      error instanceof TaskError
        ? error.message.split("\n").map((line) => findingOfLine(line))
        : [
            findingOfLine(
              `ERROR the ${name} stage failed: ${String(error)}; run vp run verify --stage ${name} again, and report the message if it repeats.`,
            ),
          ];
  }
  return { findings, ms: Math.round(performance.now() - start), name };
}

/** Each of `names`, one at a time, in order: the tests, the build and the budget each take every core, and the budget
 * weighs the build. */
async function runStages(run: Run, names: readonly StageName[]): Promise<readonly StageRun[]> {
  const [name, ...rest] = names;
  if (name === undefined) {
    return [];
  }
  const first = await runStage(run, name);
  return [first, ...(await runStages(run, rest))];
}

/** What a task prints, and whether it failed. */
interface Verdict {
  readonly text: string;
  readonly failed: boolean;
}

/** `vp run verify [--stage NAME]... [--json]` in the app at `root`. */
async function verify(root: string, args: readonly string[]): Promise<Verdict> {
  const options = optionsOf(args);
  const run: Run = { options, root: path.resolve(root) };
  const ran = await runStages(run, options.stages);
  const report = reportOf(ran);
  const recorded = report.ok && options.whole ? await recordCheck(run.root) : undefined;
  const text = reportText(ran, { json: options.json, recorded });
  return { failed: !report.ok, text };
}

export { optionsOf, verify };
export type { Verdict };
