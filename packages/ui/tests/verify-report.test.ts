/* `vp run verify`'s words: how an ERROR line splits into its place, reason and fix for the JSON, the options it
 * takes and refuses, and the schema of the report `--json` prints. Its run on an app is in verify.test.ts. */

import { describe, expect, test } from "vite-plus/test";

import { optionsOf } from "#preset/verify.ts";
import { findingOf, findingOfLine, stageNames, verifyReportSchema } from "#preset/verify-report.ts";

describe(findingOfLine, () => {
  test.each([
    [
      "ERROR src/positions.tsx:4: @ts-ignore hides a type error, and an app hides none: remove it and fix the type the compiler names.",
      {
        file: "src/positions.tsx",
        fix: "remove it and fix the type the compiler names.",
        line: 4,
        message: "@ts-ignore hides a type error, and an app hides none",
      },
    ],
    [
      'ERROR fixtures/bad.json: format: is "basis-ui-fixture/1", the only format this @basis/ui reads; correct it by the record format, or delete it.',
      {
        file: "fixtures/bad.json",
        fix: "correct it by the record format, or delete it.",
        line: null,
        message: 'format: is "basis-ui-fixture/1", the only format this @basis/ui reads',
      },
    ],
    [
      "ERROR src/api/generated/client.ts differs from what openapi.json generates: run vp run client-pull to regenerate the client.",
      {
        file: "src/api/generated/client.ts",
        fix: "run vp run client-pull to regenerate the client.",
        line: null,
        message: "src/api/generated/client.ts differs from what openapi.json generates",
      },
    ],
    [
      "ERROR / loads 200 kB of JavaScript gzipped, over its budget of 180 kB: load what the page does not show at first through a lazy import.",
      {
        file: null,
        fix: "load what the page does not show at first through a lazy import.",
        line: null,
        message: "/ loads 200 kB of JavaScript gzipped, over its budget of 180 kB",
      },
    ],
    [
      'ERROR vite.config.ts holds more than the framework\'s lines: make it export defineConfig({ ...basisPreset() }), with basisPreset({ budget: { "/": { css: 25, js: 180 } } }) for a budget.',
      {
        file: "vite.config.ts",
        fix: 'make it export defineConfig({ ...basisPreset() }), with basisPreset({ budget: { "/": { css: 25, js: 180 } } }) for a budget.',
        line: null,
        message: "vite.config.ts holds more than the framework's lines",
      },
    ],
  ])("reads %j", (text, parts) => {
    expect(findingOfLine(text)).toStrictEqual({ ...parts, rule: null, text });
  });

  test("names the file it is given, as the drift check knows it", () => {
    const text = "ERROR AGENTS.md's basis-ui block differs: run vp run sync to rewrite it.";
    expect(findingOfLine(text, "AGENTS.md")).toMatchObject({ file: "AGENTS.md", line: null });
  });

  test("a line with no fix of its own still ends with one", () => {
    expect(findingOfLine("ERROR the run broke")).toMatchObject({
      fix: "fix what the message says, then run vp run verify again.",
      message: "the run broke",
    });
  });
});

describe(findingOf, () => {
  test("writes a tool's finding as one ERROR line: place, message, rule, fix", () => {
    const error = {
      file: "src/x.ts",
      fix: "remove the debugger statement.",
      line: 2,
      message: "`debugger` statement is not allowed",
      rule: "eslint(no-debugger)",
    };
    expect(findingOf(error).text).toBe(
      "ERROR src/x.ts:2: `debugger` statement is not allowed (eslint(no-debugger)): remove the debugger statement.",
    );
    expect(findingOf({ ...error, file: null, line: null, rule: null }).text).toBe(
      "ERROR `debugger` statement is not allowed: remove the debugger statement.",
    );
  });
});

describe(optionsOf, () => {
  test("runs every stage, in order, unless --stage names some, which run in that order", () => {
    expect(optionsOf([])).toStrictEqual({
      budget: [],
      json: false,
      stages: stageNames,
      whole: true,
    });
    expect(
      optionsOf(["--stage", "types", "--json", "--stage=sync", "--budget", "/=180,25"]),
    ).toStrictEqual({ budget: ["/=180,25"], json: true, stages: ["sync", "types"], whole: false });
  });

  test.each([
    [
      ["--stage", "e2e"],
      "ERROR e2e is no stage of vp run verify: run vp run verify, with --stage NAME for each stage to run alone, of sync, client, fixtures, config, lint, types, tests, build, budget, suppressions, and --json for the report as JSON.",
    ],
    [
      ["--fast"],
      "ERROR vp run verify takes no --fast: run vp run verify, with --stage NAME for each stage to run alone, of sync, client, fixtures, config, lint, types, tests, build, budget, suppressions, and --json for the report as JSON.",
    ],
    [
      ["--stage"],
      "ERROR vp run verify takes no --stage: run vp run verify, with --stage NAME for each stage to run alone, of sync, client, fixtures, config, lint, types, tests, build, budget, suppressions, and --json for the report as JSON.",
    ],
    [
      ["--json=yes"],
      "ERROR vp run verify takes no --json yes: run vp run verify, with --stage NAME for each stage to run alone, of sync, client, fixtures, config, lint, types, tests, build, budget, suppressions, and --json for the report as JSON.",
    ],
  ])("refuses %j with the fix", (args, message) => {
    expect(() => optionsOf(args)).toThrow(message);
  });
});

describe("the report's schema", () => {
  const report = {
    ok: false,
    stages: [
      {
        errors: [
          {
            file: "src/x.ts",
            fix: "remove it.",
            line: 2,
            message: "a debugger",
            rule: "eslint(no-debugger)",
          },
        ],
        ms: 1400,
        name: "lint",
        ok: false,
      },
      { errors: [], ms: 0, name: "budget", ok: true },
    ],
  };

  test("takes a report as verify writes it", () => {
    expect(verifyReportSchema.parse(report)).toStrictEqual(report);
  });

  test.each([
    ["a stage it does not have", { ...report, stages: [{ ...report.stages[1], name: "e2e" }] }],
    ["a key it does not name", { ...report, summary: "" }],
    [
      "a line before the first",
      {
        ...report,
        stages: [{ ...report.stages[0], errors: [{ ...report.stages[0]?.errors[0], line: 0 }] }],
      },
    ],
    [
      "an error with no fix",
      {
        ...report,
        stages: [{ ...report.stages[0], errors: [{ ...report.stages[0]?.errors[0], fix: "" }] }],
      },
    ],
  ])("refuses %s", (_what, wrong) => {
    expect(verifyReportSchema.safeParse(wrong).success).toBe(false);
  });
});
