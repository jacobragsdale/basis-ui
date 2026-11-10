/* The codemods a release of `@basis/ui` ships, which `vp run upgrade` runs over an app's files. A codemod is a module
 * of this package's `src/codemods/VERSION/NAME.ts`, built to `dist/codemods/VERSION/NAME.mjs`, which exports
 * `codemod`, a `Codemod`. VERSION is the release it belongs to; one written since the last release sits in
 * `src/codemods/unreleased/`, which a release renames to its version as it renames the changelog's Unreleased, and
 * which an upgrade takes for the version of the package that holds it. An upgrade from one version to another runs
 * every codemod after the first up to the second, oldest release first, and a release's own in the order of their
 * names. Each reads the app's files that git tracks, by their extensions, and returns each one's new text. */

import { readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

import { git } from "./git.ts";
import { compareVersions, exactVersion, ignored } from "./installed.ts";
import { TaskError } from "./task-error.ts";

/** A file of the app as a codemod is given it: its path from the app's root, `/`-separated, and its text. */
interface CodemodFile {
  readonly path: string;
  readonly text: string;
}

/** What a codemod's module exports as `codemod`. */
interface Codemod {
  /** What it changes, in a line, as the changelog's entry for the change says it. */
  readonly description: string;
  /** The extensions of the files it reads, such as `.ts` and `.tsx`. */
  readonly extensions: readonly string[];
  /** The file's text with the change made, or its text as it was. A file it cannot read throws, saying why. */
  readonly transform: (file: CodemodFile) => string;
}

/** A codemod a package ships: its id, such as `0.4.0/fetch-rule-name`, the release it belongs to, and its module. */
interface ShippedCodemod {
  readonly id: string;
  readonly version: string;
  readonly module: string;
}

/** One file a codemod changed, before and after. */
interface CodemodChange {
  readonly path: string;
  readonly before: string;
  readonly after: string;
}

/** What one codemod did, or would do. */
interface CodemodRun {
  readonly id: string;
  readonly description: string;
  readonly changes: readonly CodemodChange[];
}

/** The folder of releases' codemods in a package's source, then in its build: `src/` in basis-ui's workspace, where
 * Node runs the TypeScript, and `dist/` in an installed package, which ships no source. */
const source = { extension: ".ts", folder: "src/codemods" };
const build = { extension: ".mjs", folder: "dist/codemods" };

const unreleased = "unreleased";

const transformSchema = z.custom<Codemod["transform"]>((value) => typeof value === "function");
const codemodSchema = z.object({
  description: z.string(),
  extensions: z.array(z.string()),
  transform: transformSchema,
});
const moduleSchema = z.object({ codemod: codemodSchema });

/** One release's folder of codemods: the folder they are all in, its own name in it, and the release it is. */
interface ReleaseFolder {
  readonly base: string;
  readonly name: string;
  readonly version: string;
}

/** The codemods in one release's folder, each a module with `extension`. */
async function releaseFolder(
  { base, name, version }: ReleaseFolder,
  extension: string,
): Promise<readonly ShippedCodemod[]> {
  const files = await readdir(path.join(base, name));
  return files
    .filter((file) => file.endsWith(extension) && !/\.(?:d|test)\.[mc]?ts$/u.test(file))
    .toSorted()
    .map((file) => ({
      id: `${version}/${file.slice(0, -extension.length)}`,
      module: path.join(base, name, file),
      version,
    }));
}

/** The codemods in the folder of releases' codemods at `base`, if it exists. */
async function inFolder(
  base: string,
  extension: string,
  packageVersion: string,
): Promise<readonly ShippedCodemod[] | undefined> {
  const names = await readdir(base).catch(ignored);
  if (names === null) {
    return undefined;
  }
  const releases = names.filter((name) => name === unreleased || exactVersion.test(name));
  const found = await Promise.all(
    releases.map(async (name) =>
      releaseFolder(
        { base, name, version: name === unreleased ? packageVersion : name },
        extension,
      ),
    ),
  );
  return found.flat().toSorted((left, right) => compareVersions(left.version, right.version));
}

/** Every codemod the package at `packageDir`, at `packageVersion`, ships, oldest release first. */
async function shippedCodemods(
  packageDir: string,
  packageVersion: string,
): Promise<readonly ShippedCodemod[]> {
  const real = await realpath(packageDir);
  return (
    (await inFolder(path.join(real, source.folder), source.extension, packageVersion)) ??
    (await inFolder(path.join(real, build.folder), build.extension, packageVersion)) ??
    []
  );
}

/** The codemods an upgrade from `from` to `to` runs, in the order it runs them. */
function codemodsBetween(
  shipped: readonly ShippedCodemod[],
  from: string,
  to: string,
): readonly ShippedCodemod[] {
  return shipped.filter(
    ({ version }) => compareVersions(version, from) > 0 && compareVersions(version, to) <= 0,
  );
}

/** The app's files that git tracks, or knows of and does not ignore, `/`-separated from its root. */
function appFiles(root: string): readonly string[] {
  const listed = git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]);
  if (listed === undefined) {
    throw new TaskError(
      "ERROR vp run upgrade could not list the app's files with git ls-files: run it in the app's git clone, with git on the PATH.",
    );
  }
  return [...new Set(listed.split("\0").filter((file) => file !== ""))];
}

