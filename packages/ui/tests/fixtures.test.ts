/* The fixture record format and fixture mode's handler, without a browser: what a record may hold, how a set of files
 * loads, and in which order the handler answers. MSW's core runs in Node, so the handler is asked directly; the
 * example app proves the same in Chromium, through its service worker and its pages. */

import { readFileSync } from "node:fs";

import { getResponse, http, HttpResponse } from "msw";
import { describe, expect, test } from "vite-plus/test";

import { fixtureHandlers } from "#fixtures/handlers.ts";
import { loadFixtureFiles, parseFixtureRecord } from "#fixtures/load.ts";
import { fixtureRecordJsonSchema } from "#fixtures/record.ts";
import type { LoadedFixture } from "#fixtures/record.ts";
import type { Telemetry } from "#shell/telemetry.ts";

const committedSchema: unknown = JSON.parse(
  readFileSync(new URL("../schema/fixture-record.schema.json", import.meta.url), "utf8"),
);

/** A JWT's shape, as a bearer token has it. */
const token =
  "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZXYtdXNlciJ9.c2lnbmF0dXJlLW9mLXRoZS10b2tlbg";

/** A record of `GET /conventions`, changed by `changes` at the top level. */
function conventionsRecord(changes: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: "basis-ui-fixture/1",
    operation_id: "conventions",
    recorded_at: "2026-11-06T14:30:00Z",
    request: { method: "GET", path: "/conventions", query: {} },
    response: {
      body: [{ convention: "ACT/360", year_days: 360 }],
      headers: { "x-request-id": "019a5c3e-0000-7000-8000-000000000001" },
      media_type: "application/json",
      status: 200,
    },
    ...changes,
  };
}

/** What is wrong with `value` as a record, or `[]`. */
function problemsOf(value: unknown): readonly string[] {
  const parsed = parseFixtureRecord(value);
  return "problems" in parsed ? parsed.problems : [];
}

describe("the fixture record format", () => {
  test("the committed JSON Schema is what the format produces (run vp run @basis/ui#fixture-schema after changing it)", () => {
    expect(committedSchema).toStrictEqual(fixtureRecordJsonSchema());
  });

  test("a response holds a JSON body, other bytes in base64 with their media type, or no body", () => {
    expect(problemsOf(conventionsRecord())).toStrictEqual([]);
    const arrow = {
      body_base64: "QVJST1cxAAA=",
      media_type: "application/vnd.apache.arrow.stream",
      status: 200,
    };
    expect(problemsOf(conventionsRecord({ response: arrow }))).toStrictEqual([]);
    expect(problemsOf(conventionsRecord({ response: { status: 204 } }))).toStrictEqual([]);
  });

  test("never holds the bearer token: no request headers, no credential headers, and no JWT in any string", () => {
    const request = { method: "GET", path: "/conventions" };
    expect(
      problemsOf(conventionsRecord({ request: { ...request, headers: { authorization: token } } })),
    ).toStrictEqual(['request: Unrecognized key: "headers"']);
    for (const name of ["authorization", "cookie", "set-cookie"]) {
      const response = { headers: { [name]: "anything" }, status: 204 };
      expect(problemsOf(conventionsRecord({ response }))[0]).toMatch(
        new RegExp(
          `^response\\.headers\\.${name}: is a header's name in lower case, and none of`,
          "u",
        ),
      );
    }
    const inBody = { ...request, body: { legs: [{ note: `Bearer ${token}` }] } };
    expect(problemsOf(conventionsRecord({ request: inBody }))).toStrictEqual([
      "request.body.legs[0].note: holds a JWT, which a record never does: remove the token",
    ]);
    const inQuery = { ...request, query: { access_token: [token] } };
    expect(problemsOf(conventionsRecord({ request: inQuery }))).toStrictEqual([
      "request.query.access_token[0]: holds a JWT, which a record never does: remove the token",
    ]);
  });

  test("names the member at fault, and the fix where there is one", () => {
    const response = (changes: Record<string, unknown>): Record<string, unknown> =>
      conventionsRecord({
        response: { body: [], media_type: "application/json", status: 200, ...changes },
      });
    expect(problemsOf(response({ status: "200" }))).toStrictEqual([
      "response.status: is a status a body can come with, from 200 to 599 but for 204, 205 and 304, which have none",
    ]);
    expect(problemsOf(response({ media_type: "text/csv" }))[0]).toMatch(
      /^response\.media_type: is a JSON media type, .* give other bytes as body_base64$/u,
    );
    expect(problemsOf(conventionsRecord({ format: "basis-ui-fixture/2" }))).toStrictEqual([
      'format: is "basis-ui-fixture/1", the only format this @basis/ui reads',
    ]);
    const withQuery = { method: "GET", path: "/conventions?all=true" };
    expect(problemsOf(conventionsRecord({ request: withQuery }))[0]).toMatch(
      /^request\.path: starts with \/ and holds no \? or #/u,
    );
    expect(problemsOf(conventionsRecord({ recorded_at: "2026-11-06T14:30:00" }))).toHaveLength(1);
  });
});

