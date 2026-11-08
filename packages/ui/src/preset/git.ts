/* git, as the tasks call it: in the app's root, without the variables a hook sets, so git reads the repo it is run in. */

import { execFileSync } from "node:child_process";

/** The most a task reads from one git command, 64 MiB: far more than any diff a review summarises. */
const largestOutput = 67_108_864;

const environment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);

/** What `git ARGS` prints in `root`, trimmed at its end, or `undefined` when git fails or is not installed. */
function git(root: string, args: readonly string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      env: environment,
      maxBuffer: largestOutput,
      stdio: ["ignore", "pipe", "ignore"],
    }).trimEnd();
  } catch {
    return undefined;
  }
}

export { git };
