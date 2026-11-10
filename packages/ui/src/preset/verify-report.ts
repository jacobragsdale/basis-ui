/* What `vp run verify` reports: the stages, the error each finding becomes, the JSON `--json` prints and the summary
 * a person reads. verify.ts runs the stages, verify-tools.ts reads each tool's own output. */

import { z } from "zod";

/** A stage of `vp run verify`, which `--stage` names. */
type StageName =
  | "budget"
  | "build"
  | "client"
  | "config"
  | "fixtures"
  | "lint"
  | "suppressions"
  | "sync"
  | "tests"
  | "types";

/** The stages, in the order `vp run verify` runs them. */
const stageNames = [
  "sync",
  "client",
  "fixtures",
  "config",
  "lint",
  "types",
  "tests",
  "build",
  "budget",
  "suppressions",
] as const satisfies readonly StageName[];

/** One failure: where it is, when the tool says, the rule or code that found it, what is wrong and what fixes it. */
interface VerifyError {
  /** The file, `/`-separated from the app's root, or `null` when the failure has none, as a route over budget. */
  readonly file: string | null;
  /** The line in `file`, from 1, or `null` when the tool gives none. */
  readonly line: number | null;
  /** The lint rule, as `eslint(no-debugger)`, the compiler's code, as `TS2322`, or the bundler's, or `null`. */
  readonly rule: string | null;
  readonly message: string;
  readonly fix: string;
}

/** One stage's verdict: `ok` when it found no error. */
interface VerifyStage {
  readonly name: StageName;
  readonly ok: boolean;
  /** How long the stage took, in whole milliseconds. */
  readonly ms: number;
  readonly errors: readonly VerifyError[];
}

/** What `vp run verify --json` prints, on one line: `ok` when every stage it ran passed. */
interface VerifyReport {
  readonly ok: boolean;
  readonly stages: readonly VerifyStage[];
}

const verifyErrorSchema = z.strictObject({
  file: z.string().min(1).nullable(),
  fix: z.string().min(1),
  line: z.int().positive().nullable(),
  message: z.string().min(1),
  rule: z.string().min(1).nullable(),
});

const verifyStageSchema = z.strictObject({
  errors: z.array(verifyErrorSchema),
  ms: z.int().nonnegative(),
  name: z.enum(stageNames),
  ok: z.boolean(),
});

/** The report's schema, which its tests hold `--json`'s output to. */
const verifyReportSchema: z.ZodType<VerifyReport> = z.strictObject({
  ok: z.boolean(),
  stages: z.array(verifyStageSchema),
});

/** A failure as verify holds it: the error the JSON gives and the one `ERROR` line the summary prints. */
interface Finding extends VerifyError {
  readonly text: string;
}

/** The words a fix opens with, each an instruction: what tells the fix from the reason in an `ERROR` line. */
const fixVerbs = new Set(
  "add ask call change check choose commit copy correct declare define delete drop edit fix follow give import install keep let load make move name parse pass pick put raise read reinstall remove rename replace report restore return run see select set show sort split start stop take test try update upgrade use wait wrap write".split(
    " ",
  ),
);

/** Where the fix starts in `body`: after the first `: ` or `; ` that an instruction follows, else after the last `: `. */
function fixStart(body: string): number | undefined {
  for (const match of body.matchAll(/[:;] (?<word>[a-z]+)\b/gu)) {
    if (fixVerbs.has(match.groups?.["word"] ?? "")) {
      return match.index + 2;
    }
  }
  const last = body.lastIndexOf(": ");
  return last === -1 ? undefined : last + 2;
}

/** `body`, an `ERROR` line's text past `ERROR ` and its place, as the reason and the fix. */
function reasonAndFix(body: string): { readonly message: string; readonly fix: string } {
  const start = fixStart(body);
  if (start === undefined) {
    return { fix: "fix what the message says, then run vp run verify again.", message: body };
  }
  return { fix: body.slice(start), message: body.slice(0, start - 2) };
}

/** A file an `ERROR` line opens with, as `src/styles.css` or `src/app.tsx:12`, with the line it names. */
const placePattern =
  /^(?<file>(?:\.?[\w@-][\w@.-]*\/)*\.?[\w@-][\w@.-]*\.[A-Za-z]+)(?::(?<line>\d+))?(?<colon>:?) /u;

