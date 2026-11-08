/* Fixture mode in the example's tests, as `vp dev` runs it: MSW's service worker answering /api from records, as a
 * test gives them for .fixtures/, then the synthetic responses committed in fixtures/, read as the dev server reads
 * them, then orval's generated handlers. .fixtures/ is git-ignored and differs from one desktop to the next, so no
 * test reads it. */

import type { Telemetry } from "@basis/ui";
import { fixtureHandlers, loadFixtureFiles } from "@basis/ui/fixtures";

import { getAccrualsMock } from "#api/mocks.ts";
import { worker } from "#test-support.tsx";

/** The fixtures committed in fixtures/, named from the app's root as the dev server names them. */
const committedFiles = import.meta.glob<unknown>("../fixtures/**/*.json", {
  eager: true,
  import: "default",
});
const committed = loadFixtureFiles(
  "fixture",
  Object.fromEntries(
    Object.entries(committedFiles).map(([file, value]) => [file.replace(/^\.\.\//u, ""), value]),
  ),
);

/** What fixture mode said answered a request. */
type Answer = Readonly<Record<string, unknown>>;

/** Starts fixture mode in the test's service worker, with `records` as .fixtures/ would hold them, and returns what it
 * reports answering. */
function fixtureMode(records: Readonly<Record<string, unknown>> = {}): readonly Answer[] {
  const exported = loadFixtureFiles("record", records);
  if (exported.problems.length > 0) {
    throw new Error(exported.problems.join("\n"));
  }
  const answers: Answer[] = [];
  const telemetry: Telemetry = {
    error: (error) => {
      answers.push({ error });
    },
    event: (name, attributes = {}) => {
      if (name === "fixture.answered") {
        answers.push(attributes);
      }
    },
    timing: (name) => {
      answers.push({ timing: name });
    },
  };
  const handlers = fixtureHandlers({
    fixtures: committed.fixtures,
    generated: getAccrualsMock(),
    records: exported.fixtures,
    telemetry,
  });
  worker.use(...handlers);
  return answers;
}

/** What a test's record asks: a `GET` of `path` with `query`, none by default. */
interface Asked {
  readonly path: string;
  readonly query?: Readonly<Record<string, readonly string[]>>;
}

/** A record of the sample API's `operation`, asked as `asked` says, answered with `response`. */
function record(
  operation: string,
  { path, query = {} }: Asked,
  response: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    format: "basis-ui-fixture/1",
    operation_id: operation,
    recorded_at: "2026-11-06T14:30:00Z",
    request: { method: "GET", path, query },
    response,
  };
}

/** A JSON answer of `body`, as basis gives one, with the request's id. */
function json(body: unknown): Readonly<Record<string, unknown>> {
  return {
    body,
    headers: { "x-request-id": "019a5c3e-0000-7000-8000-000000000001" },
    media_type: "application/json",
    status: 200,
  };
}

export { fixtureMode, json, record };
export type { Answer, Asked };
