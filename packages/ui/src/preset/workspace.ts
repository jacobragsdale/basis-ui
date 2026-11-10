/* Whether an app is a package of a larger pnpm workspace, as packages/example is of basis-ui's, which `vp run sync`
 * asks before it writes `pnpm-workspace.yaml`. */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { ignored } from "./installed.ts";

/** pnpm's file for a workspace, one of the framework's files (sync.ts), which an app that is a package of a larger
 * workspace does without. */
const workspaceFile = "pnpm-workspace.yaml";

/** The nearest pnpm workspace file in a folder above `folder`, with its folder, if there is one. */
async function workspaceAbove(
  folder: string,
): Promise<{ readonly folder: string; readonly text: string } | undefined> {
  const parent = path.dirname(folder);
  if (parent === folder) {
    return undefined;
  }
  const text = await readFile(path.join(parent, workspaceFile), "utf8").catch(ignored);
  return text === null ? workspaceAbove(parent) : { folder: parent, text };
}

/** The globs of a pnpm workspace file's `packages` list, such as `packages/*`, and `!` before one it leaves out. */
function packageGlobs(text: string): readonly string[] {
  const list =
    /^packages:[^\n]*\n(?<items>(?:[ \t]+[^\n]*\n?)*)/mu.exec(text)?.groups?.["items"] ?? "";
  return [
    ...list.matchAll(/^[ \t]+-[ \t]+["']?(?<glob>[^"'#\n]+?)["']?[ \t]*(?:#[^\n]*)?$/gmu),
  ].map((item) => item.groups?.["glob"] ?? "");
}

/** Whether the app at `root` is a package of a pnpm workspace above it. pnpm and Vite read the nearest workspace file,
 * so one of the app's own would split it, and `vp dev` would refuse every file from outside the app. */
async function inWorkspace(root: string): Promise<boolean> {
  const above = await workspaceAbove(path.resolve(root));
  if (above === undefined) {
    return false;
  }
  const relative = path.relative(above.folder, path.resolve(root)).split(path.sep).join("/");
  const globs = packageGlobs(above.text);
  const matches = (glob: string): boolean => path.posix.matchesGlob(relative, glob);
  return (
    globs.some((glob) => !glob.startsWith("!") && matches(glob)) &&
    !globs.some((glob) => glob.startsWith("!") && matches(glob.slice(1)))
  );
}

export { inWorkspace, workspaceFile };
