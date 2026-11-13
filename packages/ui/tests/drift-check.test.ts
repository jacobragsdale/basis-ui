/* The doors the drift check closes (docs/design.md, A UI repo): `.gitignore`, `src/styles.css`, `tsconfig.json` and
 * `vite.config.ts` held to the framework's lines, and package.json to the packages an app may use, by `vp run sync
 * --check`; and verify's suppressions stage, which reads src/ as text, since a comment that turns every rule off
 * hides from the lint. Each failure is held by the exact text of its ERROR line. The tasks run as the preset runs
 * them, Node on src/preset/tasks.ts, in a temporary app with this package linked in as `node_modules/@basis/ui`. */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { uiVersion } from "./ui-version.ts";

/* Each test here starts Node on a task, the compiler, a build, a browser or vp, which a busy CI runner can make take
 * many seconds: a minute holds there, where Vitest's 5 s did not, and a test that hangs still fails. */
vi.setConfig({ testTimeout: 60_000 });

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const script = path.join(packageRoot, "src/preset/tasks.ts");

let app = "";

function run(...args: string[]): {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
} {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: app, encoding: "utf8" });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

function read(file: string): string {
  return readFileSync(path.join(app, file), "utf8");
}

function write(file: string, text: string): void {
  mkdirSync(path.dirname(path.join(app, file)), { recursive: true });
  writeFileSync(path.join(app, file), text);
}

beforeEach(() => {
  app = mkdtempSync(path.join(tmpdir(), "basis-ui-drift-"));
  mkdirSync(path.join(app, "node_modules/@basis"), { recursive: true });
  symlinkSync(packageRoot, path.join(app, "node_modules/@basis/ui"), "junction");
  write("package.json", JSON.stringify({ dependencies: { "@basis/ui": uiVersion }, name: "app" }));
});

afterEach(() => {
  rmSync(app, { force: true, recursive: true });
});

describe("vp run sync, on the app's own configuration and dependencies", () => {
  const stylesError =
    "ERROR src/styles.css holds more than @basis/ui's stylesheet, and an app declares no colour, utility, variant or class of its own: run vp run sync to put it back, and take each look from a component's variant or a theme token, which vp run docs --search WORDS finds.";
  const viteConfigError =
    'ERROR vite.config.ts holds more than the framework\'s lines, and an app configures nothing of its own: make it import basisPlugins, basisPreset and basisTest from "@basis/ui/preset" and defineConfig from "vite-plus", and export defineConfig({ ...basisPreset(), plugins: basisPlugins(), test: await basisTest() }), with basisPreset({ budget: { "/": { css: 25, js: 180 } } }) for a budget and basisTest({ browser: false }) for no browser.';

  test("writes .gitignore, which keeps .fixtures/ out of git, the stylesheet, the tsconfig and vite.config.ts", () => {
    expect(run("sync").status).toBe(0);
    expect(read(".gitignore").split("\n")).toContain(".fixtures/");
    expect(read("src/styles.css")).toBe('@import "@basis/ui/styles.css";\n');
    expect(JSON.parse(read("tsconfig.json"))).toStrictEqual({
      extends: "@basis/ui/tsconfig.json",
      include: ["src", "vite.config.ts"],
    });
    expect(read("vite.config.ts")).toContain("...basisPreset(),");
  });

  test("holds .gitignore to what it writes, so no app drops .fixtures/ from it", () => {
    run("sync");
    write(".gitignore", read(".gitignore").replace(".fixtures/\n", ""));
    expect(run("sync", "--check").stderr).toBe(
      `ERROR .gitignore differs from what @basis/ui ${uiVersion} writes: run vp run sync to put it back, since a change it needs belongs in @basis/ui.\n`,
    );
  });

  test("refuses a colour, a utility or a class an app's stylesheet declares", () => {
    run("sync");
    write("src/styles.css", `${read("src/styles.css")}@utility card-x { padding: 13px; }\n`);
    expect(run("sync", "--check").stderr).toBe(`${stylesError}\n`);
    expect(run("sync").status).toBe(0);
    expect(read("src/styles.css")).toBe('@import "@basis/ui/styles.css";\n');
  });

  test("writes @basis/parallax's stylesheet beside @basis/ui's for an app that depends on it", () => {
    write(
      "package.json",
      JSON.stringify({ dependencies: { "@basis/parallax": uiVersion, "@basis/ui": uiVersion } }),
    );
    run("sync");
    expect(read("src/styles.css")).toBe(
      '@import "@basis/ui/styles.css";\n@import "@basis/parallax/styles.css";\n',
    );
  });

  test("refuses a tsconfig that loosens a check", () => {
    run("sync");
    write(
      "tsconfig.json",
      read("tsconfig.json").replace(
        '"include"',
        '"compilerOptions": { "strict": false },\n  "include"',
      ),
    );
    expect(run("sync", "--check").stderr).toBe(
      "ERROR tsconfig.json differs from the lines that extend @basis/ui's strict tsconfig, and an app loosens no check: run vp run sync to put it back, and fix the code a check fails on rather than the check.\n",
    );
  });

  test("keeps vite.config.ts with a budget, no browser and comments, which are the framework's lines", () => {
    run("sync");
    write(
      "vite.config.ts",
      `// The app's budget.\nimport { basisPlugins, basisPreset, basisTest } from "@basis/ui/preset";\nimport { defineConfig } from "vite-plus";\n\nexport default defineConfig({\n  ...basisPreset({\n    budget: {\n      "/": { css: 25, js: 250 },\n      "/bonds/US91282CRF04": { css: 25, js: 255 },\n    },\n  }),\n  plugins: basisPlugins(),\n  test: await basisTest({ browser: false }),\n});\n`,
    );
    expect(run("sync", "--check")).toMatchObject({ stderr: "", status: 0 });
  });

  test("refuses a vite.config.ts that adds to the framework's lines, and names them", () => {
    run("sync");
    write(
      "vite.config.ts",
      read("vite.config.ts").replace(
        "plugins: basisPlugins(),",
        "plugins: basisPlugins(),\n  css: { modules: {} },",
      ),
    );
    expect(run("sync", "--check").stderr).toBe(`${viteConfigError}\n`);
    expect(run("sync")).toMatchObject({ stderr: `${viteConfigError}\n`, status: 1 });
  });

  test("refuses a dependency an app may not use, and by name one the design decided against", () => {
    run("sync");
    write(
      "package.json",
      JSON.stringify({
        dependencies: { "@basis/ui": uiVersion, "left-pad": "1.3.0", recharts: "3.0.0" },
        devDependencies: { prettier: "3.6.0" },
      }),
    );
    expect(run("sync", "--check").stderr.trimEnd().split("\n")).toStrictEqual([
      "ERROR package.json depends on left-pad, which is not among the packages a basis-ui app may use: remove it with vp remove left-pad, or ask basis-ui's maintainer to add it to @basis/ui's list.",
      "ERROR package.json depends on prettier, which basis-ui decided against, since the formatter is Oxfmt, which vp check runs: remove it with vp remove prettier.",
      "ERROR package.json depends on recharts, which basis-ui decided against, since charts are @basis/parallax's Chart: remove it with vp remove recharts.",
    ]);
  });
});

