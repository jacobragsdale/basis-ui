/* Comments that turn a check off (docs/design.md, The toolchain, at its strictest). An app turns off a lint rule only
 * where `suppressible` allows, and hides no type error: `@ts-expect-error`, `@ts-ignore` and `@ts-nocheck` are refused
 * everywhere. Three places read them through this module:
 *
 *   basis/no-suppressions   the lint rule, which reports each refused comment as it is written (lint-plugin.ts)
 *   suppressions            verify's suppressions stage, which reads every file of src/ as text, since a comment that turns off
 *                           every rule would turn off the lint rule too, and counts what it finds
 *   vp run review           the count on the branch and on the one it merges into (review.ts)
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { TaskError } from "./task-error.ts";

/** The rules an app may turn off, each in the files of the folder it names from the app's root: the barrel files that
 * re-export the generated client, src/api/client.ts and src/api/mocks.ts, whose surface changes on every pull. */
const suppressible: Readonly<Record<string, string>> = { "oxc/no-barrel-file": "src/api/" };

/** The allowlist in words, for the messages. */
const allowedText = Object.entries(suppressible)
  .map(([rule, folder]) => `${rule} in ${folder.replace(/\/$/u, "")}`)
  .join(" and ");

/** A comment that turns a check off: its directive, as `oxlint-disable-next-line` or `@ts-expect-error`, and the
 * rules a lint directive names, none for every rule. */
interface Suppression {
  readonly directive: string;
  readonly rules: readonly string[];
}

const lintDirective =
  /^\s*(?<directive>(?:eslint|oxlint)-disable(?:-next-line|-line)?)(?=\s|$)(?<rest>.*)$/su;
const typeDirective = /^[\s*/]*(?<directive>@ts-(?:expect-error|ignore|nocheck))(?![\w-])/u;

/** The suppression a comment's text, without its `//` or `/* *\/`, holds, if it holds one. */
function suppressionIn(comment: string): Suppression | undefined {
  const type = typeDirective.exec(comment)?.groups;
  if (type !== undefined) {
    return { directive: type["directive"] ?? "", rules: [] };
  }
  const lint = lintDirective.exec(comment)?.groups;
  if (lint === undefined) {
    return undefined;
  }
  const [named = ""] = (lint["rest"] ?? "").split("--", 1);
  return {
    directive: lint["directive"] ?? "",
    rules: named.split(/[\s,]+/u).filter((rule) => rule !== ""),
  };
}

/** Whether `file`, a path from the app's root or an absolute one, is in `folder`. */
function inFolder(file: string, folder: string): boolean {
  return `/${file.replaceAll("\\", "/")}`.includes(`/${folder}`);
}

/** The rules `suppression` turns off that `file` may not, or every rule for a directive that names none. */
function refusedRules(suppression: Suppression, file: string): readonly string[] {
  return suppression.rules.filter((rule) => {
    const folder = suppressible[rule];
    return folder === undefined || !inFolder(file, folder);
  });
}

/** The one line for `suppression` in `file`, when the app may not write it. */
function refusal(suppression: Suppression, file: string): string | undefined {
  const { directive, rules } = suppression;
  if (directive.startsWith("@ts-")) {
    return `ERROR ${directive} hides a type error, and an app hides none: remove it and fix the type the compiler names, parsing a value of unknown shape with a zod schema rather than asserting its type.`;
  }
  const refused = refusedRules(suppression, file);
  if (rules.length > 0 && refused.length === 0) {
    return undefined;
  }
  const what = rules.length === 0 ? "every rule" : refused.join(", ");
  return `ERROR ${directive} turns off ${what}, and an app turns off no rule but ${allowedText}: remove the comment and fix what the rule reports, as its ERROR line says.`;
}

/** A suppression found in a file: where, the comment, and its refusal, if the app may not write it. */
interface Found {
  readonly file: string;
  readonly line: number;
  readonly directive: string;
  readonly refusal: string | undefined;
}

const comments = /\/\/(?<line>[^\n]*)|\/\*(?<block>[\s\S]*?)\*\//gu;

/** Every suppression in `text`, the source of `file`, a path from the app's root. Comments are found in the text, so
 * one quoted in a string counts too, which costs a rewording at most. */
function suppressionsInText(file: string, text: string): readonly Found[] {
  return [...text.matchAll(comments)].flatMap((match) => {
    const suppression = suppressionIn(match.groups?.["line"] ?? match.groups?.["block"] ?? "");
    if (suppression === undefined) {
      return [];
    }
    const line = text.slice(0, match.index).split("\n").length;
    return [{ directive: suppression.directive, file, line, refusal: refusal(suppression, file) }];
  });
}

const opening = /\/[/*]/u;

/** The suppression in one line of `file`, line `line`, as `git grep` prints it, in the first comment the line opens:
 * a block comment may close on a later line. */
function suppressionInLine(file: string, line: number, text: string): readonly Found[] {
  const start = opening.exec(text);
  const comment = start === null ? "" : text.slice(start.index + 2).replace(/\*\/[\s\S]*$/u, "");
  const suppression = start === null ? undefined : suppressionIn(comment);
  return suppression === undefined
    ? []
    : [{ directive: suppression.directive, file, line, refusal: refusal(suppression, file) }];
}

const sourceFile = /\.[cm]?[jt]sx?$/u;
const generated = "src/api/generated/";

/** Every suppression in the app's `src/`, but the generated client's, which `vp run client-pull` rewrites. */
async function suppressionsIn(root: string): Promise<readonly Found[]> {
  const entries = await readdir(path.join(root, "src"), { recursive: true }).catch(
    (): string[] => [],
  );
  const files = entries
    .map((entry) => `src/${entry.replaceAll("\\", "/")}`)
    .filter((file) => sourceFile.test(file) && !file.startsWith(generated))
    .toSorted();
  const texts = await Promise.all(
    files.map(async (file) => readFile(path.join(root, file), "utf8").catch(() => "")),
  );
  return files.flatMap((file, index) => suppressionsInText(file, texts[index] ?? ""));
}

/** "1 comment in WHERE turns a check off", or "3 comments in WHERE turn" one. */
function turningOff(count: number, where: string): string {
  return count === 1
    ? `1 comment in ${where} turns a check off`
    : `${String(count)} comments in ${where} turn a check off`;
}

/** The task of verify's stage: one ERROR line for each suppression the app may not write, or the count of those it may. */
async function suppressionsTask(root: string, args: readonly string[]): Promise<string> {
  if (args.length > 0) {
    throw new TaskError(
      "ERROR suppressions takes no arguments: run it as vp run verify runs it, with none.",
    );
  }
  const found = await suppressionsIn(root);
  const refused = found.flatMap(({ file, line, refusal: text }) =>
    text === undefined ? [] : [text.replace(/^ERROR /u, `ERROR ${file}:${String(line)}: `)],
  );
  if (refused.length > 0) {
    throw new TaskError(refused.join("\n"));
  }
  return `${turningOff(found.length, "src/")}, each on the allowlist: ${allowedText}.`;
}

export {
  allowedText,
  refusal,
  suppressible,
  suppressionIn,
  suppressionInLine,
  suppressionsIn,
  suppressionsInText,
  suppressionsTask,
  turningOff,
};
export type { Found, Suppression };
