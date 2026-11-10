/* The marks of a file `vp run sync` wrote, its header or a skill's stamp, and the ERROR lines of the drift check,
 * `vp run sync --check`, for one that differs from what the installed `@basis/ui` writes. sync.ts applies them. */

import { configFileProblem, isConfigFile } from "./app-config.ts";

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

/** Whether `text` opens as a file `vp run sync` wrote: with the framework's header, this version's or an earlier one's,
 * or a skill's stamped front matter. */
function opensAsWritten(text: string): boolean {
  return (
    [header, ...formerHeaders].some((line) => text.startsWith(`${line}\n`)) ||
    text.startsWith(`${frontMatterStart}${skillStamp}`)
  );
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

/** The one line for a file that differs from what the installed version writes. */
function problem(file: string, current: string | undefined, installed: string): string {
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

export {
  agentsFile,
  blockBegin,
  frontMatterStart,
  header,
  opensAsWritten,
  problem,
  retiredProblem,
  skillStamp,
};
