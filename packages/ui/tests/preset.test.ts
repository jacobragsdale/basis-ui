/* The preset's plugins write @basis/ui's head script into an app's index.html, so no app keeps a copy of it, and its
 * tasks run the client's checks and type-check the whole app. */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build, resolveConfig } from "vite-plus";
import { describe, expect, test, vi } from "vite-plus/test";

import { headScript } from "#index.ts";
import { basisPlugins, basisPreset } from "#preset/index.ts";

/* Each test here starts Node on a task, the compiler, a build, a browser or vp, which a busy CI runner can make take
 * many seconds: a minute holds there, where Vitest's 5 s did not, and a test that hangs still fails. */
vi.setConfig({ testTimeout: 60_000 });

const page = `<!doctype html>
<html lang="en">
  <head>
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.js"></script>
  </body>
</html>
`;

/** The index.html Vite builds from `page` with `basisPlugins()`, in a temporary folder it removes afterwards. */
async function builtPage(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "basis-ui-head-script-"));
  try {
    await writeFile(path.join(root, "index.html"), page);
    await writeFile(path.join(root, "main.js"), 'document.title = "App";\n');
    await build({ configFile: false, logLevel: "silent", plugins: basisPlugins(), root });
    return await readFile(path.join(root, "dist", "index.html"), "utf8");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

/** The installed TypeScript's `tsc`, which `vp run verify` runs in an app. */
const tsc = path.join(
  path.dirname(createRequire(import.meta.url).resolve("typescript/package.json")),
  "bin/tsc",
);
const baseConfig = fileURLToPath(new URL("../config/tsconfig.json", import.meta.url));

/** What `tsc --noEmit` prints and exits with in an app on @basis/ui's tsconfig whose generated client holds `client`,
 * in a temporary folder it removes afterwards. */
async function typeCheckApp(client: string): Promise<{ status: number | null; stdout: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "basis-ui-type-check-"));
  try {
    const tsconfig = { compilerOptions: { types: [] }, extends: baseConfig, include: ["src"] };
    await writeFile(path.join(root, "tsconfig.json"), JSON.stringify(tsconfig));
    await mkdir(path.join(root, "src/api/generated"), { recursive: true });
    await writeFile(path.join(root, "src/api/generated/client.ts"), client);
    const result = spawnSync(process.execPath, [tsc, "--noEmit"], { cwd: root, encoding: "utf8" });
    return { status: result.status, stdout: result.stdout };
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

/** The modules Vite crawls for dependencies to pre-bundle when it serves an app in `mode`, with `basisPlugins()`. */
async function crawledIn(mode: string): Promise<unknown> {
  const config = await resolveConfig(
    { configFile: false, logLevel: "silent", mode, plugins: basisPlugins() },
    "serve",
  );
  return config.optimizeDeps.entries;
}

describe(basisPlugins, () => {
  test("a build's index.html runs headScript as a classic inline script in its head", async () => {
    const html = await builtPage();
    const script = html.indexOf(`<script>${headScript}</script>`);
    expect(script).toBeGreaterThan(html.indexOf("<head>"));
    expect(script).toBeLessThan(html.indexOf("</head>"));
  });

  test("vp test pre-bundles what every module of the app imports; vp dev crawls the pages as Vite does", async () => {
    expect(await crawledIn("test")).toStrictEqual(["src/**/*.{ts,tsx}"]);
    expect(await crawledIn("development")).toBeUndefined();
  });
});

describe(basisPreset, () => {
  const tasks = basisPreset().run?.tasks ?? {};

  /** A task's command, whichever form the task takes. */
  function commandOf(name: string): unknown {
    const task = tasks[name];
    return typeof task === "object" && !Array.isArray(task) ? task.command : task;
  }

  test.each(["verify", "check-full"])(
    "vp run %s runs verify in the framework tasks' script, with the app's budget",
    (name) => {
      const match = /^node "(?<script>[^"]+)" (?<task>[\w-]+)$/u.exec(String(commandOf(name)));
      expect(match?.groups?.["task"]).toBe(name);
      expect(existsSync(match?.groups?.["script"] ?? "")).toBe(true);
      const budgeted = basisPreset({
        budget: { "/": { css: 25, js: 180 }, "/bonds": { css: 25, js: 210 } },
      });
      const task = budgeted.run?.tasks?.[name];
      expect(typeof task === "object" && !Array.isArray(task) ? task.command : task).toMatch(
        new RegExp(
          String.raw`^node "[^"]+" ${name} --budget "/=180,25" --budget "/bonds=210,25"$`,
          "u",
        ),
      );
    },
  );

  test.each(["docs", "doctor", "review", "sync", "upgrade"])(
    "vp run %s runs the framework tasks' script",
    (name) => {
      const match = /^node "(?<script>[^"]+)" (?<task>\w+)$/u.exec(String(commandOf(name)));
      expect(match?.groups?.["task"]).toBe(name);
      expect(existsSync(match?.groups?.["script"] ?? "")).toBe(true);
    },
  );

  test("its type check fails on a type error in the generated client, which vp check lints around", async () => {
    const wrong = await typeCheckApp('export const quantity: number = "five";\n');
    expect(wrong.status).not.toBe(0);
    expect(wrong.stdout).toContain("src/api/generated/client.ts");
    expect(wrong.stdout).toContain("TS2322");
    const right = await typeCheckApp("export const quantity: number = 5;\n");
    expect(right).toStrictEqual({ status: 0, stdout: "" });
  });

  test.each(["pull", "check"])("vp run client-%s runs the client tasks' script", (verb) => {
    const command = String(commandOf(`client-${verb}`));
    const match = /^node "(?<script>[^"]+)" (?<verb>\w+)$/u.exec(command);
    expect(match?.groups?.["verb"]).toBe(verb);
    expect(existsSync(match?.groups?.["script"] ?? "")).toBe(true);
  });
});