describe("vp run sync, on configuration beside the framework's and dependencies by another name", () => {
  test.each([
    ["vitest.config.ts", "Vitest"],
    ["vite.config.js", "Vite"],
    [".oxlintrc.json", "Oxlint"],
    [".oxfmtrc.json", "Oxfmt"],
  ])("refuses %s, which %s reads beside the framework's configuration", (file, tool) => {
    run("sync");
    write(file, "{}\n");
    expect(run("sync", "--check").stderr).toBe(
      `ERROR ${file} configures ${tool} beside the framework's configuration, which ${tool} reads instead of it or as well, so this app's checks would differ from every other's: delete it, and keep what the app needs in vite.config.ts's framework lines.\n`,
    );
  });

  test("holds optionalDependencies to the list, and refuses an alias or a package from outside the feed", () => {
    run("sync");
    write(
      "package.json",
      JSON.stringify({
        dependencies: {
          "@basis/ui": uiVersion,
          react: "github:someone/react",
          zod: "npm:other@1.0.0",
        },
        optionalDependencies: { "left-pad": "1.3.0" },
      }),
    );
    expect(run("sync", "--check").stderr.trimEnd().split("\n")).toStrictEqual([
      "ERROR package.json depends on left-pad, which is not among the packages a basis-ui app may use: remove it with vp remove left-pad, or ask basis-ui's maintainer to add it to @basis/ui's list.",
      "ERROR package.json installs react from github:someone/react, not from the feed at a version: install it with vp add react@VERSION, at the version the template pins.",
      "ERROR package.json installs zod from npm:other@1.0.0, not from the feed at a version: install it with vp add zod@VERSION, at the version the template pins.",
    ]);
  });
});

describe("verify's suppressions stage", () => {
  test("counts the comments the allowlist allows: oxc/no-barrel-file in src/api", () => {
    write(
      "src/api/client.ts",
      '/* oxlint-disable oxc/no-barrel-file -- the generated client\'s surface.\n * It changes on every pull. */\nexport * from "./generated/client.ts";\n',
    );
    write("src/api/generated/client.ts", "/* eslint-disable */\n// @ts-nocheck\n");
    expect(run("suppressions")).toMatchObject({
      stderr: "",
      stdout:
        "1 comment in src/ turns a check off, each on the allowlist: oxc/no-barrel-file in src/api.\n",
    });
  });

  test("refuses every other one, also one that turns off every rule and so hides from the lint", () => {
    write("src/page.tsx", "/* eslint-disable */\nexport const page = 1;\n");
    write(
      "src/table.tsx",
      "// oxlint-disable-next-line oxc/no-barrel-file, eslint/complexity -- a reason\n// @ts-expect-error -- a reason\n",
    );
    const result = run("suppressions");
    expect(result.status).toBe(1);
    expect(result.stderr.trimEnd().split("\n")).toStrictEqual([
      "ERROR src/page.tsx:1: eslint-disable turns off every rule, and an app turns off no rule but oxc/no-barrel-file in src/api: remove the comment and fix what the rule reports, as its ERROR line says.",
      "ERROR src/table.tsx:1: oxlint-disable-next-line turns off oxc/no-barrel-file, eslint/complexity, and an app turns off no rule but oxc/no-barrel-file in src/api: remove the comment and fix what the rule reports, as its ERROR line says.",
      "ERROR src/table.tsx:2: @ts-expect-error hides a type error, and an app hides none: remove it and fix the type the compiler names, parsing a value of unknown shape with a zod schema rather than asserting its type.",
    ]);
  });
});