describe(loadFixtureFiles, () => {
  test("loads files in the order of their names, and writes an ERROR line with the source's fix for each problem", () => {
    const loaded = loadFixtureFiles("record", {
      ".fixtures/b.json": conventionsRecord({ operation_id: "b" }),
      ".fixtures/a.json": conventionsRecord({ operation_id: "a" }),
      ".fixtures/c.json": conventionsRecord({ response: { status: 99 } }),
    });
    expect(loaded.fixtures.map(({ file, source }) => `${source} ${file}`)).toStrictEqual([
      "record .fixtures/a.json",
      "record .fixtures/b.json",
    ]);
    expect(loaded.problems).toStrictEqual([
      "ERROR .fixtures/c.json: response.status: is an HTTP status a response can have, an integer from 200 to 599; export the record again with basis records export from the API this app's openapi.json came from, or delete it.",
    ]);
    const synthetic = loadFixtureFiles("fixture", { "fixtures/c.json": {} });
    expect(synthetic.problems[0]).toMatch(
      /; correct it by the record format in @basis\/ui's README, under Running the app in fixture mode, or delete it\.$/u,
    );
  });
});

/** Fixtures of `source` from `records`, each named by its index. */
function fixturesOf(
  source: "fixture" | "record",
  ...records: Record<string, unknown>[]
): readonly LoadedFixture[] {
  const folder = source === "record" ? ".fixtures" : "fixtures";
  const files = Object.fromEntries(
    records.map((record, index) => [`${folder}/${String(index)}.json`, record]),
  );
  const { fixtures, problems } = loadFixtureFiles(source, files);
  expect(problems).toStrictEqual([]);
  return fixtures;
}

/** What answered a request, as fixture mode reports it. */
interface Answer {
  readonly source: unknown;
  readonly file: unknown;
  readonly status: number;
  readonly body: unknown;
}

/** The answer fixture mode's handler gives `request`, and what it reported, from the sources given. */
async function answer(
  request: Request,
  sources: {
    readonly records?: readonly LoadedFixture[];
    readonly fixtures?: readonly LoadedFixture[];
  },
): Promise<Answer> {
  const reports: Record<string, unknown>[] = [];
  const telemetry: Telemetry = {
    error: (error) => {
      reports.push({ error });
    },
    event: (_name, attributes = {}) => {
      reports.push(attributes);
    },
    timing: (name) => {
      reports.push({ name });
    },
  };
  const generated = [
    http.get("*/conventions", () => HttpResponse.json([{ convention: "30/360", year_days: 360 }])),
  ];
  const handlers = fixtureHandlers({
    fixtures: sources.fixtures ?? [],
    generated,
    records: sources.records ?? [],
    telemetry,
  });
  const response = await getResponse(handlers, request);
  const [report = {}] = reports;
  const text = (await response?.text()) ?? "";
  return {
    body: text === "" ? undefined : JSON.parse(text),
    file: report["file"],
    source: report["source"],
    status: response?.status ?? 0,
  };
}

