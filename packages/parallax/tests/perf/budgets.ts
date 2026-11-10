/* The bench's results, and their check against `budgets.json`: each run's figures, by name, against the budgets of
 * its dataset, size and mode, in the profile asked for. `host` holds the build host's budgets, which pull requests
 * quote; `nightly` the scheduled job's on a shared runner, its memory and generous ceilings on time. */

import { readFileSync } from "node:fs";
import path from "node:path";

/** One run: a dataset at a size, plain or under the CPU quota. */
interface Run {
  /** `trades 1000000 plain`, the key its budgets are under. */
  readonly key: string;
  readonly dataset: string;
  readonly rows: number;
  readonly mode: "plain" | "throttled";
  readonly arrowMB: number;
  /** Each figure's median, in ms or MB as its name says. */
  readonly figures: Readonly<Record<string, number>>;
  /** Each figure's samples, from which the median is taken. */
  readonly samples: Readonly<Record<string, readonly number[]>>;
  /** Why the run stopped, such as the engine running out of memory; null when it ran to its end. */
  readonly error: string | null;
  /** The host's load averages over 1, 5 and 15 minutes as the run began and ended. */
  readonly loadAverage: { readonly before: readonly number[]; readonly after: readonly number[] };
}

interface Results {
  readonly meta: Readonly<Record<string, unknown>>;
  readonly runs: readonly Run[];
}

/** Each run's budgets, by figure. */
type Profile = Readonly<Record<string, Readonly<Record<string, number>>>>;

const budgetsFile = path.join(import.meta.dirname, "budgets.json");
/** Figures below this show a decimal. */
const small = 10;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumbers(value: unknown): value is Readonly<Record<string, number>> {
  return isRecord(value) && Object.values(value).every((each) => typeof each === "number");
}

function isProfile(value: unknown): value is Profile {
  return isRecord(value) && Object.values(value).every((each) => isNumbers(each));
}

function isRun(value: unknown): value is Run {
  return (
    isRecord(value) &&
    typeof value["key"] === "string" &&
    isNumbers(value["figures"]) &&
    (value["error"] === null || typeof value["error"] === "string")
  );
}

/** Whether `value` is a results file the bench wrote. */
function isResults(value: unknown): value is Results {
  return (
    isRecord(value) && Array.isArray(value["runs"]) && value["runs"].every((each) => isRun(each))
  );
}

/** The budgets of `profile`: run, then figure, each a number. */
function readProfile(profile: string): Profile {
  const parsed: unknown = JSON.parse(readFileSync(budgetsFile, "utf8"));
  const found = isRecord(parsed) ? parsed[profile] : undefined;
  if (!isProfile(found)) {
    throw new Error(
      `ERROR ${budgetsFile} has no "${profile}" budgets of runs and numbers: add them, or ask for host or nightly.`,
    );
  }
  return found;
}

/** A figure with its unit, which its name ends with or holds, such as `2,710 ms`; a count has none. */
function shown(name: string, value: number): string {
  const digits = value < small ? 1 : 0;
  const number = value.toLocaleString("en-US", { maximumFractionDigits: digits });
  if (name.endsWith("MB")) {
    return `${number} MB`;
  }
  return name.includes("Ms") ? `${number} ms` : number;
}

/** What a run is, in a line: `trades at 1,000,000 rows, throttled`. */
function named(run: Run): string {
  return `${run.dataset} at ${run.rows.toLocaleString("en-US")} rows, ${run.mode}`;
}

/** The lines for one run against its budget. */
function runLines(
  run: Run,
  budget: Readonly<Record<string, number>>,
  profile: string,
): readonly string[] {
  const where = `in tests/perf/budgets.json (${profile})`;
  const fix = "find what made it worse, or raise the budget in the same commit and say why";
  if (run.error !== null) {
    return [`ERROR ${named(run)} did not finish: ${run.error} It has budgets ${where}: ${fix}.`];
  }
  return Object.entries(budget).flatMap(([name, limit]) => {
    const value = run.figures[name];
    // A ratio's figure is missing when the run was asked for other ratios, as `--ratios 1` asks.
    if (value === undefined && name.includes("@")) {
      return [];
    }
    if (value === undefined) {
      return [
        `ERROR ${named(run)} has no figure "${name}", which has a budget ${where}: measure it, or remove the budget.`,
      ];
    }
    return value > limit
      ? [
          `ERROR ${named(run)}: ${name} is ${shown(name, value)}, over its budget of ${shown(name, limit)} ${where}: ${fix}.`,
        ]
      : [];
  });
}

/** One `ERROR … fix` line for each figure over its budget, each budget with no figure, and each run with budgets that
 * failed. A run with no budgets is not checked, nor a ratio the run was not asked for. */
function overBudget(results: Results, profile: string): readonly string[] {
  const budgets = readProfile(profile);
  return results.runs.flatMap((run) => {
    const budget = budgets[run.key];
    return budget === undefined ? [] : runLines(run, budget, profile);
  });
}

export { isResults, named, overBudget, shown };
export type { Results, Run };
