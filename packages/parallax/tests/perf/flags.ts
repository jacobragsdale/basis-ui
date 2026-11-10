/* The bench's flags, each a comma-separated list where it takes several, so that a run can be short:
 *
 *   --sizes 150000,1000000,2000000   rows of each dataset
 *   --datasets trades,positions
 *   --modes plain,throttled          throttled needs `systemd-run --user`
 *   --ratios 1,1.25,1.5              device pixel ratios; each loads the page again, adding a sample of the load
 *   --rounds 3                       rounds of the changes on the page
 *   --budgets host                   or nightly, or none
 *   --out test-results/perf/bench.json
 *   --check FILE                     checks a results file against the budgets, measuring nothing
 *   --prebuilt                       takes the datasets and the harness as built
 */

import path from "node:path";
import { parseArgs } from "node:util";

import type { Run } from "./budgets.ts";
import type { BenchDataset } from "./harness/protocol.ts";

interface Options {
  readonly sizes: readonly number[];
  readonly datasets: readonly BenchDataset[];
  readonly modes: readonly Run["mode"][];
  readonly ratios: readonly number[];
  readonly rounds: number;
  readonly budgets: string;
  readonly out: string;
  readonly check: string | null;
  readonly prebuilt: boolean;
}

function listed(flag: string, text: string): readonly string[] {
  const items = text
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
  if (items.length === 0) {
    throw new Error(`ERROR --${flag} names nothing: give a comma-separated list.`);
  }
  return items;
}

function counted(flag: string, text: string): readonly number[] {
  return listed(flag, text).map((item) => {
    const value = Number(item);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`ERROR --${flag} takes positive numbers, not "${item}".`);
    }
    return value;
  });
}

function oneOf<TItem extends string>(
  flag: string,
  text: string,
  allowed: readonly TItem[],
): readonly TItem[] {
  return listed(flag, text).map((item) => {
    const found = allowed.find((each) => each === item);
    if (found === undefined) {
      throw new Error(`ERROR --${flag} takes ${allowed.join(" or ")}, not "${item}".`);
    }
    return found;
  });
}

/** The bench's options, from the command line. */
function options(parallax: string): Options {
  const { values: flags } = parseArgs({
    options: {
      budgets: { default: "host", type: "string" },
      check: { type: "string" },
      datasets: { default: "trades,positions", type: "string" },
      modes: { default: "plain,throttled", type: "string" },
      out: { default: path.join(parallax, "test-results/perf/bench.json"), type: "string" },
      prebuilt: { default: false, type: "boolean" },
      ratios: { default: "1,1.25,1.5", type: "string" },
      rounds: { default: "3", type: "string" },
      sizes: { default: "150000,1000000,2000000", type: "string" },
    },
  });
  return {
    budgets: flags.budgets,
    check: flags.check ?? null,
    datasets: oneOf("datasets", flags.datasets, ["trades", "positions"] as const),
    modes: oneOf("modes", flags.modes, ["plain", "throttled"] as const),
    out: flags.out,
    prebuilt: flags.prebuilt,
    ratios: counted("ratios", flags.ratios),
    rounds: counted("rounds", flags.rounds)[0] ?? 1,
    sizes: counted("sizes", flags.sizes).toSorted((first, second) => first - second),
  };
}

export { options };
export type { Options };
