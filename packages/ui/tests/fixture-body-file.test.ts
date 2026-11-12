/* A fixture whose body is a file beside it, `body_file`, as fixture mode's handler answers it: streamed, with its
 * length, or the problem that says the file cannot be read. */

import { getResponse } from "msw";
import { describe, expect, test } from "vite-plus/test";

import { fixtureHandlers } from "#fixtures/handlers.ts";
import { loadFixtureFiles } from "#fixtures/load.ts";

/** A body file nothing can read. */
async function noFile(): Promise<Response> {
  return Promise.resolve(new Response(null, { status: 404 }));
}

/** A record of the conventions whose body is a file beside it. */
const { fixtures: inFile } = loadFixtureFiles("record", {
  ".fixtures/conventions.json": {
    format: "basis-ui-fixture/1",
    operation_id: "conventions",
    recorded_at: "2026-11-06T14:30:00Z",
    request: { method: "GET", path: "/conventions" },
    response: {
      body_file: "data/conventions.arrows",
      media_type: "application/vnd.apache.arrow.stream",
      status: 200,
    },
  },
});

const conventions = new Request("http://localhost:20000/api/conventions");

describe("a body in a file", () => {
  test("streams a body file, by its path from the app's root, with its length", async () => {
    const asked: string[] = [];
    const bodyFiles = async (file: string): Promise<Response> => {
      asked.push(file);
      return Promise.resolve(
        new Response(new Uint8Array([7, 8, 9]), { headers: { "content-length": "3" } }),
      );
    };
    const handlers = fixtureHandlers({ bodyFiles, fixtures: [], generated: [], records: inFile });
    const served = await getResponse(handlers, conventions);
    expect(asked).toStrictEqual([".fixtures/data/conventions.arrows"]);
    expect(served?.headers.get("content-type")).toBe("application/vnd.apache.arrow.stream");
    expect(served?.headers.get("content-length")).toBe("3");
    expect(new Uint8Array((await served?.arrayBuffer()) ?? new ArrayBuffer(0))).toStrictEqual(
      new Uint8Array([7, 8, 9]),
    );
  });

  test("says when a body file cannot be read", async () => {
    const handlers = fixtureHandlers({
      bodyFiles: noFile,
      fixtures: [],
      generated: [],
      records: inFile,
    });
    const missing = await getResponse(handlers, conventions);
    expect(missing?.status).toBe(501);
    expect(JSON.stringify(await missing?.json())).toMatch(
      /answers with the body file \.fixtures\/data\/conventions\.arrows, which could not be read \(answered 404\)/u,
    );
  });
});
