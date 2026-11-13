/* The tools `vp run verify` runs, each from the app's own installed package and read by its own machine format where
 * it has one: Oxlint's and Vitest's JSON, `tsc --pretty false`'s one line a diagnostic, `vp fmt --list-different`'s
 * one file a line, and the error Vite's `build()` throws. Colour is turned off, so no line is read through it. */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";

import { z } from "zod";

import { TaskError } from "./task-error.ts";
import { findingOf, reasonAndFix } from "./verify-report.ts";
import type { Finding } from "./verify-report.ts";

/** The most a tool may print, 256 MiB: far more than any report. */
const largestOutput = 268_435_456;
/** Colour off, so no line is read through it. */
const noColour = { FORCE_COLOR: "0", NO_COLOR: "1" };

interface Ran {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Node on `args` in the app's root, as a tool's own script, so no shell or PATH is needed, on Windows too. */
function runNode(root: string, args: readonly string[], env: NodeJS.ProcessEnv = {}): Ran {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...noColour, ...env },
    maxBuffer: largestOutput,
  });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

/** The script of `name`'s command `bin`, as the app at `root` installed it. */
function binOf(root: string, name: string, bin: string): string {
  try {
    const manifest = createRequire(path.join(root, "package.json")).resolve(`${name}/package.json`);
    return path.join(path.dirname(manifest), bin);
  } catch {
    throw new TaskError(
      `ERROR ${name} is not installed in this app, and vp run verify runs it: run vp install.`,
    );
  }
}

function vp(root: string, args: readonly string[], env?: NodeJS.ProcessEnv): Ran {
  return runNode(root, [binOf(root, "vite-plus", "bin/vp"), ...args], env);
}

/** `file` from the app's root, `/`-separated, whether the tool gave it absolute or relative. */
function fromRoot(root: string, file: string): string {
  return path.relative(root, path.resolve(root, file)).replaceAll("\\", "/");
}

/** The first line of `text`, without colour or a closing full stop. */
function firstLine(text: string): string {
  const [line = ""] = stripVTControlCharacters(text).trim().split("\n", 1);
  return line.trim().replace(/\.$/u, "");
}

/** The one finding for a tool that failed with nothing its report can say: its exit and the command to see why. */
function unread(command: string, ran: Ran): readonly Finding[] {
  const said = firstLine(ran.stderr === "" ? ran.stdout : ran.stderr);
  return [
    findingOf({
      file: null,
      fix: `run ${command} to see its whole output, and fix what it says.`,
      line: null,
      message: `${command} failed (exit ${String(ran.status)}) with no report to read${said === "" ? "" : `, saying "${said}"`}`,
      rule: null,
    }),
  ];
}

/** What a tool wrote to `file`, or nothing when it wrote none. */
function writtenTo(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/** The JSON in `text` from its first `{`, past any note a tool prints before it, or `undefined`. */
function jsonIn(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text.slice(text.indexOf("{")));
    return parsed;
  } catch {
    return undefined;
  }
}

const labelSchema = z.object({ span: z.object({ line: z.number() }) });
const diagnosticSchema = z.object({
  // A diagnostic of Oxlint's own, such as an unused directive's, has no code.
  code: z.string().default(""),
  filename: z.string(),
  help: z.string().optional(),
  labels: z.array(labelSchema).default([]),
  message: z.string(),
  severity: z.string(),
  url: z.string().optional(),
});
type Diagnostic = z.infer<typeof diagnosticSchema>;
const lintReportSchema = z.object({ diagnostics: z.array(diagnosticSchema) });

/** A compiler error the lint's type check reports too, which the types stage reports from tsc. */
const compilerCode = /^typescript\(TS\d+\)$/u;

/** What the fix of a stock rule's diagnostic is: its help, else its page. */
function stockFix({ help, url }: Diagnostic): string {
  if (help !== undefined) {
    return help.endsWith(".") ? help : `${help}.`;
  }
  return url === undefined ? "fix what the rule reports." : `do as ${url} says.`;
}

function lintFinding(root: string, diagnostic: Diagnostic): Finding {
  const own = diagnostic.message.startsWith("ERROR ");
  const said = own
    ? reasonAndFix(diagnostic.message.slice("ERROR ".length))
    : { fix: stockFix(diagnostic), message: diagnostic.message.replace(/\.$/u, "") };
  return findingOf({
    ...said,
    file: fromRoot(root, diagnostic.filename),
    line: diagnostic.labels[0]?.span.line ?? null,
    rule: diagnostic.code === "" ? null : diagnostic.code,
  });
}

