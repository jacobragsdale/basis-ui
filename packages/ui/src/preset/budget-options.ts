/* `vp run budget`'s budgets and verdict, without a browser, so that tests can check them. An app gives each route a
 * budget in its `vite.config.ts`, as `basisPreset({ budget: { "/": { css: 25, js: 180 } } })`: the kilobytes of
 * JavaScript and of CSS, gzipped, that opening the route may load. The preset passes them to the task as arguments,
 * one a route, such as `/=180,25`. */

import { TaskError } from "./task-error.ts";

/** What a route may load, in kilobytes (1,000 bytes) gzipped, as `vp build` reports them. */
interface RouteBudget {
  readonly js: number;
  readonly css: number;
}

/** Each route's budget, by its path, such as `/` or `/bonds/US91282CRF04`. */
type Budget = Readonly<Record<string, RouteBudget>>;

/** What opening a route loaded, in bytes gzipped. */
interface RouteWeight {
  readonly route: string;
  readonly js: number;
  readonly css: number;
}

const example = 'basisPreset({ budget: { "/": { css: 25, js: 180 } } })';
const bytesPerKilobyte = 1000;

/** The task's arguments for `budget`, one a route, as `ROUTE=JS,CSS`. */
function budgetArgs(budget: Budget): string[] {
  return Object.entries(budget).map(
    ([route, { js, css }]) => `${route}=${String(js)},${String(css)}`,
  );
}

/** The failure for a route whose budget is not two numbers of kilobytes. */
function notKilobytes(route: string): TaskError {
  return new TaskError(
    `ERROR the budget for ${route} is not two numbers of kilobytes above 0: give it as ${example} in vite.config.ts.`,
  );
}

/** A budget's kilobytes from the task's argument, or a failure that names the route. */
function kilobytes(route: string, text: string | undefined): number {
  const value = Number(text);
  if (text === undefined || text.trim() === "" || !Number.isFinite(value) || value <= 0) {
    throw notKilobytes(route);
  }
  return value;
}

/** One route's budget from its argument, `ROUTE=JS,CSS`, or a failure that names the route. */
function routeBudget(arg: string): readonly [string, RouteBudget] {
  const separator = arg.lastIndexOf("=");
  const route = separator === -1 ? arg : arg.slice(0, separator);
  if (separator === -1 || !route.startsWith("/")) {
    throw new TaskError(
      `ERROR the budget's route ${route} does not start with /: name each route by its path, as ${example} in vite.config.ts.`,
    );
  }
  const [js, css, ...rest] = arg.slice(separator + 1).split(",");
  if (rest.length > 0) {
    throw notKilobytes(route);
  }
  return [route, { css: kilobytes(route, css), js: kilobytes(route, js) }];
}

/** The budgets the task's arguments carry, or a failure that says how to give them. */
function budgetOf(args: readonly string[]): Budget {
  if (args.length === 0) {
    throw new TaskError(
      `ERROR vp run budget has no routes to weigh: give each route a budget in vite.config.ts, as ${example}, in kilobytes gzipped.`,
    );
  }
  return Object.fromEntries(args.map((arg) => routeBudget(arg)));
}

/** Bytes as kilobytes with one decimal, as `vp build` prints them. */
function shown(bytes: number): string {
  return (bytes / bytesPerKilobyte).toFixed(1);
}

/** The lines for one route: its weight against its budget, or an `ERROR` line for each kind it loads too much of. */
function routeLines(weight: RouteWeight, budget: RouteBudget, width: number): string[] {
  const over = (["js", "css"] as const).filter(
    (kind) => weight[kind] > budget[kind] * bytesPerKilobyte,
  );
  if (over.length === 0) {
    return [
      `${weight.route.padEnd(width)}  JS ${shown(weight.js)} of ${String(budget.js)} kB, CSS ${shown(weight.css)} of ${String(budget.css)} kB, gzipped`,
    ];
  }
  return over.map((kind) => {
    const what = kind === "js" ? "JavaScript" : "CSS";
    return `ERROR ${weight.route} loads ${shown(weight[kind])} kB of ${what} gzipped, over its budget of ${String(budget[kind])} kB: load what the page does not show at first through a lazy import, or raise the route's budget in vite.config.ts if the page needs it all.`;
  });
}

/** One line a route, in the budget's order, and whether any route is over its budget. */
function verdict(
  weights: readonly RouteWeight[],
  budget: Budget,
): { readonly lines: readonly string[]; readonly over: boolean } {
  const width = Math.max(...weights.map(({ route }) => route.length));
  const lines = weights.flatMap((weight) => {
    const given = budget[weight.route];
    return given === undefined ? [] : routeLines(weight, given, width);
  });
  return { lines, over: lines.some((line) => line.startsWith("ERROR")) };
}

export { budgetArgs, budgetOf, verdict };
export type { Budget, RouteBudget, RouteWeight };
