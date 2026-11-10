/* `vp run verify` on an app, run as the preset runs it: Node on src/preset/tasks.ts in the app's root. The app is a
 * copy of packages/example, its node_modules linked in, synced as its own repo; one copy is clean, and the other holds
 * one failure for each stage, so each stage reports one error, in the summary and in the JSON. The tests run in a
 * Node DOM, as on a machine with no browser; the budget weighs the build in Chromium. */

import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { text as textOf } from "node:stream/consumers";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { syncWrite } from "#preset/sync.ts";
import { stageNames, verifyReportSchema } from "#preset/verify-report.ts";
import type { VerifyReport } from "#preset/verify-report.ts";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const script = path.join(packageRoot, "src/preset/tasks.ts");
const example = path.join(packageRoot, "../example");

/** What the runs of the whole app take at most, one after another, on a machine running the other test files. */
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

/** The framework tasks' script on `args` in `root`, without blocking the other runs. */
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

/** What is not the app's source: what installing, building, testing and running it leave behind. */
const leftBehind = new Set(["node_modules", "dist", ".fixtures", ".shots", "test-results"]);

/** A copy of packages/example as an app of its own, outside any workspace, with the framework's files it then needs. */
async function exampleApp(): Promise<string> {
  const root = mkdtempSync(path.join(tmpdir(), "basis-ui-verify-app-"));
  cpSync(example, root, {
    filter: (source) => !leftBehind.has(path.relative(example, source).split(path.sep)[0] ?? ""),
    recursive: true,
  });
  symlinkSync(path.join(example, "node_modules"), path.join(root, "node_modules"), "junction");
  await syncWrite(root);
  return root;
}

/** One failure for each stage, each of a kind no other stage reports: each file's text from the copy's own. */
const breaks: Readonly<Record<string, (text: string) => string>> = {
  Dockerfile: (text) => `${text}# an edit of the app's own\n`,
  "fixtures/stale.json": () =>
    readFileSync(path.join(example, "fixtures/conventions.json"), "utf8").replace(
      '"basis-ui-fixture/1"',
      '"basis-ui-fixture/9"',
    ),
  "src/adds.test.ts": () =>
    'import { expect, test } from "vite-plus/test";\n\ntest("adds", () => {\n  expect(1 + 1).toBe(3);\n});\n',
  "src/api/generated/client.ts": (text) => `${text}// edited by hand\n`,
  // The lint reads comments as code, and reports each that turns a check off; only this stage reads one in a string.
  "src/hint.ts": () => 'export const hint = "// @ts-ignore";\n',
  // An import only the bundler resolves: neither the lint nor the compiler reads a stylesheet's path.
  "src/main.tsx": (text) =>
    text.replace("import { router }", 'import "./missing.css";\nimport { router }'),
  "src/quantity.ts": () => 'export const quantity: number = "five";\n',
  "src/stop.ts": () => "export function stop(): void {\n  debugger;\n}\n",
  "src/styles.css": (text) => `${text}.mine {\n  color: red;\n}\n`,
};

/** The files the broken copy leaves out: checkRoutes, in the tests stage, fails on the stale fixture too, which only
 * the fixtures stage is to report here. */
const removed = ["src/routes.test.ts"];

function breakEachStage(root: string): void {
  for (const file of removed) {
    rmSync(path.join(root, file));
  }
  for (const [file, change] of Object.entries(breaks)) {
    const target = path.join(root, file);
    writeFileSync(target, change(existsSync(target) ? readFileSync(target, "utf8") : ""));
  }
}

/** Where each stage's one error is, and what found it, as the JSON gives them. */
const expected = {
  budget: { file: null, line: null, rule: null },
  build: { file: "src/main.tsx", rule: "UNRESOLVED_IMPORT" },
  client: { file: "src/api/generated/client.ts", line: null, rule: null },
  config: { file: "src/styles.css", line: null, rule: null },
  fixtures: { file: "fixtures/stale.json", line: null, rule: null },
  lint: { file: "src/stop.ts", line: 2, rule: "eslint(no-debugger)" },
  suppressions: { file: "src/hint.ts", line: 1, rule: null },
  sync: { file: "Dockerfile", line: null, rule: null },
  tests: { file: "src/adds.test.ts", line: 3, rule: null },
  types: { file: "src/quantity.ts", line: 1, rule: "TS2322" },
};

/** The routes' budget the preset passes, which the clean app meets. */
const budget = ["--budget", "/=1000,1000"];

let clean = "";
let broken = "";
const runs = new Map<"brokenJson" | "brokenText" | "cleanJson" | "cleanText", Run>();

/** A run `beforeAll` made. */
function ran(name: "brokenJson" | "brokenText" | "cleanJson" | "cleanText"): Run {
  const run = runs.get(name);
  if (run === undefined) {
    throw new Error(`no ${name} run: beforeAll failed`);
  }
  return run;
}

/** The stages that take seconds, as the commit hook runs them. */
const fastStages = ["sync", "config", "lint", "types", "suppressions"];

beforeAll(async () => {
  [clean, broken] = await Promise.all([exampleApp(), exampleApp()]);
  breakEachStage(broken);
  /* One run at a time, and the clean app's whole run once: each runs the app's tests and build, which take every core
   * beside the other test files, and build into the app's dist/. */
  runs.set("cleanJson", await runIn(clean, "verify", ...budget, "--json"));
  const commitStages = fastStages.flatMap((name) => ["--stage", name]);
  runs.set("cleanText", await runIn(clean, "verify", ...commitStages));
  runs.set("brokenJson", await runIn(broken, "verify", ...budget, "--json"));
  runs.set("brokenText", await runIn(broken, "verify", ...budget));
}, appTimeout);

