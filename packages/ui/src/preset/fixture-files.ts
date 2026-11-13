/* Reading an app's fixtures from disk, as `vp dev` does: the records in `.fixtures/`, then the synthetic responses in
 * `fixtures/`, each folder's files in the order of their names, every file checked as a fixture record and against the
 * app's `openapi.json`. Each problem is one `ERROR` line that ends with its fix. */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import { fixtureFolders, fixtureProblem, loadFixtureFiles } from "#fixtures/load.ts";
import { bodyFileOf } from "#fixtures/record.ts";
import type { FixtureRecord, FixtureSource, LoadedFixture } from "#fixtures/record.ts";

import { documentProblems, operationsOf, pathParameters } from "./fixture-document.ts";
import type { FixtureRequest, NewFixture } from "./fixture-new.ts";
import { ignored } from "./installed.ts";
import { documentFile } from "./orval-options.ts";
import { TaskError } from "./task-error.ts";

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

/** A line for each fixture whose `body_file` is not on disk. */
function missingBodyFiles(root: string, fixtures: readonly LoadedFixture[]): string[] {
  return fixtures.flatMap((fixture) => {
    const file = bodyFileOf(fixture);
    return file === undefined || existsSync(path.join(root, file))
      ? []
      : [
          `ERROR ${fixture.file}: its body_file names ${file}, which does not exist: write it, as the app's own task for its data says, or correct body_file.`,
        ];
  });
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
  return {
    fixtures: loaded.fixtures,
    problems: [...unreadable, ...loaded.problems, ...missingBodyFiles(root, loaded.fixtures)],
  };
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

/** The values each fixture's path gives its operation's path parameters, by the fixture's file, from the app's
 * `openapi.json`, so `checkRoutes` can open a route whose parameter shares a name with one. */
function fixtureParameters(
  root: string,
  fixtures: readonly LoadedFixture[],
): Readonly<Record<string, Readonly<Record<string, string>>>> {
  const file = path.join(root, documentFile);
  const operations = existsSync(file) ? operationsOf(readJson(file)) : undefined;
  if (operations === undefined) {
    return {};
  }
  return Object.fromEntries(
    fixtures.map((fixture) => [fixture.file, pathParameters(fixture, operations)]),
  );
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

/** A fixture `fixtures/` holds, in the form a new one is written in. */
function asNewFixture(record: FixtureRecord): NewFixture {
  const { method, path: asked, query, body } = record.request;
  return {
    ...record,
    request: {
      method,
      path: asked,
      ...(query === undefined ? {} : { query }),
      ...(body === undefined ? {} : { body }),
    },
    response: { ...record.response },
  };
}

/** The other fixtures in `fixtures/` that answer `request`, in the order of their names, the first of which answers
 * it, with their files. */
function answering(
  root: string,
  request: FixtureRequest,
  file: string,
): readonly { readonly file: string; readonly fixture: NewFixture }[] {
  const key = JSON.stringify([request.method, request.path, request.query ?? {}]);
  return readFixtures(root, { records: false })
    .fixtures.filter(({ record, file: other }) => {
      const asked = record.request;
      return (
        other !== file && JSON.stringify([asked.method, asked.path, asked.query ?? {}]) === key
      );
    })
    .map(({ file: other, record }) => ({ file: other, fixture: asNewFixture(record) }));
}

/** The other fixtures in `fixtures/` that answer the same request as `fixture`, which the first by name answers. */
function sameRequest(root: string, fixture: NewFixture, file: string): string[] {
  return answering(root, fixture.request, file).map(({ file: other }) => other);
}

export { answering, checkFixtures, fixtureParameters, readFixtures, sameRequest };
export type { ReadFixtures };
