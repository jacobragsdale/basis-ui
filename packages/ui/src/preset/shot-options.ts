/* The shot task's arguments, read without starting anything, so that tests can check them: the routes and the
 * options, and the name each shot's files take. The steps' grammar is shot-steps.ts's. */

import { themeNames } from "#theme/theme-names.ts";
import type { ThemeName } from "#theme/preferences.ts";

import { stepOf } from "./shot-steps.ts";
import type { Step } from "./shot-steps.ts";
import { TaskError } from "./task-error.ts";

/** How long the page settles, once loaded and its network quiet, before its picture is taken, unless `--wait` says. */
const settleMs = 500;
const defaultWidth = 1280;
const defaultHeight = 800;

type Mode = "light" | "dark";
type Density = "compact" | "comfortable";

/** What the task was asked for. */
interface ShotOptions {
  /** The routes named, such as `/positions?book=rates`, in the order given. */
  readonly routes: readonly string[];
  /** Every route of the app's router as well, with `--all`. */
  readonly all: boolean;
  /** The theme, one `@basis/ui` ships; the default unless `--theme` names another. */
  readonly theme: ThemeName;
  readonly mode: Mode;
  /** Compact, the default, or comfortable. */
  readonly density: Density;
  readonly width: number;
  readonly height: number;
  readonly wait: number;
  /** The CSS selector of the one element to picture, rather than the whole page. */
  readonly selector: string | undefined;
  /** What to do on the page, in order, before its picture is taken. */
  readonly steps: readonly Step[];
  /** The folder of baselines to compare each picture with. */
  readonly compare: string | undefined;
  /** One line of JSON on stdout, rather than the files' paths. */
  readonly json: boolean;
}

/** The options the task takes, for the line a word it does not know fails with. */
const optionNames =
  "--all, --mode, --density, --theme, --width, --height, --wait, --selector, --step, --compare and --json";

/** The shipped themes' names, as a sentence lists them: `a`, `a or b`, `a, b or c`. */
const themeList = themeNames.join(", ").replace(/, (?=[^,]*$)/u, " or ");

/** Each option that takes a value: the line it fails with when the value is missing or wrong. */
const valueErrors: Readonly<Record<string, string>> = {
  compare: "ERROR --compare takes the folder of baselines, such as --compare baselines.",
  density: "ERROR --density takes compact or comfortable, such as --density comfortable.",
  height: "ERROR --height takes a whole number of pixels, 1 or more, such as --height 1000.",
  mode: "ERROR --mode takes light or dark, such as --mode dark.",
  selector:
    "ERROR --selector takes the CSS selector of the element to picture, such as --selector main or --selector '#coupons'.",
  step: "ERROR --step takes a step, such as --step 'click:Save', --step 'type:#amount=100' or --step 'press:Enter'.",
  theme: `ERROR --theme takes the name of a theme @basis/ui ships (${themeList}), such as --theme ${themeNames[0]}.`,
  wait: "ERROR --wait takes a whole number of milliseconds, 0 or more, such as --wait 2000.",
  width: "ERROR --width takes a whole number of pixels, 1 or more, such as --width 390.",
};

/** The flags that take no value, and the setting each stands for. */
const flags: Readonly<Record<string, readonly [string, string]>> = {
  "--all": ["all", "true"],
  "--comfortable": ["density", "comfortable"],
  "--compact": ["density", "compact"],
  "--dark": ["mode", "dark"],
  "--json": ["json", "true"],
};

/** A whole number from `value`, at least `least`, or the option's failure. */
function whole(name: string, value: string, least: number): number {
  const parsed = Number(value);
  if (value.trim() === "" || !Number.isInteger(parsed) || parsed < least) {
    throw new TaskError(valueErrors[name] ?? "");
  }
  return parsed;
}

/** What was read so far: each setting's value as given, and the steps. */
interface Read {
  readonly settings: Map<string, string>;
  readonly routes: string[];
  readonly steps: Step[];
}

/** Records `name`'s `value`, failing when the option was given before with another. */
function set(read: Read, name: string, value: string): void {
  const before = read.settings.get(name);
  if (before !== undefined && before !== value) {
    throw new TaskError(`ERROR --${name} is given twice, as ${before} and ${value}: give it once.`);
  }
  read.settings.set(name, value);
}

/** The values each option of a few may take. */
const choices: Readonly<Record<string, readonly string[]>> = {
  density: ["compact", "comfortable"],
  mode: ["light", "dark"],
  theme: themeNames,
};

/** The least each number may be. */
const least: Readonly<Record<string, number>> = { height: 1, wait: 0, width: 1 };

/** Fails when `value` is not one `--name` takes. */
function checkValue(name: string, value: string): void {
  if (choices[name]?.includes(value) === false) {
    throw new TaskError(valueErrors[name] ?? "");
  }
  const smallest = least[name];
  if (smallest !== undefined) {
    whole(name, value, smallest);
  }
}