afterAll(() => {
  for (const root of [clean, broken]) {
    rmSync(root, { force: true, recursive: true });
  }
});

function reportOf(run: Run): VerifyReport {
  const parsed: unknown = JSON.parse(run.stdout);
  return verifyReportSchema.parse(parsed);
}

describe("vp run verify", () => {
  test("passes a clean app's commit-hook stages, a line each, and a summary that says so", () => {
    expect(ran("cleanText").status).toBe(0);
    const lines = ran("cleanText").stdout.trimEnd().split("\n");
    expect(lines.slice(0, -1).map((line) => line.split(/\s+/u).slice(0, 2))).toStrictEqual(
      fastStages.map((name) => ["ok", name]),
    );
    // A run of some stages is not recorded for vp run review, so nothing follows the verdict.
    expect(lines.at(-1)).toMatch(/^vp run verify passed 5 of 5 stages in \d+\.\d s\.$/u);
  });

  test("--json prints one line of the report, ok for a clean app", () => {
    expect(ran("cleanJson").status).toBe(0);
    expect(ran("cleanJson").stdout.trimEnd().split("\n")).toHaveLength(1);
    // In the order the README shows it: {ok, stages}, then {name, ok, ms, errors}.
    expect(ran("cleanJson").stdout).toMatch(
      /^\{"ok":true,"stages":\[\{"name":"sync","ok":true,"ms":\d+,"errors":\[\]\},/u,
    );
    const report = reportOf(ran("cleanJson"));
    expect(report.ok).toBe(true);
    expect(report.stages.map(({ errors, name, ok }) => ({ errors, name, ok }))).toStrictEqual(
      stageNames.map((name) => ({ errors: [], name, ok: true })),
    );
  });

  test("runs every stage to its end, and reports one error for each stage's one failure", () => {
    expect(ran("brokenJson").status).toBe(1);
    const report = reportOf(ran("brokenJson"));
    expect(report.ok).toBe(false);
    expect(report.stages.map(({ name }) => name)).toStrictEqual(stageNames);
    for (const stage of report.stages) {
      expect({ name: stage.name, ok: stage.ok, count: stage.errors.length }).toStrictEqual({
        count: 1,
        name: stage.name,
        ok: false,
      });
      expect(stage.errors[0]).toMatchObject(expected[stage.name]);
    }
  });

  test("the summary gives each stage's one ERROR line under it, and the stages to run again", () => {
    expect(ran("brokenText").status).toBe(1);
    const lines = ran("brokenText").stdout.trimEnd().split("\n");
    const errors = reportOf(ran("brokenJson")).stages.map(({ errors: [error] }) => error);
    expect(lines.slice(0, -1)).toHaveLength(stageNames.length * 2);
    for (const [index, name] of stageNames.entries()) {
      expect(lines[index * 2]).toMatch(new RegExp(String.raw`^FAIL  ${name} +\d+\.\d s$`, "u"));
      const line = lines[index * 2 + 1] ?? "";
      expect(line).toMatch(/^ERROR /u);
      expect(line).toContain(errors[index]?.message);
      expect(line.endsWith(errors[index]?.fix ?? "")).toBe(true);
    }
  });

  test("its ERROR lines are the framework's own, and the tools' in one form: place, message, rule, fix", () => {
    const lines = ran("brokenText").stdout.trimEnd().split("\n");
    expect(lines).toContain(
      "ERROR Dockerfile differs from what @basis/ui 0.0.0 writes: run vp run sync to put it back, since a change it needs belongs in @basis/ui.",
    );
    expect(lines).toContain(
      "ERROR src/stop.ts:2: `debugger` statement is not allowed (eslint(no-debugger)): Remove the debugger statement.",
    );
    expect(lines).toContain(
      "ERROR the budget was not weighed, since the build failed: fix the build stage's ERROR lines, then run vp run verify --stage build --stage budget.",
    );
    expect(lines.at(-1)).toBe(
      `ERROR vp run verify failed 10 of 10 stages, sync, client, fixtures, config, lint, types, tests, build, budget and suppressions: fix each ERROR line above, then run vp run verify ${stageNames.map((name) => `--stage ${name}`).join(" ")} to check them again.`,
    );
  });

  test(
    "--stage runs the stages named; the budget, run alone, builds first, and names each route over",
    async () => {
      const run = await runIn(
        clean,
        "verify",
        "--stage",
        "budget",
        "--budget",
        "/=1,1000",
        "--json",
      );
      expect(reportOf(run).stages).toMatchObject([
        { errors: [{ file: null, line: null, rule: null }], name: "budget", ok: false },
      ]);
      expect(reportOf(run).stages[0]?.errors[0]?.message).toMatch(
        /^\/ loads [\d.]+ kB of JavaScript gzipped, over its budget of 1 kB$/u,
      );
    },
    appTimeout,
  );

  test("check-full, its former name, says so on stderr and runs it", async () => {
    const run = await runIn(clean, "check-full", "--stage", "sync", "--json");
    expect(run.stderr).toBe(
      "vp run check-full is now vp run verify, which it runs: call vp run verify instead.\n",
    );
    expect(reportOf(run)).toMatchObject({ ok: true, stages: [{ errors: [], name: "sync" }] });
  });
});
