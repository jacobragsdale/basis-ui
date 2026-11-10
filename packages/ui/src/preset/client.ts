/* The client tasks the preset gives every app, run by Node in the app's root:
 *
 *   vp run client-pull PATH TAG   copies openapi.json from the API repo at PATH as tag TAG has it, then regenerates
 *   vp run client-pull URL        copies the document a deployed API serves at URL, then regenerates
 *   vp run client-pull            regenerates src/api/generated from the openapi.json already in the repo
 *   vp run client-check           fails when src/api/generated is not what openapi.json generates
 *
 * Every failure is one line that starts with ERROR and ends with the fix. */

import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { generate } from "orval";

import { displayFormatsModule } from "./display-formats.ts";
import { documentFile, generatedFolder, orvalOptions } from "./orval-options.ts";

/** What a task failure throws: its message is the line, or lines, the task prints. */
class TaskError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "TaskError";
  }
}

const pullUsage =
  "run vp run client-pull PATH TAG, such as vp run client-pull ../positions-api v1.4.0, or vp run client-pull URL, such as vp run client-pull https://positions.example/api/openapi.json";

/** The most `git show` may print, 64 MiB: far more than any API's document. */
const largestDocument = 67_108_864;

function parseJson(text: string, source: string): unknown {
  try {
    const document: unknown = JSON.parse(text);
    return document;
  } catch {
    throw new TaskError(
      `ERROR ${source} is not JSON: name the API's openapi.json, and ${pullUsage}.`,
    );
  }
}

/** A document's text as an OpenAPI 3 document, or a failure that names where it came from. */
function parseDocument(text: string, source: string): Record<string, unknown> {
  const document = parseJson(text, source);
  if (
    typeof document !== "object" ||
    document === null ||
    Array.isArray(document) ||
    !("openapi" in document) ||
    !("paths" in document)
  ) {
    throw new TaskError(
      `ERROR ${source} is not an OpenAPI document, which has "openapi" and "paths" members: name the API's openapi.json, and ${pullUsage}.`,
    );
  }
  return { ...document };
}

