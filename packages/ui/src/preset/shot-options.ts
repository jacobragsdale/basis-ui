/* The shot task's arguments, read without starting anything, so that tests can check them: the route and the
 * options, and the name its files take. */

/** What a task failure throws: its message is the line the task prints. */
class TaskError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TaskError";
  }
}

const usage =
  "run vp run shot ROUTE, such as vp run shot /positions, with --dark, --comfortable, --width N, --height N or --wait MS as needed";

/** How long the page settles, once loaded and its network quiet, before its picture is taken, unless `--wait` says. */
const settleMs = 500;
const defaultWidth = 1280;
const defaultHeight = 800;

/** What the task was asked for. */
interface ShotOptions {
  readonly route: string;
  readonly dark: boolean;
  /** Compact, the default, or comfortable with `--comfortable`; `--compact` is taken too, and changes nothing. */
  readonly density: "compact" | "comfortable";
  readonly width: number;
  readonly height: number;
  readonly wait: number;
}

/** A whole number from `--NAME`'s value, at least 1, or 0 for `--wait`, or a failure that names it. */
function count(name: string, value: string | undefined): number {
  const parsed = Number(value);
  const least = name === "wait" ? 0 : 1;
  if (value === undefined || value.trim() === "" || !Number.isInteger(parsed) || parsed < least) {
    throw new TaskError(
      `ERROR --${name} takes a whole number of pixels or milliseconds: ${usage}.`,
    );
  }
  return parsed;
}

/** Flags that take no value, and options that take a whole number. */
const flags = new Set(["--dark", "--comfortable", "--compact"]);
const numbers = new Set(["--width", "--height", "--wait"]);

/** The options `read` holds, with the defaults for the rest. */
function optionsFrom(read: Readonly<Record<string, string | number | boolean>>): ShotOptions {
  const {
    route,
    dark = false,
    comfortable = false,
    width = defaultWidth,
    height = defaultHeight,
    wait = settleMs,
  } = read;
  if (typeof route !== "string") {
    throw new TaskError(`ERROR vp run shot needs a route: ${usage}.`);
  }
  return {
    dark: dark === true,
    density: comfortable === true ? "comfortable" : "compact",
    height: Number(height),
    route,
    wait: Number(wait),
    width: Number(width),
  };
}

/** The task's arguments, read, or a failure that says how to give them. */
function optionsOf(args: readonly string[]): ShotOptions {
  const read: Record<string, string | number | boolean> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (flags.has(arg)) {
      read[arg.slice(2)] = true;
    } else if (numbers.has(arg)) {
      i += 1;
      read[arg.slice(2)] = count(arg.slice(2), args[i]);
    } else if (read["route"] === undefined && (arg.startsWith("/") || arg.startsWith("#"))) {
      read["route"] = arg;
    } else {
      throw new TaskError(`ERROR ${JSON.stringify(arg)} is no route or option: ${usage}.`);
    }
  }
  return optionsFrom(read);
}

/** The files' name: the route's words joined by dashes, or by an underscore where a slash parts them, so /a/b and
 * /a-b differ; `home` for /. */
function nameOf(route: string): string {
  const name = route
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, (gap) => (gap.includes("/") ? "_" : "-"))
    .replaceAll(/^[_-]+|[_-]+$/gu, "");
  return name === "" ? "home" : name;
}

export { TaskError, nameOf, optionsOf };
export type { ShotOptions };