describe(fixtureHandlers, () => {
  const conventions = new Request("http://localhost:20000/api/conventions");
  const record = conventionsRecord();
  const fixture = conventionsRecord({
    response: { body: [], media_type: "application/json", status: 200 },
  });

  test("answers from a record, then a committed fixture, then orval's generated handlers", async () => {
    const records = fixturesOf("record", record);
    const fixtures = fixturesOf("fixture", fixture);
    expect(await answer(conventions, { fixtures, records })).toMatchObject({
      file: ".fixtures/0.json",
      source: "record",
    });
    expect(await answer(conventions, { fixtures })).toMatchObject({
      body: [],
      file: "fixtures/0.json",
      source: "fixture",
    });
    expect(await answer(conventions, {})).toStrictEqual({
      body: [{ convention: "30/360", year_days: 360 }],
      file: undefined,
      source: "generated",
      status: 200,
    });
  });

  test("matches the method, the path without /api and every query value in order, but not the body", async () => {
    const request = { method: "GET", path: "/bonds/US 1", query: { security: ["A", "B"] } };
    const records = fixturesOf("record", conventionsRecord({ request }));
    const asked = async (url: string, method = "GET"): Promise<unknown> => {
      const answered = await answer(new Request(`http://localhost:20000${url}`, { method }), {
        records,
      });
      return answered.source;
    };
    expect(await asked("/api/bonds/US%201?security=A&security=B")).toBe("record");
    expect(await asked("/api/bonds/US%201?security=B&security=A")).toBe("none");
    expect(await asked("/api/bonds/US%201?security=A")).toBe("none");
    expect(await asked("/api/bonds/US%201?security=A&security=B&page=2")).toBe("none");
    expect(await asked("/api/bonds/US%201?security=A&security=B", "DELETE")).toBe("none");
    expect(await asked("/bonds/US%201?security=A&security=B")).toBeUndefined();
  });

  test("serves a record's headers and media type, and its base64 body as the bytes it holds", async () => {
    const response = {
      body_base64: "AAEC/w==",
      headers: { vary: "Accept" },
      media_type: "application/vnd.apache.arrow.stream",
      status: 200,
    };
    const records = fixturesOf("record", conventionsRecord({ response }));
    const handlers = fixtureHandlers({ fixtures: [], generated: [], records });
    const served = await getResponse(handlers, conventions);
    expect(served?.headers.get("content-type")).toBe("application/vnd.apache.arrow.stream");
    expect(served?.headers.get("vary")).toBe("Accept");
    expect(new Uint8Array((await served?.arrayBuffer()) ?? new ArrayBuffer(0))).toStrictEqual(
      new Uint8Array([0, 1, 2, 255]),
    );
  });

  test("answers what nothing holds, and Arrow no fixture holds, with a problem that says what to add", async () => {
    const unknown = await answer(new Request("http://localhost:20000/api/trades"), {});
    expect(unknown).toMatchObject({
      body: { type: "fixture-missing" },
      source: "none",
      status: 501,
    });
    expect(JSON.stringify(unknown.body)).toMatch(
      /"detail":"No fixture or generated handler answers GET \/trades: /u,
    );
    const arrow = new Request("http://localhost:20000/api/conventions", {
      headers: { accept: "application/vnd.apache.arrow.stream" },
    });
    const missing = await answer(arrow, {});
    expect(missing).toMatchObject({ source: "none", status: 501 });
    expect(JSON.stringify(missing.body)).toMatch(
      /asks for Arrow, which orval's generated handlers cannot make/u,
    );
  });
});
