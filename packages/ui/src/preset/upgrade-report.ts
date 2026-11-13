/* What `vp run upgrade` prints: the changelog between the two versions, each codemod's change, and the summary that
 * says what was done and what is left to look at. upgrade.ts runs the steps. */

import { headingOf, whatToDo } from "./changelog.ts";
import type { Release } from "./changelog.ts";
import type { CodemodRun } from "./codemods.ts";
import { changeText } from "./line-diff.ts";

/** What a release brings an app, read from its package: the changelog's sections between the two versions, or
 * `undefined` when the package ships no changelog or one that cannot be read, and the codemods' runs. */
interface ReleaseNotes {
  readonly sections: readonly Release[] | undefined;
  readonly runs: readonly CodemodRun[];
  /** Why the changelog could not be read, when it could not. */
  readonly unreadable?: string | undefined;
}

/** What the codemods of an upgrade did, for its summary: how many ran, and the files they changed. */
interface CodemodsDone {
  readonly runs: number;
  readonly files: readonly string[];
}

/** Names joined as a sentence lists them: `a`, `a and b`, `a, b and c`. */
function listed(names: readonly string[]): string {
  return names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}

/** The changelog's sections between the two versions, as the file writes them, or why they cannot be. */
function changelogText(
  sections: ReleaseNotes["sections"],
  to: string,
  unreadable?: string,
): string {
  if (unreadable !== undefined) {
    return `@basis/ui ${to}'s CHANGELOG.md could not be read (${unreadable}), so what changed is not listed here: read it with vp run docs ui/changelog.`;
  }
  if (sections === undefined) {
    return `@basis/ui ${to} ships no CHANGELOG.md, so what changed is not listed.`;
  }
  if (sections.length === 0) {
    return `@basis/ui ${to}'s CHANGELOG.md lists no change between the two.`;
  }
  const written = sections.map((section) =>
    [headingOf(section), "", ...section.entries].join("\n"),
  );
  return [`What changed, from @basis/ui ${to}'s CHANGELOG.md:`, ...written].join("\n\n");
}

/** One codemod's run: what it does, then each file it changes, with the lines. */
function runText(run: CodemodRun): string {
  const head = `codemod ${run.id}, which ${run.description}`;
  const failed = run.failed.map((line) => `     ${line}`);
  if (run.changes.length === 0) {
    return [`${head}, changes no file`, ...failed].join("\n");
  }
  const files = run.changes.map(
    ({ after, before, path }) => `     ${path}\n${changeText(before, after)}`,
  );
  return [`${head}, changes:`, ...files, ...failed].join("\n");
}

/** Every codemod's run, one after another, or the line that says none ships between the two. */
function runsText(runs: readonly CodemodRun[]): string {
  return runs.length === 0
    ? "No codemod ships between the two."
    : runs.map((run) => runText(run)).join("\n");
}

/** The changelog's "What to do:" of each entry, by its release, which the upgrade leaves to the app. */
function byHandText(sections: ReleaseNotes["sections"], packageVersion: string): string {
  const asked = (sections ?? []).flatMap((section) =>
    section.entries
      .map((entry) => whatToDo(entry))
      .filter((text) => text !== undefined)
      .map((text) => `  - ${section.version ?? packageVersion}: ${text}`),
  );
  return asked.length === 0
    ? "The changelog asks nothing more of the app."
    : ["What the changelog asks of the app, which no codemod does:", ...asked].join("\n");
}

/** What the codemods of `runs` did, for the summary. */
function codemodsDone(runs: readonly CodemodRun[]): CodemodsDone {
  const files = new Set(runs.flatMap(({ changes }) => changes.map(({ path }) => path)));
  return { files: [...files], runs: runs.length };
}

/** The summary of an upgrade that ran: what it did, whether verify passed, and what to look at. */
function summaryText(
  move: { readonly names: readonly string[]; readonly from: string; readonly to: string },
  notes: { readonly sections: ReleaseNotes["sections"]; readonly codemods: CodemodsDone },
  verified: boolean,
): string {
  const { runs, files } = notes.codemods;
  const count = files.length;
  const codemods =
    runs === 0
      ? "no codemod ships between the two"
      : `${String(runs)} codemod${runs === 1 ? "" : "s"} changed ${String(count)} file${count === 1 ? "" : "s"}`;
  return [
    `Upgraded ${listed(move.names)} from ${move.from} to ${move.to}: vp run sync wrote the framework's files, ${codemods}, and vp run verify ${verified ? "passed" : "failed"}.`,
    "What to look at:",
    "  - git diff: the framework's files and what the codemods changed, before you commit.",
    `  - ${byHandText(notes.sections, move.to).replaceAll("\n  - ", "\n    - ")}`,
    verified
      ? "Then commit package.json, the lockfile and the changed files together."
      : "Fix what vp run verify reports, then commit package.json, the lockfile and the changed files together.",
  ].join("\n");
}

/** What a dry run prints: the changelog, then each step the upgrade would take, with each codemod's change. */
function previewText(
  move: { readonly names: readonly string[]; readonly from: string; readonly to: string },
  notes: ReleaseNotes,
  dirty: boolean,
): string {
  const { from, names, to } = move;
  const command = `vp run upgrade ${to}`;
  return [
    `Dry run, which changes nothing: @basis/ui ${from} is installed, and ${command} would move ${listed(names)} to ${to}.`,
    changelogText(notes.sections, to, notes.unreadable),
    [
      `What ${command} would do:`,
      `  1. vp add --save-exact ${names.map((name) => `${name}@${to}`).join(" ")}`,
      `  2. vp run sync, which writes the framework's files from ${to}, then vp install, moving vite-plus and typescript where ${to} needs another version`,
      `  3. ${runsText(notes.runs).replaceAll("\n", "\n     ")}`,
      "  4. vp run verify",
    ].join("\n"),
    [
      byHandText(notes.sections, to),
      ...(dirty
        ? [
            `The working tree has changes not committed, and ${command} refuses to start until they are committed or stashed.`,
          ]
        : []),
      `Run ${command} to upgrade.`,
    ].join("\n"),
  ].join("\n\n");
}

export { changelogText, codemodsDone, listed, previewText, runsText, summaryText };
export type { CodemodsDone, ReleaseNotes };
