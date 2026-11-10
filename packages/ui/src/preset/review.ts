/* A pull request's summary, so a reviewer judges what changed rather than every line:
 *
 *   vp run review [BRANCH]   prints, as Markdown to paste into the pull request, the commit `vp run verify` passed
 *                            on, the versions, the API's operations the change adds, removes or changes, the
 *                            client's diff, and the comments that turn a check off, against BRANCH, `origin/main`
 *                            unless named
 *
 * `vp run verify`, when it runs every stage and each passes, records, in the git folder the clone's worktrees share,
 * each commit it passed on with nothing uncommitted. Screenshot diffs wait for the visual baselines (roadmap step 1.6). */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { git } from "./git.ts";
import { ignored, manifestSchema } from "./installed.ts";
import { TaskError } from "./shot-options.ts";
import { suppressionInLine, turningOff } from "./suppressions.ts";
import type { Found } from "./suppressions.ts";
import { installedUi } from "./sync.ts";

/** Where the records go, in the git folder, and how many characters of a commit's id a summary shows. */
const recordFolder = path.join("basis-ui", "checked");
const shortId = 10;
/** The packages whose versions every summary shows; any other dependency shows when it changes. */
const keyPackages = new Set(["@basis/ui", "@basis/parallax", "vite-plus", "typescript"]);

const recordSchema = z.object({ basis_ui: z.string(), checked_at: z.string(), commit: z.string() });
type CheckRecord = z.infer<typeof recordSchema>;

const operationSchema = z.object({ operationId: z.string() });
const pathItemSchema = z.record(z.string(), z.unknown());
const documentSchema = z.object({ paths: z.record(z.string(), pathItemSchema) });

/** The file that records `commit`'s check, in the git folder the clone's worktrees share. */
function recordFile(root: string, commit: string): string | undefined {
  const common = git(root, ["rev-parse", "--git-common-dir"]);
  return common === undefined
    ? undefined
    : path.join(path.resolve(root, common), recordFolder, `${commit}.json`);
}

/** Writes the record that `vp run verify` passed on `commit`, with the installed @basis/ui. */
async function writeRecord(file: string, commit: string): Promise<void> {
  const ui = await installedUi();
  const record: CheckRecord = {
    basis_ui: ui.version,
    checked_at: new Date().toISOString(),
    commit,
  };
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`);
}

/** `vp run verify`'s last step, when every stage passed: records that it passed on HEAD, when the worktree holds
 * nothing uncommitted. */
async function recordCheck(root: string): Promise<string> {
  const commit = git(root, ["rev-parse", "HEAD"]);
  const file = commit === undefined ? undefined : recordFile(root, commit);
  if (commit === undefined || file === undefined) {
    return "Not recorded for vp run review: this folder is not a git clone with a commit.";
  }
  if (git(root, ["status", "--porcelain"]) !== "") {
    return "Not recorded for vp run review: the worktree has uncommitted changes, so no commit holds what passed.";
  }
  await writeRecord(file, commit);
  return `Recorded for vp run review: vp run verify passed on ${commit.slice(0, shortId)}.`;
}

/** The record of `commit`'s check, or a failure saying to run it. */
async function recordOf(root: string, commit: string): Promise<CheckRecord> {
  const file = recordFile(root, commit);
  const text = file === undefined ? null : await readFile(file, "utf8").catch(ignored);
  const record = recordSchema.safeParse(text === null ? null : JSON.parse(text));
  if (!record.success) {
    throw new TaskError(
      `ERROR vp run verify has not passed on ${commit.slice(0, shortId)}, the commit to review: commit every change, run vp run verify, then vp run review again.`,
    );
  }
  return record.data;
}

/** The branch to compare with: the one named, or `origin/main`, or `main`. */
function baseOf(root: string, named: string | undefined): string {
  const choices = named === undefined ? ["origin/main", "main"] : [named];
  const found = choices.find(
    (choice) => git(root, ["rev-parse", "--verify", "--quiet", `${choice}^{commit}`]) !== undefined,
  );
  if (found === undefined) {
    throw new TaskError(
      `ERROR there is no ${choices.join(" or ")} to compare with: name the branch the pull request merges into, as in vp run review origin/develop, after git fetch.`,
    );
  }
  return found;
}

/** A file of the app at `commit`, or `undefined` where the commit has none. */
function fileAt(root: string, commit: string, file: string): string | undefined {
  return git(root, ["show", `${commit}:./${file}`]);
}

/** Every dependency's version spec in the app's package.json at `commit`. */
function versionsAt(root: string, commit: string): ReadonlyMap<string, string> {
  const text = fileAt(root, commit, "package.json");
  const manifest = manifestSchema.safeParse(text === undefined ? {} : JSON.parse(text));
  const { dependencies = {}, devDependencies = {} } = manifest.success ? manifest.data : {};
  return new Map(Object.entries({ ...devDependencies, ...dependencies }));
}

/** The versions table: the key packages, and every other one that changed. */
function versionsSection(root: string, base: string, commits: readonly [string, string]): string {
  const [before, after] = commits.map((commit) => versionsAt(root, commit));
  const names = [...new Set([...(before?.keys() ?? []), ...(after?.keys() ?? [])])].toSorted();
  const shown = names.filter(
    (name) => keyPackages.has(name) || before?.get(name) !== after?.get(name),
  );
  const rows = shown.map((name) => {
    const [was = "none", is = "none"] = [before?.get(name), after?.get(name)];
    return `| \`${name}\` | ${was} | ${is}${was === is ? "" : " (changed)"} |`;
  });
  return [
    "### Versions",
    "",
    `| Package | ${base} | This branch |`,
    "| --- | --- | --- |",
    ...rows,
  ].join("\n");
}