/** The document an API repo holds at `tag`: `openapi.json` at `source`, a folder in the repo, or the file named. */
function documentAtTag(source: string, tag: string): string {
  const file = source.endsWith(".json") ? source : path.join(source, documentFile);
  if (!existsSync(path.dirname(file))) {
    throw new TaskError(
      `ERROR ${path.dirname(file)} does not exist: give the path of a clone of the API repo, and ${pullUsage}.`,
    );
  }
  // Without git's own variables, which a hook sets, git reads the repo at `source` rather than the one running it.
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
  );
  try {
    return execFileSync("git", ["show", `${tag}:./${path.basename(file)}`], {
      cwd: path.dirname(file),
      encoding: "utf8",
      env: environment,
      maxBuffer: largestDocument,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new TaskError(
      `ERROR ${tag} has no ${file} in its git repo: name a tag of the API repo that holds its openapi.json, after git fetch --tags there, as in vp run client-pull ../positions-api v1.4.0.`,
    );
  }
}

/** What a deployed API answers at `url`. */
async function request(url: string): Promise<Response> {
  try {
    // oxlint-disable-next-line basis/no-fetch -- this downloads the API's document in Node, outside any app's client.
    return await fetch(url, { headers: { accept: "application/json" } });
  } catch (error) {
    throw new TaskError(
      `ERROR ${url} could not be reached (${String(error)}): check the address and the network, or copy the document from the API repo with vp run client-pull PATH TAG.`,
    );
  }
}

/** The document a deployed API serves at `url`. */
async function documentAtUrl(url: string): Promise<string> {
  const response = await request(url);
  if (!response.ok) {
    throw new TaskError(
      `ERROR ${url} answered ${String(response.status)} ${response.statusText}: name the address the API serves its document at, which ends /openapi.json, or copy it from the API repo with vp run client-pull PATH TAG.`,
    );
  }
  return response.text();
}

/** The document with basis's own marker replaced by one that says where this copy came from, first. basis marks the
 * file `basis sync` writes in an API repo; in a UI repo, `vp run client-pull` writes it. */
function pinned(document: Record<string, unknown>, origin: string): Record<string, unknown> {
  const markers = new Set(["x-basis", "x-basis-ui"]);
  return {
    "x-basis-ui": `copied by vp run client-pull from ${origin}; pull it again rather than edit it`,
    ...Object.fromEntries(Object.entries(document).filter(([key]) => !markers.has(key))),
  };
}

/** orval 8.46's MSW mocks pick an enum field's value with `Object.values(Convention)`, written for the plain object
 * its TypeScript models declare. With Zod models, `Convention` is a Zod enum, whose own properties are no value of it,
 * so every mock with an enum failed its own schema. A Zod 4 enum lists its values in `options`. */
const zodEnumMock =
  /faker\.helpers\.arrayElement\(Object\.values\((?<schema>[A-Za-z_$][\w$]*)\)\)/gu;

/** Rewrites the generated mocks' enum picks to read the Zod enum's `options`, so a mock passes its own schema. */
async function repairMocks(output: string): Promise<void> {
  const file = path.join(output, "client.msw.ts");
  if (!existsSync(file)) {
    return;
  }
  const text = await readFile(file, "utf8");
  const repaired = text.replaceAll(zodEnumMock, "faker.helpers.arrayElement($<schema>.options)");
  if (repaired !== text) {
    await writeFile(file, repaired);
  }
}

/** Writes `formats.ts`, each number property's display format from the document's `x-basis-format`. */
async function writeDisplayFormats(root: string, output: string): Promise<void> {
  const document: unknown = JSON.parse(await readFile(path.join(root, documentFile), "utf8"));
  await writeFile(path.join(output, "formats.ts"), displayFormatsModule(document));
}

/** Writes the client that the app's openapi.json generates into `output`. */
async function generateInto(root: string, output: string): Promise<void> {
  try {
    await generate(orvalOptions(root, output), root, { logLevel: "error", throwOnError: true });
    await repairMocks(output);
    await writeDisplayFormats(root, output);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("ERROR ")) {
      throw new TaskError(error.message);
    }
    throw new TaskError(
      `ERROR orval could not generate the client from ${documentFile} (${String(error).split("\n", 1).join("")}): copy the API's document again, and if it still fails, fix the document at the API.`,
    );
  }
}

/** Every file under `folder`, by its path from there with `/` between parts, and its text. Empty if it is missing. */
async function filesUnder(folder: string): Promise<ReadonlyMap<string, string>> {
  if (!existsSync(folder)) {
    return new Map();
  }
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
  const texts = await Promise.all(files.map(async (file) => readFile(file, "utf8")));
  return new Map(
    files.map((file, index) => [
      path.relative(folder, file).replaceAll("\\", "/"),
      texts[index] ?? "",
    ]),
  );
}

/** Where `vp run client-pull SOURCE [TAG]` copies the document from, read from its arguments. */
function sourceOf(args: readonly string[]): { readonly source: string; readonly tag?: string } {
  const [source, tag, ...extra] = args;
  if (source === undefined || extra.length > 0) {
    throw new TaskError(`ERROR vp run client-pull takes a source and a tag at most: ${pullUsage}.`);
  }
  const remote = /^https?:\/\//u.test(source);
  if (!remote && tag === undefined) {
    throw new TaskError(
      `ERROR vp run client-pull ${source} needs the tag to copy the document at, so the copy is pinned: ${pullUsage}.`,
    );
  }
  if (remote && tag !== undefined) {
    throw new TaskError(
      `ERROR vp run client-pull takes no tag with a URL, since a deployed API serves one version: ${pullUsage}.`,
    );
  }
  return tag === undefined ? { source } : { source, tag };
}

