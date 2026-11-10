/* Every error the preset adds to an app's lint names its fix, since in an app agents write nobody reads the code
 * (docs/design.md, The idea): the libraries @basis/ui replaces, `fetch` and the generated files outside the client
 * layer, and display rounding (docs/design.md, Numbers). The probe runs `vp lint` in packages/consumer, the app
 * configured exactly as the README says, on a file of every banned import and call. `vp run docs`'s errors, for a name
 * or a search it cannot answer, are held here by their text too, run in the same app. */

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

import { afterAll, describe, expect, test } from "vite-plus/test";
import { z } from "zod";

const consumer = new URL("../../consumer/", import.meta.url);
const probeFolder = new URL(".lint-probe/", consumer);

const probe = `import { groupBy } from "lodash";
import dayjs from "dayjs";
import Decimal from "decimal.js";
import { Check } from "lucide-react";
import axios from "axios";
import { client } from "#api/generated/client.ts";

export const used = [groupBy, dayjs, Decimal, Check, axios, client, fetch("/api/positions")];
const price = 99.515_625;
export const shown = [price.toFixed(2), price.toPrecision(4), price.toLocaleString(), Math.round(price)];
export const format = new Intl.NumberFormat("en-US");
export const whole = [Math.floor(price), Math.trunc(price)];
`;

const spanSchema = z.object({ line: z.number() });
const labelSchema = z.object({ span: spanSchema });
const diagnosticSchema = z.object({
  code: z.string(),
  help: z.string().optional(),
  labels: z.array(labelSchema),
  message: z.string(),
});
const reportSchema = z.object({ diagnostics: z.array(diagnosticSchema) });

/** The probe's line holding `text`, counted from 1. */
function lineOf(text: string): number {
  return probe.split("\n").findIndex((source) => source.includes(text)) + 1;
}

/** `vp lint`'s JSON report on the probe, run as the app runs it: JSON, so CI's annotations do not drop the help. */
function lintReport(): string {
  rmSync(probeFolder, { force: true, recursive: true });
  mkdirSync(probeFolder, { recursive: true });
  writeFileSync(new URL("probe.ts", probeFolder), probe);
  const vp = new URL("node_modules/.bin/vp", consumer).pathname;
  try {
    return execFileSync(vp, ["lint", "--format", "json", ".lint-probe/probe.ts"], {
      cwd: consumer,
      encoding: "utf8",
    });
  } catch (error) {
    return error instanceof Error && "stdout" in error ? String(error.stdout) : String(error);
  }
}

const report = lintReport();
const reportJson: unknown = JSON.parse(report.slice(report.indexOf("{")));
const { diagnostics } = reportSchema.parse(reportJson);

/** What a rule reports at the probe's line holding `text`: its message and its help, on one line. */
function findingFor(rule: string, text: string): string | undefined {
  const line = lineOf(text);
  const atLine = (diagnostic: z.infer<typeof diagnosticSchema>): boolean =>
    diagnostic.labels.some(({ span }) => span.line === line);
  const found = diagnostics.find(
    (diagnostic) => diagnostic.code.includes(rule) && atLine(diagnostic),
  );
  return found === undefined ? undefined : `${found.message} ${found.help ?? ""}`;
}

const findings = diagnostics
  .filter(({ code }) => code.includes("no-restricted-properties"))
  .map(({ message, help }) => `${message} ${help ?? ""}`);

afterAll(() => {
  rmSync(probeFolder, { force: true, recursive: true });
});

describe("the preset's lint against what an app must not import or call", () => {
  test.each([
    ['"lodash"', "Use @basis/ui/utils"],
    ['"dayjs"', "Use Temporal and @basis/ui/dates"],
    ['"decimal.js"', "show it with Num, Money, Pct, Bps or Price32"],
    ['"lucide-react"', "Import icons from @basis/ui"],
    ['"axios"', "import the operation's hook from src/api/client.ts"],
    ["api/generated", "import the generated client through src/api/client.ts"],
  ])("refuses an import of %s, naming the fix", (specifier, fix) => {
    const finding = findingFor("no-restricted-imports", specifier);
    expect(finding, report).toBeDefined();
    expect(finding).toContain(fix);
  });

  test("refuses fetch outside the client layer, naming the generated client", () => {
    const finding = findingFor("no-restricted-globals", 'fetch("/api/positions")');
    expect(finding, report).toBeDefined();
    expect(finding).toContain("import the operation's hook from src/api/client.ts");
  });
});