/** Each file `vp fmt` would rewrite, or the one finding that `vp fmt` failed with no list to read. */
function formatFindings(root: string): readonly Finding[] {
  const format = vp(root, ["fmt", "--list-different"]);
  const unformatted = format.stdout.split("\n").filter((line) => /^\S+$/u.test(line.trim()));
  if (format.status !== 0 && unformatted.length === 0) {
    return unread("vp fmt --check", format);
  }
  return unformatted.map((file) =>
    findingOf({
      file: fromRoot(root, file.trim()),
      fix: "run vp check --fix, which formats it as the commit hook's vp staged does.",
      line: null,
      message: "the file is not formatted as vp fmt writes it",
      rule: null,
    }),
  );
}

/** Each error the lint reports but the compiler's, which the types stage reports from tsc; or, for a lint that failed
 * with no error in its report, as a type-aware pass that crashed after printing it, the one finding that says so. */
function lintErrors(root: string): readonly Finding[] {
  const lint = vp(root, ["lint", "--format", "json"]);
  const report = lintReportSchema.safeParse(jsonIn(lint.stdout));
  const errors = report.success
    ? report.data.diagnostics.filter(({ severity }) => severity === "error")
    : [];
  if (lint.status !== 0 && errors.length === 0) {
    return unread("vp lint", lint);
  }
  return errors
    .filter(({ code }) => !compilerCode.test(code))
    .map((diagnostic) => lintFinding(root, diagnostic));
}

/** Each file `vp fmt` would rewrite, and each error the lint reports but the compiler's. */
function lintFindings(root: string): readonly Finding[] {
  return [...formatFindings(root), ...lintErrors(root)];
}

const compilerLine =
  /^(?:(?<file>.+?)\((?<line>\d+),\d+\): )?error (?<code>TS\d+): (?<message>.*)$/u;
const typeFix =
  "make the code agree with the types the compiler names, parsing a value of unknown shape with a zod schema, and never cast, assert or loosen tsconfig.json to quiet it.";

interface CompilerError {
  readonly file: string | null;
  readonly line: number | null;
  readonly code: string;
  message: string;
}

/** The errors `tsc --pretty false` prints, one a line, an indented line continuing the one before. */
function compilerErrors(root: string, output: string): readonly CompilerError[] {
  const errors: CompilerError[] = [];
  for (const text of output.split("\n")) {
    const match = compilerLine.exec(text)?.groups;
    const last = errors.at(-1);
    if (match !== undefined) {
      const file = match["file"] === undefined ? null : fromRoot(root, match["file"]);
      const line = match["line"] === undefined ? null : Number(match["line"]);
      errors.push({ code: match["code"] ?? "", file, line, message: match["message"] ?? "" });
    } else if (last !== undefined && /^\s/u.test(text) && text.trim() !== "") {
      last.message = `${last.message} ${text.trim()}`;
    }
  }
  return errors;
}

/** Each error `tsc --noEmit` reports on the whole app, the generated client included, which the lint skips. */
function typeFindings(root: string): readonly Finding[] {
  const tsc = binOf(root, "typescript", "bin/tsc");
  const ran = runNode(root, [tsc, "--noEmit", "--pretty", "false"]);
  const errors = compilerErrors(root, ran.stdout);
  if (ran.status !== 0 && errors.length === 0) {
    return unread("tsc --noEmit", ran);
  }
  return errors.map(({ code, file, line, message }) =>
    findingOf({ file, fix: typeFix, line, message: message.replace(/\.$/u, ""), rule: code }),
  );
}

/** What `run` returns, given a file in a folder of its own for a tool's report, which is removed after. */
function withReportFile<Result>(name: string, run: (file: string) => Result): Result {
  const folder = mkdtempSync(path.join(tmpdir(), "basis-ui-verify-"));
  try {
    return run(path.join(folder, name));
  } finally {
    rmSync(folder, { force: true, recursive: true });
  }
}

export {
  binOf,
  firstLine,
  fromRoot,
  jsonIn,
  lintFindings,
  runNode,
  typeFindings,
  unread,
  vp,
  withReportFile,
  writtenTo,
};
export type { Ran };