/** Copies the API's document into the app's openapi.json, marked with where it came from, and returns the text the
 * file held before, or `undefined` if there was none. */
async function copyDocument(root: string, args: readonly string[]): Promise<string | undefined> {
  const { source, tag } = sourceOf(args);
  const text = tag === undefined ? await documentAtUrl(source) : documentAtTag(source, tag);
  const origin = tag === undefined ? source : `${source} at ${tag}`;
  const document = pinned(parseDocument(text, origin), origin);
  const file = path.join(root, documentFile);
  const before = existsSync(file) ? await readFile(file, "utf8") : undefined;
  writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
  return before;
}

/** Puts back the openapi.json the app held before a copy whose client could not be generated. */
async function restoreDocument(root: string, before: string | undefined): Promise<void> {
  const file = path.join(root, documentFile);
  await (before === undefined ? rm(file, { force: true }) : writeFile(file, before));
}

async function pull(root: string, args: readonly string[]): Promise<string> {
  if (args.length === 0) {
    await generateInto(root, path.join(root, generatedFolder));
    return `Regenerated ${generatedFolder} from ${documentFile}.`;
  }
  const before = await copyDocument(root, args);
  try {
    await generateInto(root, path.join(root, generatedFolder));
  } catch (error) {
    // The client stays the one the app's own document generated, so the two still match.
    await restoreDocument(root, before);
    throw error;
  }
  return `Copied ${documentFile} and regenerated ${generatedFolder} from it.`;
}

/** How a generated file differs from the one in the repo: `want` is what the document generates, `have` the repo's. */
function difference(want: string | undefined, have: string | undefined): string {
  if (have === undefined) {
    return `is missing, though ${documentFile} generates it`;
  }
  if (want === undefined) {
    return `is not one ${documentFile} generates`;
  }
  return `differs from what ${documentFile} generates`;
}

/** One line for each file in which the app's client differs from what its document generates, now. orval writes the
 * fresh client to a temporary folder, whose files are what it would write to the app's. */
async function differences(root: string): Promise<readonly string[]> {
  const scratch = await mkdtemp(path.join(tmpdir(), "basis-ui-client-check-"));
  try {
    await generateInto(root, scratch);
    const expected = await filesUnder(scratch);
    const actual = await filesUnder(path.join(root, generatedFolder));
    const fix = `run vp run client-pull to regenerate the client from ${documentFile}, and never edit ${generatedFolder} by hand`;
    return [...new Set([...expected.keys(), ...actual.keys()])].toSorted().flatMap((file) => {
      const want = expected.get(file);
      const have = actual.get(file);
      return want === have
        ? []
        : [`ERROR ${generatedFolder}/${file} ${difference(want, have)}: ${fix}.`];
    });
  } finally {
    await rm(scratch, { force: true, recursive: true });
  }
}

async function check(root: string, args: readonly string[]): Promise<string> {
  if (args.length > 0) {
    throw new TaskError(
      "ERROR vp run client-check takes no arguments: run vp run client-check alone.",
    );
  }
  if (!existsSync(path.join(root, documentFile)) && !existsSync(path.join(root, generatedFolder))) {
    return `No ${documentFile} and no ${generatedFolder}: this app calls no API, so it has no client to check.`;
  }
  const found = await differences(root);
  if (found.length > 0) {
    throw new TaskError(found.join("\n"));
  }
  return `${generatedFolder} matches ${documentFile}.`;
}

async function main(): Promise<void> {
  const [task, ...args] = process.argv.slice(2);
  const root = process.cwd();
  try {
    const done = task === "check" ? await check(root, args) : await pull(root, args);
    process.stdout.write(`${done}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof TaskError ? error.message : `ERROR the client task failed: ${String(error)}; run it again, and report the message if it repeats.`}\n`,
    );
    process.exitCode = 1;
  }
}

await main();