describe("the preset's lint against display rounding in an app", () => {
  test.each(["toFixed", "toPrecision", "toLocaleString", "Math.round", "Intl.NumberFormat"])(
    "refuses %s, naming the components to use instead",
    (call) => {
      const finding = findings.find((line) => line.includes(`'${call}' is restricted`));
      expect(finding, report).toBeDefined();
      expect(finding).toContain("show it with Num, Money, Pct, Bps or Price32 from @basis/ui");
      expect(finding).toContain("numberText(value, { decimals })");
    },
  );

  test("sends an integer that is not shown to Math.floor or Math.trunc, which it allows", () => {
    const round = findings.find((line) => line.includes("'Math.round' is restricted"));
    expect(round).toContain("use Math.floor or Math.trunc");
    expect(findings).toHaveLength(5);
  });

  test("sends a date to DateTime", () => {
    const local = findings.find((line) => line.includes("'toLocaleString' is restricted"));
    expect(local).toContain("a date or time with DateTime");
  });
});

/** What `vp lint` reports in packages/consumer of Vitest's browser API, on a test at `file` in the probe's folder that
 * imports vitest-browser-react and calls `expect.element`. */
function browserApiFindings(file: string): z.infer<typeof diagnosticSchema>[] {
  const testProbe = new URL(file, probeFolder);
  mkdirSync(new URL(".", testProbe), { recursive: true });
  writeFileSync(
    testProbe,
    'import { render } from "vitest-browser-react";\nimport { expect, test } from "vite-plus/test";\n\ntest("x", async () => {\n  const screen = await render(null);\n  await expect.element(screen.container).toBeVisible();\n});\n',
  );
  const vp = new URL("node_modules/.bin/vp", consumer).pathname;
  let output = "";
  try {
    output = execFileSync(vp, ["lint", "--format", "json", `.lint-probe/${file}`], {
      cwd: consumer,
      encoding: "utf8",
    });
  } catch (error) {
    output = error instanceof Error && "stdout" in error ? String(error.stdout) : String(error);
  }
  const parsed: unknown = JSON.parse(output.slice(output.indexOf("{")));
  return reportSchema
    .parse(parsed)
    .diagnostics.filter(({ help }) => help?.includes("*.browser.test.tsx") === true);
}

describe("the preset's lint against Vitest's browser API outside a browser-only test", () => {
  test.each(["probe.test.ts", "src/api/probe.test.ts"])(
    "refuses vitest-browser-react and expect.element in a test any run may run, naming the fix: %s",
    (file) => {
      const found = browserApiFindings(file);
      expect(found.map(({ code }) => code).toSorted()).toStrictEqual([
        "eslint(no-restricted-imports)",
        "eslint(no-restricted-properties)",
      ]);
      expect(found[0]?.help).toContain("render, screen and userEvent from @basis/ui/testing");
    },
  );
});

/** What `vp run docs` prints to its error stream in packages/consumer, which has `@basis/ui` installed. */
function docsError(...args: string[]): string {
  const tasks = new URL("../src/preset/tasks.ts", import.meta.url).pathname;
  const result = spawnSync(process.execPath, [tasks, "docs", ...args], {
    cwd: consumer,
    encoding: "utf8",
  });
  return result.stderr;
}

describe("vp run docs, for a name or a search it cannot answer", () => {
  test("suggests the closest names for one it does not have", () => {
    expect(docsError("Selekt")).toBe(
      "ERROR there is no Selekt in the installed catalogue or docs: did you mean Select? Run vp run docs NAME with one, or vp run docs --search WORDS to find one by what it does.\n",
    );
  });

  test("says how to find one when no name is close", () => {
    expect(docsError("Xyzzyplugh")).toBe(
      "ERROR there is no Xyzzyplugh in the installed catalogue or docs: run vp run docs --search WORDS to find one by what it does, or vp run docs to list the pages and components.\n",
    );
  });

  test("names the fix for a search nothing matches, and for a search with no words", () => {
    expect(docsError("--search", "xyzzy plugh")).toBe(
      'ERROR nothing in the installed catalogue or docs matches every word of "xyzzy plugh": search with fewer or other words, or run vp run docs to list the pages and components.\n',
    );
    expect(docsError("--search")).toBe(
      "ERROR vp run docs --search needs the words to find: run vp run docs, vp run docs NAME or vp run docs --search WORDS, each with --json if wanted.\n",
    );
  });

  test("refuses a second name or a flag it does not know", () => {
    expect(docsError("Select", "Input")).toBe(
      "ERROR vp run docs takes one name at most: run vp run docs, vp run docs NAME or vp run docs --search WORDS, each with --json if wanted.\n",
    );
    expect(docsError("Select", "--full")).toBe(
      "ERROR vp run docs takes one name at most and no --full: run vp run docs, vp run docs NAME or vp run docs --search WORDS, each with --json if wanted.\n",
    );
  });
});
