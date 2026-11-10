/* The framework's files, which every basis-ui app shares and `vp run sync` writes from the installed `@basis/ui`:
 *
 *   vp run sync           writes each one that differs, and removes each one an earlier version wrote and this one
 *                         does not, at a path `retiredPaths` names, while it opens as basis-ui wrote it
 *   vp run sync --check   fails with one ERROR line for each one that differs, which `vp run check-full` runs first
 *
 * They are the files in this package's `sync/` folder, at the paths `framework` names, each opening with `header`, the
 * line that says basis-ui manages it, but `pnpm-workspace.yaml` in an app that is a package of a larger pnpm
 * workspace; `CLAUDE.md`, which holds only `@AGENTS.md`, as basis writes it; each skill in this package's `skills/`,
 * at `.agents/skills/NAME/` and its copy at `.claude/skills/NAME/`, the marker first in its front matter's
 * `metadata`; and basis-ui's block of `AGENTS.md`, between its markers, the rest of the file the app's own.
 * Every file is compared byte for byte, so a line ending other than LF is a difference too. */

import { mkdir, readFile, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { ignored } from "./installed.ts";
import { TaskError } from "./shot-options.ts";
import { inWorkspace, workspaceFile } from "./workspace.ts";

/** The line every framework file opens with, which marks one `vp run sync` wrote. */
const header =
  "# This file is managed by basis-ui: `vp run sync` rewrites it from the installed @basis/ui, and `vp run check-full` fails when it differs.";
/** What a skill's front matter says in its `metadata`, the marker for a skill. */
const marker = "managed by basis-ui";

const blockBegin = "<!-- basis-ui:begin (written by vp run sync; edit outside the markers) -->";
const blockEnd = "<!-- basis-ui:end -->";
const blockPattern = /<!-- basis-ui:begin\b[^\n]*-->\n[\s\S]*?<!-- basis-ui:end -->\n?/gu;
const agentsFile = "AGENTS.md";
const claudeText = "@AGENTS.md\n";
const skillStamp = `metadata:\n  basis-ui: "${marker}: \`vp run sync\` rewrites it"\n`;
const frontMatterStart = "---\n";

/** Each file of `sync/` an app holds, by its path in the app, `/`-separated, and its name in `sync/`, which has no
 * leading dot, since a package's dotfiles do not all survive publishing. */
const framework: readonly { readonly path: string; readonly source: string }[] = [
  { path: "Dockerfile", source: "Dockerfile" },
  { path: "Caddyfile", source: "Caddyfile" },
  { path: ".dockerignore", source: "dockerignore" },
  { path: "azure-pipelines.yml", source: "azure-pipelines.yml" },
  { path: ".gitattributes", source: "gitattributes" },
  { path: "pnpm-workspace.yaml", source: "pnpm-workspace.yaml" },
  { path: ".vite-hooks/pre-commit", source: "pre-commit" },
  { path: ".vite-hooks/pre-push", source: "pre-push" },
];

/** The folders the skills go in: `.agents/skills/NAME/`, and its copy for Claude Code. */
const skillFolders = [".agents/skills", ".claude/skills"];

/** Every path an earlier version wrote and this one does not, `/`-separated from the app's root, which `vp run sync`
 * removes while it holds the file as basis-ui wrote it. A file that leaves `framework`, or a skill that leaves
 * `skills/`, joins this list in the same change, its skill at both of its paths. */
const retiredPaths: readonly string[] = [];

/** A file `vp run sync` writes, by its path from the app's root, `/`-separated, and its text. */
interface Wanted {
  readonly path: string;
  readonly text: string;
}

/** What the installed `@basis/ui` writes in the app at `root`, and what it removes. */
interface SyncPlan {
  readonly version: string;
  readonly wanted: readonly Wanted[];
  readonly retired: readonly string[];
}

/** The installed `@basis/ui`'s folder, found by its own name, wherever its code was bundled to. */
const packageRoot = path.dirname(createRequire(import.meta.url).resolve("@basis/ui/package.json"));

async function textOf(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return undefined;
  }
}

async function version(): Promise<string> {
  const text = (await textOf(path.join(packageRoot, "package.json"))) ?? "{}";
  const parsed: unknown = JSON.parse(text);
  return typeof parsed === "object" && parsed !== null && "version" in parsed
    ? String(parsed.version)
    : "unknown";
}

/** A file this package ships, or a failure that says the installation is broken. */
async function shipped(relative: string): Promise<string> {
  const text = await textOf(path.join(packageRoot, relative));
  if (text === undefined) {
    throw new TaskError(
      `ERROR @basis/ui has no ${relative}, which vp run sync writes into the app from: reinstall it with vp install --force.`,
    );
  }
  return text;
}

/** A skill's `SKILL.md` as the app holds it: the marker first in its front matter, as the `metadata` entry `basis-ui`. */
function stamped(text: string, name: string): string {
  const frontMatter = text.slice(0, text.indexOf("\n---", frontMatterStart.length));
  if (!text.startsWith(frontMatterStart) || /^metadata:/mu.test(frontMatter)) {
    throw new TaskError(
      `ERROR @basis/ui's skill ${name} has no front matter, or a metadata map of its own, where vp run sync writes its marker: a defect in @basis/ui; report it, and reinstall a release with vp install --force.`,
    );
  }
  return `${frontMatterStart}${skillStamp}${text.slice(frontMatterStart.length)}`;
}

/** Each skill this package ships, at `.agents/skills/NAME/SKILL.md` and its copy for Claude Code. */
async function skills(): Promise<readonly Wanted[]> {
  const entries = await readdir(path.join(packageRoot, "skills"), { withFileTypes: true });
  const names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const texts = await Promise.all(
    names.map(async (name) => stamped(await shipped(`skills/${name}/SKILL.md`), name)),
  );
  return names.flatMap((name, index) =>
    skillFolders.map((folder) => ({
      path: `${folder}/${name}/SKILL.md`,
      text: texts[index] ?? "",
    })),
  );
}