/** Each operation in the app's openapi.json at `commit`, by its id, as JSON to compare. */
function operationsAt(root: string, commit: string): ReadonlyMap<string, string> {
  const text = fileAt(root, commit, "openapi.json");
  const document = documentSchema.safeParse(text === undefined ? {} : JSON.parse(text));
  const paths = document.success ? Object.entries(document.data.paths) : [];
  return new Map(
    paths.flatMap(([route, item]) =>
      Object.entries(item).flatMap(([method, candidate]) => {
        const operation = operationSchema.safeParse(candidate);
        return operation.success
          ? [[operation.data.operationId, JSON.stringify({ method, operation: candidate, route })]]
          : [];
      }),
    ),
  );
}

/** A list of operation ids, as Markdown code, or `none`. */
function listed(ids: readonly string[]): string {
  return ids.length === 0 ? "none" : ids.map((id) => `\`${id}\``).join(", ");
}

/** The API's operations the change adds, removes and changes, and the generated client's diff. */
function clientSection(root: string, commits: readonly [string, string]): string {
  const [before, after] = commits.map((commit) => operationsAt(root, commit));
  const ids = [...new Set([...(before?.keys() ?? []), ...(after?.keys() ?? [])])].toSorted();
  const added = ids.filter((id) => before?.has(id) !== true);
  const removed = ids.filter((id) => after?.has(id) !== true);
  const changed = ids.filter(
    (id) => before?.has(id) === true && after?.has(id) === true && before.get(id) !== after.get(id),
  );
  const stat = git(root, [
    "diff",
    "--shortstat",
    ...commits,
    "--",
    "openapi.json",
    "src/api/generated",
  ]);
  const lines =
    stat === undefined || stat === ""
      ? ["`openapi.json` and the generated client are unchanged."]
      : [
          `- Operations added: ${listed(added)}; removed: ${listed(removed)}; changed: ${listed(changed)}.`,
          `- \`openapi.json\` and \`src/api/generated\`: ${stat.trim()}.`,
        ];
  return ["### The API client", "", ...lines].join("\n");
}

/** The summary's opening lines: what was checked, against what, and anything left out. */
function headSection(
  root: string,
  record: CheckRecord,
  [base, mergeBase]: readonly [string, string],
): string {
  const subject = git(root, ["log", "-1", "--format=%s", record.commit]) ?? "";
  const stat = git(root, ["diff", "--shortstat", mergeBase, record.commit]) ?? "";
  const dirty =
    git(root, ["status", "--porcelain"]) === ""
      ? []
      : ["- The worktree has uncommitted changes, which this summary leaves out."];
  return [
    `## ${record.commit.slice(0, shortId)}: ${subject}`,
    "",
    `- Checked: \`vp run verify\` passed on this commit at ${record.checked_at}, with @basis/ui ${record.basis_ui}.`,
    `- Compared with ${base} at ${mergeBase.slice(0, shortId)}: ${stat === "" ? "no changes" : stat.trim()}.`,
    ...dirty,
  ].join("\n");
}

/** The comments that turn a check off in src/ at `commit`, but the generated client's, as `git grep` finds them. */
function suppressionsAt(root: string, commit: string): readonly Found[] {
  const lines = git(root, [
    "grep",
    "-n",
    "-I",
    "-E",
    String.raw`(oxlint|eslint)-disable|@ts-(expect-error|ignore|nocheck)`,
    commit,
    "--",
    "src",
    ":(exclude)src/api/generated",
  ]);
  return (lines ?? "").split("\n").flatMap((entry) => {
    const [file = "", line = "", ...text] = entry.slice(commit.length + 1).split(":");
    return suppressionInLine(file, Number(line), text.join(":"));
  });
}

/** How many comments turn a check off, on the branch and on the one it merges into, and where each is. */
function suppressionsSection(
  root: string,
  base: string,
  commits: readonly [string, string],
): string {
  const [before = [], after = []] = commits.map((commit) => suppressionsAt(root, commit));
  const where = after.map(
    ({ directive, file, line, refusal: refused }) =>
      `- \`${file}:${String(line)}\` \`${directive}\`${refused === undefined ? "" : ", refused"}`,
  );
  return [
    "### Suppressions",
    "",
    `${turningOff(after.length, "`src`")}, against ${String(before.length)} on ${base}.`,
    ...(where.length === 0 ? [] : ["", ...where]),
  ].join("\n");
}

const screenshotsSection = [
  "### Screenshots",
  "",
  "No visual baselines yet, so no screenshot diffs: attach a `vp run shot ROUTE` of each page the change touches.",
].join("\n");

/** `vp run review [BRANCH]`. */
async function review(root: string, args: readonly string[]): Promise<string> {
  const head = args.length > 1 ? undefined : git(root, ["rev-parse", "HEAD"]);
  if (head === undefined) {
    throw new TaskError(
      "ERROR vp run review summarises a commit of a git clone, against one branch at most: commit the change, then run vp run review, or vp run review BRANCH.",
    );
  }
  const record = await recordOf(root, head);
  const base = baseOf(root, args[0]);
  const mergeBase = git(root, ["merge-base", base, head]) ?? base;
  const commits = [mergeBase, head] as const;
  return [
    headSection(root, record, [base, mergeBase]),
    versionsSection(root, base, commits),
    clientSection(root, commits),
    suppressionsSection(root, base, commits),
    screenshotsSection,
  ].join("\n\n");
}

export { recordCheck, review };
