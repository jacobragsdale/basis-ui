/* The marks of a file `vp run sync` wrote, its header or a skill's stamp, and the ERROR lines of the drift check,
 * `vp run sync --check`, for one that differs from what the installed `@basis/ui` writes. sync.ts applies them. */

import { configFileProblem, isAppConfig, isConfigFile } from "./app-config.ts";
import { git } from "./git.ts";

/** The line every framework file opens with, which marks one `vp run sync` wrote. */
const header =
  "# This file is managed by basis-ui: `vp run sync` rewrites it from the installed @basis/ui, and `vp run verify` fails when it differs.";
/** The line an earlier version opened them with, which marks a file it wrote as well. */
const formerHeaders = [
  "# This file is managed by basis-ui: `vp run sync` rewrites it from the installed @basis/ui, and `vp run check-full` fails when it differs.",
];
/** What a skill's front matter says in its `metadata`, the marker for a skill. */
const marker = "managed by basis-ui";
const skillStamp = `metadata:\n  basis-ui: "${marker}: \`vp run sync\` rewrites it"\n`;
const frontMatterStart = "---\n";
const blockBegin = "<!-- basis-ui:begin (written by vp run sync; edit outside the markers) -->";
const agentsFile = "AGENTS.md";
/** CLAUDE.md as `vp run sync` writes it, which has no header: the one line that points Claude Code at AGENTS.md. */
const claudeText = "@AGENTS.md\n";

/** Whether `text` opens as a file `vp run sync` wrote: with the framework's header, this version's or an earlier one's,
 * or a skill's stamped front matter. */
function opensAsWritten(text: string): boolean {
  // A checkout that turned LF into CRLF still holds the file sync wrote.
  const lf = text.replaceAll("\r\n", "\n");
  return (
    [header, ...formerHeaders].some((line) => lf.startsWith(`${line}\n`)) ||
    lf.startsWith(`${frontMatterStart}${skillStamp}`)
  );
}

/** Whether the app's `current` text at `file` is its own, which `vp run sync` keeps: a file of the framework's, not
 * AGENTS.md, whose block sync merges, or the app's configuration, that does not open as sync wrote it. */
function ownFile(file: string, current: string | undefined): boolean {
  if (current === undefined || file === agentsFile || isAppConfig(file)) {
    return false;
  }
  return file === "CLAUDE.md" ? current !== claudeText : !opensAsWritten(current);
}

/** Those of `files` that hold work git has not committed: changed since the index, or untracked and not ignored.
 * Outside a git clone none can be told, so none is. */
function uncommittedFiles(root: string, files: readonly string[]): ReadonlySet<string> {
  if (files.length === 0) {
    return new Set();
  }
  const args = ["ls-files", "--modified", "--others", "--exclude-standard", "-z", "--", ...files];
  return new Set((git(root, args) ?? "").split("\0").filter((file) => file !== ""));
}

/** The one line for an app's own file at a path where `vp run sync` writes basis-ui's, which it keeps. */
function ownFileProblem(file: string): string {
  return `ERROR ${file} is the app's own, which vp run sync did not write, and basis-ui writes its own there: rename it, or delete it to take basis-ui's, then run vp run sync again.`;
}

/** The one line for a file `vp run sync` would rewrite that holds changes git has not committed, which it keeps. */
function uncommittedProblem(file: string, installed: string): string {
  return `ERROR ${file} has changes git has not committed, which vp run sync would overwrite with @basis/ui ${installed}'s: commit or discard them, then run vp run sync again.`;
}

/** The one line for `AGENTS.md`, when it differs. */
function agentsProblem(current: string | undefined, installed: string): string {
  if (current === undefined) {
    return `ERROR ${agentsFile} is missing: run vp run sync to write it, with basis-ui's block.`;
  }
  if (!current.includes(blockBegin)) {
    return `ERROR ${agentsFile} has no basis-ui block: run vp run sync to add it at the end.`;
  }
  return `ERROR ${agentsFile}'s basis-ui block differs from what @basis/ui ${installed} writes: run vp run sync to rewrite it, and keep the repo's own notes outside its markers.`;
}

/** The one line for a file that differs from what the installed version writes, the `text` of `wanted`. */
function problem(
  wanted: { readonly path: string; readonly text: string },
  current: string | undefined,
  installed: string,
): string {
  const file = wanted.path;
  if (current?.includes("\r\n") === true && current.replaceAll("\r\n", "\n") === wanted.text) {
    return `ERROR ${file} has CRLF line endings, where basis-ui writes LF: run vp run sync to write it with LF, and keep the .gitattributes it writes, which checks files out with LF.`;
  }
  if (file === agentsFile) {
    return agentsProblem(current, installed);
  }
  if (isConfigFile(file)) {
    return configFileProblem(file, current);
  }
  if (current === undefined) {
    return `ERROR ${file} is missing: run vp run sync to write it.`;
  }
  return `ERROR ${file} differs from what @basis/ui ${installed} writes: run vp run sync to put it back, since a change it needs belongs in @basis/ui.`;
}

/** The one line for a file an earlier version wrote, which the installed one retired. */
function retiredProblem(file: string, installed: string): string {
  return `ERROR ${file} carries basis-ui's header, and @basis/ui ${installed} no longer writes it: run vp run sync to remove it.`;
}

/** Of the files that differ, as `vp run sync` found them, those it writes, and the ERROR line of each it keeps: an
 * app's own file at a framework path, and a file with changes git has not committed. */
function sortedForWriting<
  Differing extends {
    readonly file: { readonly path: string };
    readonly current: string | undefined;
  },
>(
  root: string,
  differing: readonly Differing[],
  installed: string,
): { readonly writing: readonly Differing[]; readonly kept: readonly string[] } {
  const held = differing.filter(({ current }) => current !== undefined);
  const busy = uncommittedFiles(
    root,
    held.map(({ file }) => file.path),
  );
  const kept = differing.flatMap(({ current, file }) => {
    if (ownFile(file.path, current)) {
      return [ownFileProblem(file.path)];
    }
    return busy.has(file.path) ? [uncommittedProblem(file.path, installed)] : [];
  });
  const writing = differing.filter(
    ({ current, file }) => !ownFile(file.path, current) && !busy.has(file.path),
  );
  return { kept, writing };
}

export {
  agentsFile,
  blockBegin,
  claudeText,
  frontMatterStart,
  header,
  opensAsWritten,
  ownFile,
  ownFileProblem,
  problem,
  retiredProblem,
  skillStamp,
  sortedForWriting,
};
