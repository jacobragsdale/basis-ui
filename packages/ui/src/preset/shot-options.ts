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
  "run vp run shot ROUTE, such as vp run shot /positions, with --dark, --compact, --width N, --height N or --wait MS as needed";

/** How long after the network is quiet the page settles before its picture is taken, unless `--wait` says. */
const settleMs = 500;
const defaultWidth = 1280;
const defaultHeight = 800;

/** What the task was asked for. */
interface ShotOptions {
  readonly route: string;
  readonly dark: boolean;
  readonly compact: boolean;
  readonly width: number;
  readonly height: number;
  readonly wait: number;
}

/** A whole number from `--NAME`'s value, or a failure that names it. */
function count(name: string, value: string | undefined): number {
  const parsed = Number(value);
  if (value === undefined || !Number.isInteger(parsed) || parsed <= 0) {
    throw new TaskError(
      `ERROR --${name} takes a whole number of pixels or milliseconds: ${usage}.`,
    );
  }
  return parsed;
}

/** Flags that take no value, and options that take a whole number. */
const flags = new Set(["--dark", "--compact"]);
const numbers = new Set(["--width", "--height", "--wait"]);

/** The options `read` holds, with the defaults for the rest. */
function optionsFrom(read: Readonly<Record<string, string | number | boolean>>): ShotOptions {
  const {
    route,
    dark = false,
    compact = false,
    width = defaultWidth,
    height = defaultHeight,
    wait = settleMs,
  } = read;
  if (typeof route !== "string") {
    throw new TaskError(`ERROR vp run shot needs a route: ${usage}.`);
  }
  return {
    compact: compact === true,
    dark: dark === true,
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

/** The files' name: the route's words joined by dashes, `home` for /. */
function nameOf(route: string): string {
  const words = route.toLowerCase().match(/[a-z0-9]+/gu) ?? [];
  return words.length === 0 ? "home" : words.join("-");
}

export { TaskError, nameOf, optionsOf };
export type { ShotOptions };
