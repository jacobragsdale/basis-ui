/* What a page reported while `checkRoutes` loaded it, as the lines it fails with: each request nothing answered, in
 * fixture mode's own words; each error reported to telemetry, raised as a toast or written to the console, once; each
 * with its fix. */

import { isApiError } from "#api/fetch.ts";
import { describeError } from "#shell/describe-error.ts";
import type { Telemetry, TelemetryAttributes } from "#shell/telemetry.ts";

/** What a page reported while it loaded. */
interface Found {
  readonly unanswered: string[];
  readonly errors: { readonly error: unknown; readonly attributes: TelemetryAttributes }[];
  readonly toasts: unknown[];
  readonly logged: (readonly unknown[])[];
}

function nothingFound(): Found {
  return { errors: [], logged: [], toasts: [], unanswered: [] };
}

/** A telemetry that keeps what a page reports, and fixture mode's word on each request nothing answered. */
function recordingTelemetry(found: Found): Telemetry {
  return {
    error: (error, attributes = {}) => {
      found.errors.push({ attributes, error });
    },
    event: (name, attributes = {}) => {
      const { problem } = attributes;
      if (name === "fixture.answered" && typeof problem === "string") {
        found.unanswered.push(problem);
      }
    },
    timing: () => {
      // How long a navigation took is no failure.
    },
  };
}

/** The longest stretch of a console line or an error's message a line quotes. */
const quoteLength = 200;

/** The first line of `text`, cut to `quoteLength`. */
function quoted(text: string): string {
  const [line = ""] = text.trim().split("\n");
  return line.length > quoteLength ? `${line.slice(0, quoteLength)}…` : line;
}

/** Where in the app's own `src/` an error was thrown, as `src/pages/bond.tsx:12`, if it was. */
function thrownAt(error: unknown): string | undefined {
  if (!(error instanceof Error) || error.stack === undefined) {
    return undefined;
  }
  // The first frame outside the installed packages is the code that threw; it is named when it is the app's.
  const frame = error.stack
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("at ") && !line.includes("node_modules"));
  return frame === undefined
    ? undefined
    : /\/(?<place>src\/[^\s:()?]+:\d+)/u.exec(frame)?.groups?.["place"];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

/** A zod error's first issue, as `coupon_rate: Invalid input: expected number, received string`. */
function firstIssue(error: Error): string | undefined {
  const issues: unknown = Reflect.get(error, "issues");
  const issue: unknown = Array.isArray(issues) ? issues.at(0) : undefined;
  if (!isRecord(issue) || typeof issue["message"] !== "string") {
    return undefined;
  }
  const { path } = issue;
  const place = Array.isArray(path) && path.length > 0 ? `${path.map(String).join(".")}: ` : "";
  return `${place}${issue["message"]}`;
}

/** An error as a line quotes it, with its fix. */
function errorAndFix(error: unknown): { readonly text: string; readonly fix: string } {
  if (isApiError(error)) {
    const { title, detail } = describeError(error);
    const said = detail === undefined ? title : `${title} (${quoted(detail)})`;
    return {
      fix: "answer the request with a fixture that succeeds, or name another sample in checkRoutes' params",
      text: `the API answered ${String(error.status)} ${said}`,
    };
  }
  if (error instanceof Error && error.name === "ZodError") {
    const issue = firstIssue(error);
    return {
      fix: "make the fixture's body one the schema in openapi.json accepts; vp run fixtures check says where it is not",
      text: `the response is not in the form its schema says${issue === undefined ? "" : `, ${quoted(issue)}`}`,
    };
  }
  const at = thrownAt(error);
  return {
    fix: `fix the code that threw${at === undefined ? "" : `, at ${at}`}`,
    text:
      error instanceof Error ? quoted(`${error.name}: ${error.message}`) : quoted(String(error)),
  };
}

/** Where a telemetry error came from, by its `source`, beside the attribute that names it. */
const sources: Readonly<Record<string, (attributes: TelemetryAttributes) => string>> = {
  mutation: ({ mutation }) => `its mutation ${String(mutation)}`,
  query: ({ query }) => `its query ${String(query)}`,
  render: () => "its render, which the error boundary caught",
  route: () => "its route, whose error component caught it",
};

function reportedFrom(attributes: TelemetryAttributes): string {
  const source = String(attributes["source"] ?? "the page");
  return sources[source]?.(attributes) ?? source;
}

/** Whether an error is fixture mode's answer that nothing holds the request, which its own line already names. */
function unansweredError(error: unknown): boolean {
  return isApiError(error) && error.problem.type === "fixture-missing";
}

/** One argument of a console call, as the console prints it. */
function printed(arg: unknown): string {
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}`;
  }
  if (typeof arg === "object" && arg !== null) {
    try {
      return JSON.stringify(arg);
    } catch {
      return "an object that cannot be printed";
    }
  }
  return String(arg);
}

/** The substitutions a console call's first string may hold, as React's warnings use them. */
const substitution = /%[sdifoOc]/gu;

/** A console call's words, as the console prints them: its first string with each `%s` replaced by the next
 * argument, then the rest. */
function consoleText(args: readonly unknown[]): string {
  const [first, ...rest] = args;
  if (typeof first !== "string") {
    return args.map((arg) => printed(arg)).join(" ");
  }
  const remaining = [...rest];
  const text = first.replaceAll(substitution, (token) => {
    const next = remaining.shift();
    return token === "%c" || next === undefined ? "" : printed(next);
  });
  return [text, ...remaining.map((arg) => printed(arg))].join(" ");
}

/** Each line once, a line said more than once with how many times. */
function once(lines: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const line of lines) {
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  return [...counts].map(([line, count]) =>
    count === 1 ? line : `${line} It happened ${String(count)} times.`,
  );
}

/** The line for each error reported to telemetry, but fixture mode's own answer that nothing holds a request. */
function errorLines(page: string, found: Found): string[] {
  return found.errors.flatMap(({ error, attributes }) => {
    if (unansweredError(error)) {
      return [];
    }
    const { text, fix } = errorAndFix(error);
    return [`ERROR ${page}: reported an error from ${reportedFrom(attributes)}, ${text}: ${fix}.`];
  });
}

/** The lines for what the page at `page` reported, each error once: one telemetry has is not named again by its
 * toast or its console line. */
function reportedLines(page: string, found: Found): string[] {
  const reported = new Set(found.errors.map(({ error }) => error));
  const toasts = found.toasts
    .filter((raised) => !reported.has(raised))
    .map((raised) => {
      const { title, detail } = describeError(raised);
      const said = detail === undefined ? title : `${title}: ${detail}`;
      return `ERROR ${page}: raised an error toast as it opened, "${quoted(said)}": a page opens without one, so answer what it asks with a fixture that succeeds, or fix the code that raised it.`;
    });
  const logged = found.logged
    .filter((args) => !args.some((arg) => reported.has(arg)))
    .map(
      (args) =>
        `ERROR ${page}: wrote an error to the console, "${quoted(consoleText(args))}": fix what logged it, since a page that works logs none.`,
    );
  return once([
    ...found.unanswered.map((problem) => `ERROR ${page}: ${problem}`),
    ...errorLines(page, found),
    ...toasts,
    ...logged,
  ]);
}

export { isRecord, nothingFound, quoted, recordingTelemetry, reportedLines };
export type { Found };