/** Records `--name value`, checked as far as it can be without a page. */
function setValue(read: Read, name: string, value: string | undefined): void {
  if (value === undefined || value === "" || (value.startsWith("--") && name !== "step")) {
    throw new TaskError(valueErrors[name] ?? "");
  }
  if (name === "step") {
    read.steps.push(stepOf(value));
  } else {
    checkValue(name, value);
    set(read, name, value);
  }
}

/** The options `read` holds, with the defaults for the rest. */
function optionsFrom({ settings, routes, steps }: Read): ShotOptions {
  const all = settings.get("all") === "true";
  if (routes.length === 0 && !all) {
    throw new TaskError(
      "ERROR vp run shot needs a route, or --all for every route: run vp run shot ROUTE, such as vp run shot /positions, or vp run shot --all.",
    );
  }
  if (steps.length > 0 && (all || routes.length > 1)) {
    throw new TaskError(
      "ERROR --step acts on one route, and this shot has more: give the route with its steps alone, such as vp run shot /settlements/new --step 'click:Save'.",
    );
  }
  const number = (name: string, fallback: number): number => Number(settings.get(name) ?? fallback);
  return {
    all,
    compare: settings.get("compare"),
    density: settings.get("density") === "comfortable" ? "comfortable" : "compact",
    height: number("height", defaultHeight),
    json: settings.get("json") === "true",
    mode: settings.get("mode") === "dark" ? "dark" : "light",
    routes,
    selector: settings.get("selector"),
    steps,
    theme: themeNames.find((name) => name === settings.get("theme")) ?? themeNames[0],
    wait: number("wait", settleMs),
    width: number("width", defaultWidth),
  };
}

/** An argument as an option and the value it holds after `=`, as `--mode=dark`, if it holds one. */
function optionParts(arg: string): { readonly option: string; readonly inline?: string } {
  const equals = arg.indexOf("=");
  return arg.startsWith("--") && equals !== -1
    ? { inline: arg.slice(equals + 1), option: arg.slice(0, equals) }
    : { option: arg };
}

/** Reads the argument at `index`, and returns the index of the next one: past its value, for an option that takes
 * one as the next argument. */
function readArg(read: Read, args: readonly string[], index: number): number {
  const arg = args[index] ?? "";
  const { option, inline } = optionParts(arg);
  const flag = flags[option];
  if (flag !== undefined && inline === undefined) {
    set(read, ...flag);
  } else if (option.startsWith("--") && Object.hasOwn(valueErrors, option.slice(2))) {
    setValue(read, option.slice(2), inline ?? args[index + 1]);
    return index + (inline === undefined ? 2 : 1);
  } else if (arg.startsWith("/") || arg.startsWith("#")) {
    read.routes.push(arg);
  } else {
    throw new TaskError(
      `ERROR ${JSON.stringify(arg)} is no route or option: a route starts with /, such as /positions, and the options are ${optionNames}.`,
    );
  }
  return index + 1;
}

/** The task's arguments, read, or a failure that says how to give them. An option's value follows it, or follows `=`
 * in the same word, as `--mode=dark`. */
function optionsOf(args: readonly string[]): ShotOptions {
  const read: Read = { routes: [], settings: new Map(), steps: [] };
  let index = 0;
  while (index < args.length) {
    index = readArg(read, args, index);
  }
  return optionsFrom(read);
}

/** A name of the route's or the selector's words joined by dashes, or by an underscore where a slash parts them. */
function slug(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, (gap) => (gap.includes("/") ? "_" : "-"))
    .replaceAll(/^[_-]+|[_-]+$/gu, "");
}

/** The files' name for `route`: the route's words joined by dashes, or by an underscore where a slash parts them, so
 * /a/b and /a-b differ; `home` for /. Given the options, it adds a part for each that differs from the default, as
 * `-dark` and `-comfortable`, `-THEME` for a theme other than the default, and `--SELECTOR` for one element. */
function nameOf(
  route: string,
  options?: Pick<ShotOptions, "density" | "mode" | "selector"> & { readonly theme?: string },
): string {
  const base = slug(route) === "" ? "home" : slug(route);
  if (options === undefined) {
    return base;
  }
  const selector = options.selector === undefined ? "" : `--${slug(options.selector) || "element"}`;
  const theme = options.theme ?? themeNames[0];
  return [
    base,
    theme === themeNames[0] ? "" : `-${theme}`,
    options.mode === "dark" ? "-dark" : "",
    options.density === "comfortable" ? "-comfortable" : "",
    selector,
  ].join("");
}

export { nameOf, optionsOf };
export type { Density, Mode, ShotOptions };
