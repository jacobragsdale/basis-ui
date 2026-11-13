/* The codemods a release ships (src/preset/codemods.ts), found in this package's source as `vp run upgrade` finds them
 * in an installed one, and the one shipped, fetch-rule-name, run on a fixture app: a temporary git clone. */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { codemodsBetween, runCodemods, shippedCodemods } from "#preset/codemods.ts";

import { uiVersion } from "./ui-version.ts";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

/** The environment without git's own variables, which a commit hook sets. */
const environment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);

let app = "";

function write(file: string, text: string): void {
  mkdirSync(path.dirname(path.join(app, file)), { recursive: true });
  writeFileSync(path.join(app, file), text);
}

function read(file: string): string {
  return readFileSync(path.join(app, file), "utf8");
}

beforeEach(() => {
  app = mkdtempSync(path.join(tmpdir(), "basis-ui-codemods-"));
  execFileSync("git", ["init", "--quiet"], { cwd: app, env: environment });
});

afterEach(() => {
  rmSync(app, { force: true, recursive: true });
});

describe("shippedCodemods", () => {
  test("finds each release's folder by its version, each exporting a codemod", async () => {
    const shipped = await shippedCodemods(packageRoot, uiVersion);
    expect(shipped.map(({ id }) => id)).toContain("0.1.0/fetch-rule-name");
    expect(codemodsBetween(shipped, "0.0.0", "0.1.0").map(({ id }) => id)).toContain(
      "0.1.0/fetch-rule-name",
    );
    expect(codemodsBetween(shipped, "0.1.0", "0.1.0")).toStrictEqual([]);
    write("src/empty.ts", "export const empty = 1;\n");
    const runs = await runCodemods(app, shipped, false);
    expect(runs.map(({ id }) => id)).toStrictEqual(shipped.map(({ id }) => id));
  });
});

test("finds src/codemods/unreleased's as the package's own version, until a release renames it", async () => {
  const folder = mkdtempSync(path.join(tmpdir(), "basis-ui-codemods-package-"));
  mkdirSync(path.join(folder, "src/codemods/unreleased"), { recursive: true });
  writeFileSync(path.join(folder, "src/codemods/unreleased/rename.ts"), "export {};\n");
  try {
    const shipped = await shippedCodemods(folder, "0.3.0");
    expect(shipped.map(({ id }) => id)).toStrictEqual(["0.3.0/rename"]);
  } finally {
    rmSync(folder, { force: true, recursive: true });
  }
});

/** Runs the shipped fetch-rule-name codemod on the fixture app, writing what it changes when `writing`. */
async function fetchRuleName(writing: boolean): ReturnType<typeof runCodemods> {
  const shipped = await shippedCodemods(packageRoot, uiVersion);
  return runCodemods(
    app,
    shipped.filter(({ id }) => id.endsWith("/fetch-rule-name")),
    writing,
  );
}

describe("the fetch-rule-name codemod", () => {
  test("renames the rule in every disable and enable comment, and nothing else", async () => {
    write(
      "src/download.tsx",
      [
        'const label = "café // eslint-disable-next-line no-restricted-globals";',
        "// oxlint-disable-next-line eslint/no-restricted-globals -- a download outside the client.",
        'export const response = fetch("/report.csv");',
        "/* eslint-disable no-restricted-globals */",
        "export const view = <p>{/* oxlint-disable-line eslint/no-restricted-globals, basis/no-fetch */}{label}</p>;",
        "/* eslint-enable no-restricted-globals */",
        "// oxlint-disable-next-line eslint/no-restricted-imports",
        "",
      ].join("\n"),
    );
    write("README.md", "// oxlint-disable-next-line eslint/no-restricted-globals\n");
    const [run] = await fetchRuleName(true);
    expect(run?.changes.map(({ path: file }) => file)).toStrictEqual(["src/download.tsx"]);
    expect(read("src/download.tsx")).toBe(
      [
        'const label = "café // eslint-disable-next-line no-restricted-globals";',
        "// oxlint-disable-next-line basis/no-fetch -- a download outside the client.",
        'export const response = fetch("/report.csv");',
        "/* eslint-disable basis/no-fetch */",
        "export const view = <p>{/* oxlint-disable-line basis/no-fetch */}{label}</p>;",
        "/* eslint-enable basis/no-fetch */",
        "// oxlint-disable-next-line eslint/no-restricted-imports",
        "",
      ].join("\n"),
    );
    expect(read("README.md")).toBe("// oxlint-disable-next-line eslint/no-restricted-globals\n");
  });

  test("in a dry run, says what it would change and writes nothing", async () => {
    write("src/a.ts", "// eslint-disable-next-line no-restricted-globals\nfetch('/a');\n");
    const [run] = await fetchRuleName(false);
    expect(run?.changes).toStrictEqual([
      {
        after: "// eslint-disable-next-line basis/no-fetch\nfetch('/a');\n",
        before: "// eslint-disable-next-line no-restricted-globals\nfetch('/a');\n",
        path: "src/a.ts",
      },
    ]);
    expect(read("src/a.ts")).toBe(
      "// eslint-disable-next-line no-restricted-globals\nfetch('/a');\n",
    );
  });

  test("a file that does not parse is one ERROR line naming it, and the other files are changed all the same", async () => {
    write("src/broken.ts", "// eslint-disable-next-line no-restricted-globals\nexport const = ;\n");
    write("src/a.ts", "// oxlint-disable-next-line eslint/no-restricted-globals\nfetch('/a');\n");
    const [run] = await fetchRuleName(true);
    expect(run?.failed).toStrictEqual([
      expect.stringMatching(
        /^ERROR codemod 0\.1\.0\/fetch-rule-name could not change src\/broken\.ts \(it does not parse: .+\): make the change its changelog entry describes in that file by hand\.$/u,
      ),
    ]);
    expect(read("src/a.ts")).toBe("// oxlint-disable-next-line basis/no-fetch\nfetch('/a');\n");
  });
});
