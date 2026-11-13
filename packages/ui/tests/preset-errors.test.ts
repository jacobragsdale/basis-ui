/* Every error the preset adds to an app's lint names its fix, since in an app agents write nobody reads the code
 * (docs/design.md, The idea): the libraries @basis/ui replaces, `fetch` and the generated files outside the client
 * layer, display rounding (docs/design.md, Numbers), and the classes that restyle a component or name a colour the
 * theme lacks. The probe runs `vp lint` in packages/consumer, the app configured exactly as the README says, on a file
 * of every banned import and call. The app's limits are held by its table page, which they pass. `vp run docs`'s
 * errors, for a name or a search it cannot answer, are held here by their text too, run in the same app. The doors
 * probes found open on 2026-11-09 are held beside it, in preset-errors-doors.test.ts. */

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

import { afterAll, describe, expect, test, vi } from "vite-plus/test";

import { consumer, lintDiagnostics, rawColourText } from "./lint-probe.ts";
import type { Diagnostic } from "./lint-probe.ts";

/* Each test here starts Node on a task, the compiler, a build, a browser or vp, which a busy CI runner can make take
 * many seconds: a minute holds there, where Vitest's 5 s did not, and a test that hangs still fails. */
vi.setConfig({ testTimeout: 60_000 });

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

/** The probe's line holding `text`, counted from 1. */
function lineOf(text: string): number {
  return probe.split("\n").findIndex((source) => source.includes(text)) + 1;
}

rmSync(probeFolder, { force: true, recursive: true });
mkdirSync(probeFolder, { recursive: true });
writeFileSync(new URL("probe.ts", probeFolder), probe);
const diagnostics = lintDiagnostics(".lint-probe/probe.ts");
const report = JSON.stringify(diagnostics, null, 2);

/** What a rule reports at the probe's line holding `text`: its message and its help, on one line. */
function findingFor(rule: string, text: string): string | undefined {
  const line = lineOf(text);
  const atLine = (diagnostic: Diagnostic): boolean =>
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

  test("refuses fetch outside the client layer, naming the generated client and nothing else", () => {
    expect(findingFor("basis(no-fetch)", 'fetch("/api/positions")'), report).toBe(
      "ERROR feature code calls the API only through the generated client: import the operation's hook from src/api/client.ts. ",
    );
    expect(diagnostics.filter(({ code }) => code.includes("no-restricted-globals"))).toStrictEqual(
      [],
    );
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
function browserApiFindings(file: string): Diagnostic[] {
  const testProbe = new URL(file, probeFolder);
  mkdirSync(new URL(".", testProbe), { recursive: true });
  writeFileSync(
    testProbe,
    'import { render } from "vitest-browser-react";\nimport { expect, test } from "vite-plus/test";\n\ntest("x", async () => {\n  const screen = await render(null);\n  await expect.element(screen.container).toBeVisible();\n});\n',
  );
  return lintDiagnostics(`.lint-probe/${file}`).filter(
    ({ help }) => help?.includes("*.browser.test.tsx") === true,
  );
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

describe("the app's limits, loosened for app code on 2026-11-09", () => {
  test("pass the table page that failed basis-ui's own six limits with no fault in it", () => {
    expect(lintDiagnostics("src/positions.tsx")).toStrictEqual([]);
  });
});

const classes = `import { Badge, Button } from "@basis/ui";

export const shown = [
  <Button className="bg-blue-600">Save</Button>,
  <Badge className="font-bold">New</Badge>,
  <div className="bg-red-500">Loss</div>,
  <div className="drop-shadow-lg">Card</div>,
  <p title={String(page * 25)}>{rows > 25 ? 4 : 3}</p>,
];
const page = 3;
export const rows = page * 25;
`;

/** What `rule` reports in packages/consumer on the classes probe, on the line holding `text`. */
function classFinding(found: Diagnostic[], rule: string, text: string): string[] {
  const line = classes.split("\n").findIndex((source) => source.includes(text)) + 1;
  return found
    .filter(({ code, labels }) => code === rule && labels.some(({ span }) => span.line === line))
    .map(({ message }) => message);
}

describe("the preset's lint against a class that restyles a component or names a colour the theme lacks", () => {
  mkdirSync(probeFolder, { recursive: true });
  writeFileSync(new URL("classes.tsx", probeFolder), classes);
  const found = lintDiagnostics(".lint-probe/classes.tsx");

  test("names the component's variants and sizes and vp run docs NAME, not a file inside @basis/ui", () => {
    expect(classFinding(found, "shadcn(no-restyle)", "bg-blue-600")).toStrictEqual([
      'ERROR "bg-blue-600" restyles Button, whose look is its own: set variant (default, outline, secondary, ghost, destructive or link) or size (default, xs, sm, lg, icon, icon-xs, icon-sm or icon-lg), give className only margin, width, and flex or grid placement, and run vp run docs Button to see each.',
    ]);
    expect(classFinding(found, "shadcn(no-restyle)", "font-bold")).toStrictEqual([
      'ERROR "font-bold" restyles Badge, whose look is its own: set variant (default, secondary, outline, ghost, link, success, warning, info or destructive), give className only margin, width, and flex or grid placement, and run vp run docs Badge to see each.',
    ]);
  });

  test("sends red to the tokens a person means by it, not the nearest chart colours", () => {
    expect(classFinding(found, "shadcn(no-raw-colors)", "bg-red-500")).toStrictEqual([
      `ERROR "bg-red-500" ${rawColourText}`,
    ]);
  });

  test("calls a drop shadow the theme lacks a shadow, and names the theme's", () => {
    expect(classFinding(found, "shadcn(no-raw-colors)", "drop-shadow-lg")).toStrictEqual([
      `ERROR "drop-shadow-lg" ${rawColourText}`,
    ]);
  });

  test("lets a number inside JSX stand as itself, and names the fix for one outside it", () => {
    expect(classFinding(found, "basis(no-magic-numbers)", "rows > 25")).toStrictEqual([]);
    expect(classFinding(found, "basis(no-magic-numbers)", "rows = page")).toStrictEqual([
      "ERROR 25 is a number with no name: declare it once, as a const named for what it is, and use the name, or write it inside JSX, where a number may stand as itself.",
    ]);
  });
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