/** One of the framework's `ERROR` lines as a finding, its file read from the line unless `file` names it. */
function findingOfLine(text: string, file?: string): Finding {
  const body = text.replace(/^ERROR /u, "");
  const match = placePattern.exec(body);
  const place = match?.groups;
  const line = place?.["line"] === undefined ? null : Number(place["line"]);
  // A place followed by a colon is the line's prefix, as `fixtures/bad.json: `; else it is the sentence's subject.
  const rest = place?.["colon"] === ":" ? body.slice(match?.[0].length) : body;
  return { ...reasonAndFix(rest), file: file ?? place?.["file"] ?? null, line, rule: null, text };
}

/** A finding a tool reported in parts, and its `ERROR` line: `ERROR FILE:LINE: MESSAGE (RULE): FIX`. */
function findingOf(error: VerifyError): Finding {
  const place =
    error.file === null
      ? ""
      : `${error.file}${error.line === null ? "" : `:${String(error.line)}`}: `;
  const rule = error.rule === null ? "" : ` (${error.rule})`;
  return { ...error, text: `ERROR ${place}${error.message}${rule}: ${error.fix}` };
}

/** A stage as it ran: how long it took, and what it found. */
interface StageRun {
  readonly name: StageName;
  readonly ms: number;
  readonly findings: readonly Finding[];
}

/** The JSON of a run: each stage, and each error without its line of text. */
function reportOf(ran: readonly StageRun[]): VerifyReport {
  const stagesRun = ran.map(({ findings, ms, name }) => ({
    errors: findings.map(({ file, fix, line, message, rule }) => ({
      file,
      line,
      rule,
      message,
      fix,
    })),
    ms,
    name,
    ok: findings.length === 0,
  }));
  return { ok: stagesRun.every(({ ok }) => ok), stages: stagesRun };
}

/** "a, b and c". */
function listed(names: readonly string[]): string {
  return names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}

const millisecondsPerSecond = 1000;
/** The width of a stage's time in the summary, as ` 120.4 s`. */
const timeWidth = 7;

function seconds(ms: number): string {
  return `${(ms / millisecondsPerSecond).toFixed(1)} s`;
}

/** The summary a person reads: a line for each stage, its ERROR lines under it, and the verdict. */
function summaryOf(ran: readonly StageRun[], recorded: string | undefined): string {
  const width = Math.max(...stageNames.map((name) => name.length));
  const lines = ran.flatMap(({ findings, ms, name }) => [
    `${findings.length === 0 ? "ok  " : "FAIL"}  ${name.padEnd(width)}  ${seconds(ms).padStart(timeWidth)}`,
    ...findings.map(({ text }) => text),
  ]);
  const failed = ran.filter(({ findings }) => findings.length > 0).map(({ name }) => name);
  const total = seconds(ran.reduce((sum, { ms }) => sum + ms, 0));
  const verdict =
    failed.length === 0
      ? `vp run verify passed ${String(ran.length)} of ${String(ran.length)} stages in ${total}.`
      : `ERROR vp run verify failed ${String(failed.length)} of ${String(ran.length)} stages, ${listed(failed)}: fix each ERROR line above, then run vp run verify ${failed.map((name) => `--stage ${name}`).join(" ")} to check them again.`;
  return [...lines, verdict, ...(recorded === undefined ? [] : [recorded])].join("\n");
}

/** The report's keys, in the order `--json` prints them, at every depth: `{ok, stages}`, `{name, ok, ms, errors}`
 * and `{file, line, rule, message, fix}`. */
const reportKeys = [
  "name",
  "ok",
  "ms",
  "errors",
  "stages",
  "file",
  "line",
  "rule",
  "message",
  "fix",
];

/** What verify prints: the report as JSON, or the summary, with the line that says whether it was recorded. */
function reportText(
  ran: readonly StageRun[],
  { json, recorded }: { readonly json: boolean; readonly recorded: string | undefined },
): string {
  return json ? JSON.stringify(reportOf(ran), reportKeys) : summaryOf(ran, recorded);
}

export {
  findingOf,
  findingOfLine,
  reasonAndFix,
  reportOf,
  reportText,
  stageNames,
  verifyReportSchema,
};
export type { Finding, StageName, StageRun, VerifyError, VerifyReport, VerifyStage };
