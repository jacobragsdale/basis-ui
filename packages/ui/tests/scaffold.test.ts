/* `vp run new` and `vp run fixtures new` on an app, run as the preset runs them: Node on src/preset/tasks.ts in the
 * app's root, a copy of packages/example with its node_modules linked in. A table, a page and a form are scaffolded
 * into it, and a 404's fixture written, and then the app's own checks pass on what they wrote, as written: its
 * fixtures, its lint and formatting, its types, and its tests, in a Node DOM, as on a machine with no browser. */

import { spawn } from "node:child_process";
import { once } from "node:events";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { text as textOf } from "node:stream/consumers";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";

import { example } from "./fixture-app.ts";

/* Each test here starts Node on a task, the compiler, a build, a browser or vp, which a busy CI runner can make take
 * many seconds: a minute holds there, where Vitest's 5 s did not, and a test that hangs still fails. */
vi.setConfig({ testTimeout: 60_000 });

const script = fileURLToPath(new URL("../src/preset/tasks.ts", import.meta.url));

/** What the app's checks take at most, on a machine running the other test files. */
const appTimeout = 240_000;

/** The environment without git's variables, which a commit hook sets, or Vitest's, which would reach the app's own. */
const environment = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !name.startsWith("GIT_") && !name.startsWith("VITEST") && name !== "NODE_ENV",
    ),
  ),
  BASIS_TEST_DOM: "node",
};

interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** The framework tasks' script on `args` in `root`, without blocking the other test files. */
async function runIn(root: string, ...args: string[]): Promise<Run> {
  const child = spawn(process.execPath, [script, ...args], { cwd: root, env: environment });
  const [stdout, stderr, closed] = await Promise.all([
    textOf(child.stdout),
    textOf(child.stderr),
    once(child, "close"),
  ]);
  const status: unknown = closed[0];
  return { status: typeof status === "number" ? status : null, stderr, stdout };
}

const leftBehind = new Set(["node_modules", "dist", ".fixtures", ".shots", "test-results"]);

let app = "";
const runs: Run[] = [];

beforeAll(async () => {
  app = mkdtempSync(path.join(tmpdir(), "basis-ui-scaffold-app-"));
  cpSync(example, app, {
    filter: (source) => !leftBehind.has(path.relative(example, source).split(path.sep)[0] ?? ""),
    recursive: true,
  });
  symlinkSync(path.join(example, "node_modules"), path.join(app, "node_modules"), "junction");
  runs.push(
    await runIn(app, "new", "table", "positions", "--operation", "conventions"),
    await runIn(app, "new", "page", "bond-terms", "--operation", "bond"),
    await runIn(app, "new", "form", "new-settlement", "--operation=record_settlement"),
    await runIn(app, "fixtures", "new", "bond", "--status", "404"),
    await runIn(app, "new", "page", "bond-terms", "--operation", "bond", "--force"),
  );
}, appTimeout);

afterAll(() => {
  rmSync(app, { force: true, recursive: true });
});

describe("vp run new", () => {
  test("writes a table, its test and its route, and leaves the request to the fixture that answers it", () => {
    expect(runs[0]).toStrictEqual({
      status: 0,
      stderr: "",
      stdout: `Wrote src/pages/positions.tsx and src/pages/positions.test.ts, and added the route /positions to src/routes.ts.
fixtures/conventions.json answers GET /conventions already, so vp run new wrote no fixture of its own.
Next, run:
  vp run verify
  vp run shot /positions
`,
    });
  });

  test("writes a page with its fixture, at a route with the operation's path parameter", () => {
    expect(runs[1]?.stdout)
      .toBe(`Wrote src/pages/bond-terms.tsx, src/pages/bond-terms.test.ts and fixtures/bond-terms.json, and added the route /bond-terms/$security to src/routes.ts.
Next, run:
  vp run verify
  vp run shot /bond-terms/AAAAAAAAAAAA
`);
    const fixture: unknown = JSON.parse(
      readFileSync(path.join(app, "fixtures/bond-terms.json"), "utf8"),
    );
    expect(fixture).toMatchObject({
      operation_id: "bond",
      request: { method: "GET", path: "/bonds/AAAAAAAAAAAA" },
      response: { media_type: "application/json", status: 200 },
    });
  });

  test("writes a form whose fields are the body's, bound to the generated schema", () => {
    expect(runs[2]?.status).toBe(0);
    const page = readFileSync(path.join(app, "src/pages/new-settlement.tsx"), "utf8");
    expect(page).toContain("face: amountSchema().pipe(SettlementRequest.shape.face),");
    expect(page).toContain(
      '<FormDateField id="new-settlement-settle" label="Settle" field={field} />',
    );
  });

  test("replaces what it wrote with --force, and leaves the route it added", () => {
    expect(runs[4]?.stdout.split("\n")[0]).toBe(
      "Wrote src/pages/bond-terms.tsx, src/pages/bond-terms.test.ts and fixtures/bond-terms.json; src/routes.ts has its route already.",
    );
  });
});

describe("vp run fixtures new", () => {
  test("writes an error's problem details, at another path parameter than the success's", () => {
    expect(runs[3]).toStrictEqual({
      status: 0,
      stderr: "",
      stdout: "Wrote fixtures/bond-404.json: GET /bonds/999999999999 answered 404.\n",
    });
    const fixture: unknown = JSON.parse(
      readFileSync(path.join(app, "fixtures/bond-404.json"), "utf8"),
    );
    expect(fixture).toMatchObject({
      response: {
        body: {
          detail: "No bond has that ISIN.",
          status: 404,
          title: "No bond has that ISIN",
          type: "unknown-bond",
        },
        media_type: "application/problem+json",
        status: 404,
      },
    });
  });
});

describe("what they write", () => {
  test(
    "passes the app's checks as written: its fixtures, lint, types and tests",
    async () => {
      const checked = await runIn(
        app,
        "verify",
        "--stage",
        "fixtures",
        "--stage",
        "lint",
        "--stage",
        "types",
        "--stage",
        "tests",
      );
      expect(checked.stdout).toMatch(/^vp run verify passed 4 of 4 stages in [\d.]+ s\.$/mu);
      expect(checked.status).toBe(0);
    },
    appTimeout,
  );
});
