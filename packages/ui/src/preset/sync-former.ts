/* The files an earlier `@basis/ui` wrote and this one does not. Those it retires, `vp run sync` removes while each
 * opens as basis-ui wrote it. Those it hands to the app, the deploy files, since an app writes its own image and
 * pipeline, it keeps without basis-ui's header, and the app owns each from then. The drift check names each of either
 * kind that still opens as basis-ui wrote it. sync.ts applies them. */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ignored } from "./installed.ts";
import { opensAsWritten, withoutHeader } from "./sync-problems.ts";

/** Every path an earlier version wrote and this one does not, `/`-separated from the app's root, which `vp run sync`
 * removes while it holds the file as basis-ui wrote it. A file that leaves sync.ts's `framework`, or a skill that
 * leaves `skills/`, joins this list in the same change, its skill at both of its paths, unless the app is to keep it,
 * when it joins `releasedPaths`. */
const retiredPaths: readonly string[] = [];

/** Each path an earlier version wrote and this one hands to the app, `/`-separated from the app's root. */
const releasedPaths: readonly string[] = [
  "Dockerfile",
  "Caddyfile",
  ".dockerignore",
  "azure-pipelines.yml",
];

/** The text at each of `files` in the app at `root`, or `null` where it has none. */
async function textsOf(
  root: string,
  files: readonly string[],
): Promise<readonly (string | null)[]> {
  return Promise.all(
    files.map(async (file) => readFile(path.join(root, file), "utf8").catch(ignored)),
  );
}

/** The retired paths whose file the app holds as basis-ui wrote it. An app's own file at one of them, or anywhere
 * else, stays, whatever it says of basis-ui. */
async function retiredFiles(root: string, retired: readonly string[]): Promise<readonly string[]> {
  const texts = await textsOf(root, retired);
  return retired
    .filter((_file, index) => {
      const text = texts[index];
      return typeof text === "string" && opensAsWritten(text);
    })
    .toSorted();
}

/** A file handed to the app that still opens with basis-ui's header, and its text without it. */
interface Released {
  readonly path: string;
  readonly text: string;
}

/** The files at `released` that open with basis-ui's header, sorted by path, each with its text without it. */
async function releasedFiles(
  root: string,
  released: readonly string[] = releasedPaths,
): Promise<readonly Released[]> {
  const texts = await textsOf(root, released);
  return released
    .flatMap((file, index) => {
      const text = withoutHeader(texts[index]);
      return text === undefined ? [] : [{ path: file, text }];
    })
    .toSorted((left, right) => (left.path < right.path ? -1 : 1));
}

/** Writes each of `released` without its header, and says so, a line for each. */
async function handOver(root: string, released: readonly Released[]): Promise<readonly string[]> {
  await Promise.all(released.map(async (file) => writeFile(path.join(root, file.path), file.text)));
  return released.map((file) => `Handed ${file.path} to the app: basis-ui's header removed.`);
}

/** The one line for a file an earlier version managed, which the installed one hands to the app. */
function releasedProblem(file: string, installed: string): string {
  return `ERROR ${file} carries basis-ui's header, and @basis/ui ${installed} no longer manages it: run vp run sync to remove the header, and the file is the app's own.`;
}

export { handOver, releasedFiles, releasedProblem, retiredFiles, retiredPaths };
export type { Released };
