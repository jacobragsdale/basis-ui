/* `vp run verify`'s check of the fixtures in git, run as the preset runs it: Node on src/preset/tasks.ts, in an
 * app's root, here a temporary one holding basis's sample document. */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { makeApp, record, removeApp, writeIn } from "./fixture-app.ts";

const script = fileURLToPath(new URL("../src/preset/tasks.ts", import.meta.url));

let app = "";

/** The fixture check's exit status and output in the app. */
function checkFixtures(): {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
} {
  const { status, stdout, stderr } = spawnSync(process.execPath, [script, "fixtures"], {
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
});
