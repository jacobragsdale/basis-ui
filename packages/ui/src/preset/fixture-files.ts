/* Reading an app's fixtures from disk, as `vp dev` does: the records in `.fixtures/`, then the synthetic responses in
 * `fixtures/`, each folder's files in the order of their names, every file checked as a fixture record and against the
 * app's `openapi.json`. Each problem is one `ERROR` line that ends with its fix. */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import { fixtureFolders, fixtureProblem, loadFixtureFiles } from "#fixtures/load.ts";
import type { FixtureSource, LoadedFixture } from "#fixtures/record.ts";

import { documentProblems, operationsOf } from "./fixture-document.ts";
import { ignored } from "./installed.ts";
import { documentFile } from "./orval-options.ts";
import { TaskError } from "./shot-options.ts";

interface ReadFixtures {
  readonly records: readonly LoadedFixture[];
  readonly fixtures: readonly LoadedFixture[];
  readonly problems: readonly string[];
}

/** Each `.json` file in `folder`, at any depth, by its name from the app's root, with `/` between its parts. */
function jsonFiles(root: string, folder: string): string[] {
  const directory = path.join(root, folder);
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { encoding: "utf8", recursive: true })
    .filter((name) => name.endsWith(".json"))
    .map((name) => [folder, ...name.split(path.sep)].join("/"));
}

/** The fixtures of `source` in the app at `root`, and what is wrong with any of them. */
function readSource(
  root: string,
  source: FixtureSource,
): { readonly fixtures: readonly LoadedFixture[]; readonly problems: readonly string[] } {
  const parsed: Record<string, unknown> = {};
  const unreadable: string[] = [];
  for (const file of jsonFiles(root, fixtureFolders[source])) {
    try {
      parsed[file] = JSON.parse(readFileSync(path.join(root, file), "utf8"));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      unreadable.push(fixtureProblem(source, file, `is not JSON (${reason})`));
    }
  }
  const loaded = loadFixtureFiles(source, parsed);
  return { fixtures: loaded.fixtures, problems: [...unreadable, ...loaded.problems] };
}

/** A file's JSON, or `undefined` when it holds none. */
function readJson(file: string): unknown {
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    return value;
  } catch {
    return undefined;
  }
}

/** What is wrong with the fixtures by the app's `openapi.json`, if it has one. */
function problemsByDocument(root: string, fixtures: readonly LoadedFixture[]): string[] {
  const file = path.join(root, documentFile);
  if (!existsSync(file)) {
    return [];
  }
  const operations = operationsOf(readJson(file));
  if (operations === undefined) {
    return [
      `ERROR ${documentFile} is not an OpenAPI document, so no fixture can be checked against it: copy the API's document again with vp run client-pull.`,
    ];
  }
  return fixtures.flatMap((fixture) => documentProblems(fixture, operations));
}

/** The app's fixtures, records first unless `records` is false, and every problem with them. */
function readFixtures(
  root: string,
  { records = true }: { readonly records?: boolean } = {},
): ReadFixtures {
  const exported = records ? readSource(root, "record") : { fixtures: [], problems: [] };
  const synthetic = readSource(root, "fixture");
  return {
    fixtures: synthetic.fixtures,
    problems: [
      ...exported.problems,
      ...synthetic.problems,
      ...problemsByDocument(root, [...exported.fixtures, ...synthetic.fixtures]),
    ],
    records: exported.fixtures,
  };
}

/** `vp run verify`'s check of the fixtures in git, `fixtures/`, as `vp dev` checks them, so one that a newer
 * `openapi.json` has left behind fails the push rather than only the next `vp dev`. The records in `.fixtures/`, which
 * git ignores and each desktop holds its own of, are `vp dev`'s to check. */
async function checkFixtures(root: string, args: readonly string[]): Promise<string> {
  if (args.length > 0) {
    throw new TaskError(
      "ERROR the fixture check takes no arguments: run it as vp run verify does, with none.",
    );
  }
  const { fixtures, problems } = readFixtures(root, { records: false });
  if (problems.length > 0) {
    throw new TaskError(problems.join("\n"));
  }
  const counted =
    fixtures.length === 1
      ? "The 1 fixture in fixtures/ is a record"
      : `The ${String(fixtures.length)} fixtures in fixtures/ are records`;
  const document = await stat(path.join(root, documentFile)).catch(ignored);
  return document === null
    ? `${counted} in the fixture format; this app has no ${documentFile} to check them against.`
    : `${counted} ${documentFile} answers.`;
}

export { checkFixtures, readFixtures };
export type { ReadFixtures };
