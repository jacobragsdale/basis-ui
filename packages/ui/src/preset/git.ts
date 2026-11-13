/* git, as the tasks call it: in the app's root, without the variables a hook sets, so git reads the repo it is run in.
 * What git says when it refuses is kept, so that a clone git will not read, as one it holds to be another user's, is
 * never mistaken for no clone at all. */

import { spawnSync } from "node:child_process";

/** The most a task reads from one git command, 64 MiB: far more than any diff a review summarises. */
const largestOutput = 67_108_864;

/** How a git command came out: what it printed, trimmed at its end, or what it said when it failed, if anything. */
type Ran =
  | { readonly ok: true; readonly out: string }
  | { readonly ok: false; readonly said: string };

/** `git ARGS` in `root`, with the environment as it is now, less git's own variables. */
function runGit(root: string, args: readonly string[]): Ran {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
  );
  const ran = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env,
    maxBuffer: largestOutput,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  if (ran.status === 0) {
    return { ok: true, out: ran.stdout.trimEnd() };
  }
  const said = ran.error?.message ?? ran.stderr.trim().split("\n")[0] ?? "";
  return { ok: false, said: said.replace(/^fatal: /u, "") };
}

/** What `git ARGS` prints in `root`, trimmed at its end, or `undefined` when git fails or is not installed. */
function git(root: string, args: readonly string[]): string | undefined {
  const ran = runGit(root, args);
  return ran.ok ? ran.out : undefined;
}

/** Why git will not read the clone at `root`, when it is one git refuses rather than no clone: as one it holds to be
 * another user's, which a folder under /mnt/c in WSL or a redirected folder is, with the fix and `then`, the command to
 * run after it; or `undefined` when git reads it, or finds no clone there. */
function refusedClone(root: string, then: string): string | undefined {
  const ran = runGit(root, ["rev-parse", "--show-toplevel"]);
  if (ran.ok || /not a git repository/iu.test(ran.said) || /ENOENT/u.test(ran.said)) {
    return undefined;
  }
  const dubious = /dubious ownership in repository at '(?<folder>[^']+)'/u.exec(ran.said);
  if (dubious !== null) {
    const folder = dubious.groups?.["folder"] ?? root;
    return `ERROR git will not read this clone, since another user owns ${folder} ("detected dubious ownership"), as for a folder under /mnt/c in WSL or a redirected one: run git config --global --add safe.directory ${folder}, then ${then}.`;
  }
  return `ERROR git will not read this clone (${ran.said}): fix what git says, then ${then}.`;
}

/** How many files a line names before it says how many more there are. */
const namedAtMost = 5;

/** The files that hold changes git has not committed, untracked ones included, in the whole clone, or under `root`
 * alone when `under` is true, as a line names them, in brackets after a space: ` (a.ts, b.ts)`, or the first few and
 * how many more; nothing when there are none, or git cannot tell. */
function uncommittedList(root: string, under = false): string {
  const scope = under ? ["--", "."] : [];
  const listed =
    git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all", ...scope]) ?? "";
  // Each entry is its two status letters, a space and the path; a rename's former path follows as an entry of its own.
  const files = listed.split("\0").flatMap((entry) => {
    const path = /^.. (?<path>.+)$/u.exec(entry)?.groups?.["path"];
    return path === undefined ? [] : [path];
  });
  const more = files.length - namedAtMost;
  const named =
    more > 0
      ? `${files.slice(0, namedAtMost).join(", ")} and ${String(more)} more`
      : files.join(", ");
  return named === "" ? "" : ` (${named})`;
}

/** The advice for a file git should never see, as an editor's folder, which no app's .gitignore names. */
const excludeAdvice = "keep a file git should never see, as an editor's, in .git/info/exclude";

export { excludeAdvice, git, refusedClone, uncommittedList };
