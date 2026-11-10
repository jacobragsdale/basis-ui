/* `vp run verify`'s check of the fixtures in git, run as the preset runs it: Node on src/preset/tasks.ts, in an
 * app's root, here a temporary one holding basis's sample document. */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { makeApp, record, removeApp, writeIn } from "./fixture-app.ts";

const script = fileURLToPath(new URL("../src/preset/tasks.ts", import.meta.url));

let app = "";

/** The fixture check's exit status and output in the app. */
function checkFixtures(...args: string[]): {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
} {
  const { status, stdout, stderr } = spawnSync(process.execPath, [script, "fixtures", ...args], {
    cwd: app,
    encoding: "utf8",
  });
  return { status, stderr, stdout };
}

beforeEach(() => {
  app = makeApp({ "fixtures/conventions.json": record("conventions", "GET /conventions") });
});

afterEach(() => {
  removeApp(app);
});

describe("vp run verify's fixture check", () => {
  test("passes the fixtures openapi.json answers", () => {
    expect(checkFixtures()).toStrictEqual({
      status: 0,
      stderr: "",
      stdout: "The 1 fixture in fixtures/ is a record openapi.json answers.\n",
    });
  });

  test("fails one the document has left behind, with its line, and leaves the records to vp dev", () => {
    writeIn(app, "fixtures/retired.json", record("retired", "GET /retired"));
    writeIn(app, ".fixtures/also-retired.json", record("also_retired", "GET /also-retired"));
    const check = checkFixtures();
    expect(check.status).toBe(1);
    expect(check.stderr).toMatch(/^ERROR fixtures\/retired\.json: .+\.\n$/u);
  });

  test("is vp run fixtures check too", () => {
    expect(checkFixtures("check").stdout).toBe(
      "The 1 fixture in fixtures/ is a record openapi.json answers.\n",
    );
  });

  test("fails a body the operation's schema does not accept, naming each field at fault", () => {
    writeIn(
      app,
      "fixtures/conventions-wrong.json",
      record("conventions", "GET /conventions", {
        body: [{ convention: "ACT/ACT", year_days: 365 }],
        media_type: "application/json",
        status: 200,
      }),
    );
    expect(checkFixtures("check")).toStrictEqual({
      status: 1,
      stderr:
        'ERROR fixtures/conventions-wrong.json: response.body is not what operation conventions answers 200 with in openapi.json: 0.convention: Invalid option: expected one of "30/360"|"ACT/360"|"ACT/365F"; correct the body, or replace the file with one vp run fixtures new conventions --status 200 writes.\n',
      stdout: "",
    });
  });
});
