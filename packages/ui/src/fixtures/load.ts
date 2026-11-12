/* A set of fixture files read as fixture mode reads them: each parsed as a fixture record, in the order of their
 * names, with one `ERROR` line for each thing wrong with one, ending with its fix. The dev server reads the files from
 * disk (src/preset/fixture-mode.ts); a test can hand over what `import.meta.glob` found. */

import type { z } from "zod";

import { holdsJwt } from "./record-text.ts";
import { fixtureRecordSchema } from "./record.ts";
import type { FixtureRecord, FixtureSource, LoadedFixture } from "./record.ts";

/** A member's place in a record, as a reader finds it: `response.body[2].year_days`. */
function placeOf(path: readonly PropertyKey[]): string {
  return path
    .map((key, index) => {
      if (typeof key === "number") {
        return `[${String(key)}]`;
      }
      return index === 0 ? String(key) : `.${String(key)}`;
    })
    .join("");
}

/** Whether a union member's issues say only that the value is another kind of thing, as a string member says of an
 * object. */
function wrongKind(issues: readonly z.core.$ZodIssue[]): boolean {
  return issues.every((issue) => issue.code === "invalid_type" && issue.path.length === 0);
}

/** Which of two union members' issues come closer: one of the value's kind, then the one with fewer. */
function closer(left: readonly z.core.$ZodIssue[], right: readonly z.core.$ZodIssue[]): number {
  return Number(wrongKind(left)) - Number(wrongKind(right)) || left.length - right.length;
}

/** Each issue as `place: message`. A union's issues are those of the member that came closest: of the members of the
 * value's kind, the one with the fewest, so a response with a wrong status says so rather than that it matches none of
 * its three forms, and an object with a wrong key says so rather than that it is no string; a record key's are those
 * of the key, at the key's place, or the object's when the key holds a JWT. */
function issueLines(
  issues: readonly z.core.$ZodIssue[],
  prefix: readonly PropertyKey[] = [],
): string[] {
  return issues.flatMap((issue) => {
    const path = [...prefix, ...issue.path];
    if (issue.code === "invalid_union" && issue.errors.length > 0) {
      const [closest = []] = issue.errors.toSorted(closer);
      return issueLines(closest, path);
    }
    if (issue.code === "invalid_key") {
      // A key that holds a token is named by the object it is in, so the line does not repeat the token.
      const key = String(path.at(-1));
      return issueLines(issue.issues, holdsJwt(key) ? path.slice(0, -1) : path);
    }
    const place = placeOf(path);
    return [place === "" ? issue.message : `${place}: ${issue.message}`];
  });
}

/** `value` as a fixture record, or what is wrong with it, one line an issue. */
function parseFixtureRecord(
  value: unknown,
): { readonly record: FixtureRecord } | { readonly problems: readonly string[] } {
  const parsed = fixtureRecordSchema.safeParse(value);
  return parsed.success ? { record: parsed.data } : { problems: issueLines(parsed.error.issues) };
}

/** The folder each source's files are in, under the app's root. */
const folders: Readonly<Record<FixtureSource, string>> = {
  fixture: "fixtures",
  record: ".fixtures",
};

/** What fixes a file of each source: a synthetic response is the app's to correct; a record is basis's to write. */
const fixes: Readonly<Record<FixtureSource, string>> = {
  fixture:
    "correct it by the record format in @basis/ui's README, under Running the app in fixture mode, or delete it",
  record:
    "export the record again with basis records export from the API this app's openapi.json came from, or delete it",
};

/** One failure, as every basis-ui failure is written: `ERROR`, the file, the reason, then the fix. */
function fixtureProblem(source: FixtureSource, file: string, reason: string): string {
  return `ERROR ${file}: ${reason}; ${fixes[source]}.`;
}

interface LoadedFixtures {
  readonly fixtures: readonly LoadedFixture[];
  readonly problems: readonly string[];
}

/** `files`, each file's name from the app's root and its parsed JSON, as fixtures of `source`, in the order of their
 * names, which is the order fixture mode tries them in. */
function loadFixtureFiles(
  source: FixtureSource,
  files: Readonly<Record<string, unknown>>,
): LoadedFixtures {
  const names = Object.keys(files).toSorted();
  const results = names.map((file) => ({ file, parsed: parseFixtureRecord(files[file]) }));
  return {
    fixtures: results.flatMap(({ file, parsed }) =>
      "record" in parsed ? [{ file, record: parsed.record, source }] : [],
    ),
    problems: results.flatMap(({ file, parsed }) =>
      "problems" in parsed
        ? parsed.problems.map((problem) => fixtureProblem(source, file, problem))
        : [],
    ),
  };
}

export { fixtureProblem, folders as fixtureFolders, loadFixtureFiles, parseFixtureRecord };
export type { LoadedFixtures };