/** The codemod a shipped module exports. */
async function loaded(shipped: ShippedCodemod): Promise<Codemod> {
  const parsed = moduleSchema.safeParse(await import(pathToFileURL(shipped.module).href));
  if (!parsed.success) {
    throw new TaskError(
      `ERROR codemod ${shipped.id} exports no codemod with a description, extensions and a transform: report it to basis-ui's maintainer, and make the change its changelog entry describes by hand.`,
    );
  }
  return parsed.data.codemod;
}

/** What `codemod`, shipped as `id`, changes in `file`, if anything. */
function changeOf(id: string, codemod: Codemod, file: CodemodFile): CodemodChange | undefined {
  try {
    const after = codemod.transform(file);
    return after === file.text ? undefined : { after, before: file.text, path: file.path };
  } catch (error) {
    throw new TaskError(
      `ERROR codemod ${id} could not change ${file.path} (${error instanceof Error ? error.message : String(error)}): make the change its changelog entry describes in that file by hand, then run vp run verify.`,
    );
  }
}

/** The app's files a codemod reads, with their text as the codemods before it left them in `texts`, which it reads
 * from disk the first time. */
async function textsOf(
  root: string,
  files: readonly string[],
  texts: Map<string, string>,
): Promise<readonly CodemodFile[]> {
  const read = await Promise.all(
    files.map(async (file) => {
      const text =
        texts.get(file) ?? (await readFile(path.join(root, file), "utf8").catch(ignored));
      return text === null ? undefined : { path: file, text };
    }),
  );
  return read.filter((entry) => entry !== undefined);
}

/** Runs `shipped`, each in turn, on the app's `files` as the ones before left them in `texts`, which holds each
 * file's text once a codemod has read it. */
async function runEach(
  root: string,
  shipped: readonly ShippedCodemod[],
  files: { readonly paths: readonly string[]; readonly texts: Map<string, string> },
): Promise<readonly CodemodRun[]> {
  const [each, ...rest] = shipped;
  if (each === undefined) {
    return [];
  }
  const codemod = await loaded(each);
  const read = files.paths.filter((file) => codemod.extensions.some((ext) => file.endsWith(ext)));
  const texts = await textsOf(root, read, files.texts);
  const changes = texts.flatMap((file) => {
    const change = changeOf(each.id, codemod, file);
    files.texts.set(file.path, change?.after ?? file.text);
    return change === undefined ? [] : [change];
  });
  const run = { changes, description: codemod.description, id: each.id };
  return [run, ...(await runEach(root, rest, files))];
}

/** Runs each codemod over the app at `root` in turn, each on the files as the one before left them, and writes what
 * they change unless `write` is false, for a dry run. */
async function runCodemods(
  root: string,
  shipped: readonly ShippedCodemod[],
  write: boolean,
): Promise<readonly CodemodRun[]> {
  const files = {
    paths: shipped.length === 0 ? [] : appFiles(root),
    texts: new Map<string, string>(),
  };
  const runs = await runEach(root, shipped, files);
  const changed = new Set(runs.flatMap(({ changes }) => changes.map(({ path: file }) => file)));
  if (write) {
    await Promise.all(
      [...changed].map(async (file) =>
        writeFile(path.join(root, file), files.texts.get(file) ?? ""),
      ),
    );
  }
  return runs;
}

export { codemodsBetween, runCodemods, shippedCodemods };
export type { Codemod, CodemodChange, CodemodFile, CodemodRun, ShippedCodemod };