/** basis-ui's block of `AGENTS.md`, between its markers. */
async function block(): Promise<string> {
  return `${blockBegin}\n\n${await shipped("sync/agents.md")}\n${blockEnd}\n`;
}

/** `AGENTS.md` with basis-ui's block current: in place of the first one it holds, any other removed, or else added at
 * the end, after the app's own text. */
function withBlock(current: string | undefined, wanted: string): string {
  if (current === undefined) {
    return `# Agent guide\n\n${wanted}`;
  }
  const first = [...current.matchAll(blockPattern)].at(0);
  if (first === undefined) {
    return `${current.trimEnd()}\n\n${wanted}`;
  }
  const after = current.slice(first.index + first[0].length).replaceAll(blockPattern, "");
  return `${current.slice(0, first.index)}${wanted}${after}`;
}

/** Whether `text` opens as a file `vp run sync` wrote: with the framework's header, or a skill's stamped front matter. */
function opensAsWritten(text: string): boolean {
  return text.startsWith(`${header}\n`) || text.startsWith(`${frontMatterStart}${skillStamp}`);
}

/** The retired paths whose file the app holds as basis-ui wrote it. An app's own file at one of them, or anywhere
 * else, stays, whatever it says of basis-ui. */
async function retiredFiles(root: string, retired: readonly string[]): Promise<readonly string[]> {
  const texts = await Promise.all(retired.map(async (file) => textOf(path.join(root, file))));
  return retired
    .filter((_file, index) => {
      const text = texts[index];
      return text !== undefined && opensAsWritten(text);
    })
    .toSorted();
}

/** What the installed `@basis/ui` writes in the app at `root`, and what it removes of `retired`. */
async function planSync(root: string, retired = retiredPaths): Promise<SyncPlan> {
  const member = await inWorkspace(root);
  const files = await Promise.all(
    framework
      .filter((file) => !member || file.path !== workspaceFile)
      .map(async (file) => ({
        path: file.path,
        text: await shipped(`sync/${file.source}`),
      })),
  );
  const agents = withBlock(await textOf(path.join(root, agentsFile)), await block());
  const wanted = [
    ...files,
    { path: "CLAUDE.md", text: claudeText },
    ...(await skills()),
    { path: agentsFile, text: agents },
  ];
  return { retired: await retiredFiles(root, retired), version: await version(), wanted };
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
  if (current === undefined) {
    return `ERROR ${file} is missing: run vp run sync to write it.`;
  }
  return `ERROR ${file} differs from what @basis/ui ${installed} writes: run vp run sync to put it back, since a change it needs belongs in @basis/ui.`;
}

/** The files of the plan that differ from what the app holds, with the text the app holds. */
async function stale(
  root: string,
  plan: SyncPlan,
): Promise<readonly { readonly file: Wanted; readonly current: string | undefined }[]> {
  const current = await Promise.all(
    plan.wanted.map(async (file) => textOf(path.join(root, file.path))),
  );
  return plan.wanted.flatMap((file, index) =>
    current[index] === file.text ? [] : [{ current: current[index], file }],
  );
}

/** One ERROR line for each framework file that differs from what the installed version writes. */
async function syncProblems(root: string, plan: SyncPlan): Promise<readonly string[]> {
  const files = await stale(root, plan);
  const differing = files.map(({ current, file }) => problem(file.path, current, plan.version));
  const retired = plan.retired.map(
    (file) =>
      `ERROR ${file} carries basis-ui's header, and @basis/ui ${plan.version} no longer writes it: run vp run sync to remove it.`,
  );
  return [...differing, ...retired];
}

/** Removes a retired file, and its skill's folder once it is empty. */
async function remove(root: string, file: string): Promise<void> {
  await rm(path.join(root, file), { force: true });
  const folder = path.posix.dirname(file);
  if (skillFolders.includes(path.posix.dirname(folder))) {
    await rmdir(path.join(root, folder)).catch(ignored);
  }
}

/** Writes each framework file that differs, removes each retired one, and says what it did. */
async function syncWrite(root: string, retired = retiredPaths): Promise<string> {
  const plan = await planSync(root, retired);
  const writing = await stale(root, plan);
  await Promise.all(
    writing.map(async ({ file }) => {
      const target = path.join(root, file.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.text);
    }),
  );
  await Promise.all(plan.retired.map(async (file) => remove(root, file)));
  const done = [
    ...writing.map(({ file }) => `Wrote ${file.path}.`),
    ...plan.retired.map((file) => `Removed ${file}.`),
  ];
  return done.length === 0
    ? `The framework's files match @basis/ui ${plan.version}.`
    : done.join("\n");
}

/** `vp run sync`, or with `--check`, the drift check. */
async function sync(root: string, args: readonly string[]): Promise<string> {
  if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
    throw new TaskError(
      "ERROR vp run sync takes --check at most: run vp run sync to write the framework's files, or vp run sync --check to compare them.",
    );
  }
  if (args.length === 0) {
    return syncWrite(root);
  }
  const plan = await planSync(root);
  const found = await syncProblems(root, plan);
  if (found.length > 0) {
    throw new TaskError(found.join("\n"));
  }
  return `The framework's files match @basis/ui ${plan.version}.`;
}

/** `@basis/ui`'s folder and version, for the other tasks. */
async function installedUi(): Promise<{ readonly root: string; readonly version: string }> {
  return { root: packageRoot, version: await version() };
}

export { installedUi, planSync, sync, syncProblems, syncWrite };
export type { SyncPlan, Wanted };
