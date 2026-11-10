/* The headers fixture mode names each answer's source and file in, which `vp run shot` writes into NAME.network.txt:
 * a record, a fixture, orval's generated handlers, or nothing. */

import { getResponse, http, HttpResponse } from "msw";
import { describe, expect, test } from "vite-plus/test";

import { fileHeader, sourceHeader } from "#fixtures/answered-by.ts";
import { fixtureHandlers } from "#fixtures/handlers.ts";
import { loadFixtureFiles } from "#fixtures/load.ts";
import type { FixtureSource, LoadedFixture } from "#fixtures/record.ts";
import type { Telemetry } from "#shell/telemetry.ts";

/** A record of `GET /conventions` as the file `file` of `source`. */
function conventions(source: FixtureSource, file: string): readonly LoadedFixture[] {
  const record = {
    format: "basis-ui-fixture/1",
    operation_id: "conventions",
    recorded_at: "2026-11-06T14:30:00Z",
    request: { method: "GET", path: "/conventions", query: {} },
    response: { body: [], media_type: "application/json", status: 200 },
  };
  return loadFixtureFiles(source, { [file]: record }).fixtures;
}

/** Where the handlers report, which these tests do not read. */
const reports: unknown[] = [];
const silent: Telemetry = {
  error: (error) => {
    reports.push(error);
  },
  event: (name) => {
    reports.push(name);
  },
  timing: (name) => {
    reports.push(name);
  },
};

/** The source and file fixture mode names on its answer to `GET url`, given `records`. */
async function named(
  url: string,
  records: readonly LoadedFixture[] = [],
): Promise<readonly (string | null)[]> {
  const handlers = fixtureHandlers({
    fixtures: conventions("fixture", "fixtures/conventions.json"),
    generated: [http.get("*/trades", () => HttpResponse.json([]))],
    records,
    telemetry: silent,
  });
  const served = await getResponse(handlers, new Request(`http://localhost:20000${url}`));
  return [served?.headers.get(sourceHeader) ?? null, served?.headers.get(fileHeader) ?? null];
}

describe(fixtureHandlers, () => {
  test("names each answer's source, and the file of a record or a fixture", async () => {
    expect(
      await named("/api/conventions", conventions("record", ".fixtures/conventions.json")),
    ).toStrictEqual(["record", ".fixtures/conventions.json"]);
    expect(await named("/api/conventions")).toStrictEqual(["fixture", "fixtures/conventions.json"]);
    expect(await named("/api/trades")).toStrictEqual(["generated", null]);
    expect(await named("/api/positions")).toStrictEqual(["none", null]);
  });
});
