/* A fixture whose body is a file beside it, `body_file`, as fixture mode's handler answers it: streamed, with its
 * length, or the problem that says the file cannot be read. */

import path from "node:path";

import { getResponse } from "msw";
import { describe, expect, test } from "vite-plus/test";

import { fixtureHandlers } from "#fixtures/handlers.ts";
import { loadFixtureFiles } from "#fixtures/load.ts";
import { bodyFileAsked } from "#preset/fixture-bodies.ts";

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

/* What `vp dev` streams under `__basis/fixture-body/`: a file inside one of the two fixture folders, decided by the
 * path it resolves to, so that no encoding of a separator or of `..` reaches a file outside, on Windows as on Linux. */
/** The URL under `__basis/fixture-body/` that asks for `file`, as the middleware is given it. */
function at(file: string): string {
  return `/${file}`;
}

describe("the body file a request asks for", () => {
  const posixRoot = "/home/dev/app";
  const windowsRoot = String.raw`C:\Users\dev\app`;

  test.each([
    ["fixtures/data/trades.arrows", "/home/dev/app/fixtures/data/trades.arrows"],
    [".fixtures/data/trades.arrows", "/home/dev/app/.fixtures/data/trades.arrows"],
    ["fixtures/data/a%20b.arrows", "/home/dev/app/fixtures/data/a b.arrows"],
  ])("serves %s", (file, resolved) => {
    expect(bodyFileAsked(posixRoot, at(file), path.posix)).toBe(resolved);
  });

  test.each([
    "fixtures/..%2F..%2F..%2F..%2Fetc%2Fpasswd",
    "fixtures/%2E%2E/%2E%2E/.env",
    "fixtures/%2e%2e%2f.env",
    "fixtures/data/..%2F..%2F.git%2Fconfig",
    "fixtures/..%5C..%5C.env",
    "fixtures",
    "fixtures/",
    "index.html",
    "src/main.tsx",
    "fixtures/%E0%A4%A",
  ])("refuses %s, which is not a file inside a fixture folder", (file) => {
    expect(bodyFileAsked(posixRoot, at(file), path.posix)).toBeUndefined();
  });

  test.each([
    "fixtures/..%5C..%5C..%5CWindows%5Cwin.ini",
    "fixtures/..%2F..%2F.env",
    "fixtures/%2E%2E/.env",
    "fixtures/C:%5CWindows%5Cwin.ini",
    "fixtures/D:/secret.txt",
    "fixtures/%2E%2E/%2E%2E/.env",
  ])("refuses %s on Windows, whose separators are both slashes", (file) => {
    expect(bodyFileAsked(windowsRoot, at(file), path.win32)).toBeUndefined();
  });

  test("serves a file inside a fixture folder on Windows", () => {
    expect(bodyFileAsked(windowsRoot, at("fixtures/data/trades.arrows"), path.win32)).toBe(
      String.raw`C:\Users\dev\app\fixtures\data\trades.arrows`,
    );
  });
});
