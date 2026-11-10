/* `vp run budget`: the budgets it reads from the preset's arguments, the line it prints for each route, the `ERROR`
 * line for a route over its budget, and, in the preset's headless Chromium, what it counts as a route's weight: every
 * script and stylesheet the page asks for, lazy chunks and workers included, gzipped. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";

import { afterAll, describe, expect, test } from "vite-plus/test";

import { budgetArgs, budgetOf, verdict } from "#preset/budget-options.ts";
import { budgetTask, fileFor } from "#preset/budget.ts";
import { basisPreset } from "#preset/index.ts";

const example = 'basisPreset({ budget: { "/": { css: 25, js: 180 } } })';

describe(budgetOf, () => {
  test("reads back the arguments the preset writes for each route", () => {
    const budget = { "/": { css: 25, js: 180 }, "/bonds/US91282CRF04": { css: 25.5, js: 210 } };
    expect(budgetArgs(budget)).toStrictEqual(["/=180,25", "/bonds/US91282CRF04=210,25.5"]);
    expect(budgetOf(budgetArgs(budget))).toStrictEqual(budget);
  });

  test("the preset's task builds, then weighs the routes its budget names", () => {
    const task = basisPreset({ budget: { "/": { css: 25, js: 180 } } }).run?.tasks?.["budget"];
    expect(task).toMatchObject({
      cache: false,
      command: ["vp build", expect.stringMatching(/tasks\.ts" budget "\/=180,25"$/u)],
    });
  });

  test.each([
    [
      [],
      `ERROR vp run budget has no routes to weigh: give each route a budget in vite.config.ts, as ${example}, in kilobytes gzipped.`,
    ],
    [
      ["positions=180,25"],
      `ERROR the budget's route positions does not start with /: name each route by its path, as ${example} in vite.config.ts.`,
    ],
    [
      ["/=180"],
      `ERROR the budget for / is not two numbers of kilobytes above 0: give it as ${example} in vite.config.ts.`,
    ],
    [
      ["/=180,0"],
      `ERROR the budget for / is not two numbers of kilobytes above 0: give it as ${example} in vite.config.ts.`,
    ],
    [
      ["/=180,25,3"],
      `ERROR the budget for / is not two numbers of kilobytes above 0: give it as ${example} in vite.config.ts.`,
    ],
  ])("refuses %j with the fix", (args, message) => {
    expect(() => budgetOf(args)).toThrow(message);
  });
});

describe(verdict, () => {
  const budget = { "/": { css: 25, js: 180 }, "/positions": { css: 25, js: 200 } };

  test("one line a route, aligned, when each is within its budget", () => {
    const weights = [
      { css: 22_400, js: 174_049, route: "/" },
      { css: 22_400, js: 199_999, route: "/positions" },
    ];
    expect(verdict(weights, budget)).toStrictEqual({
      lines: [
        "/           JS 174.0 of 180 kB, CSS 22.4 of 25 kB, gzipped",
        "/positions  JS 200.0 of 200 kB, CSS 22.4 of 25 kB, gzipped",
      ],
      over: false,
    });
  });

  test("an ERROR line for each kind a route loads too much of, naming the fix", () => {
    const weights = [
      { css: 22_400, js: 174_049, route: "/" },
      { css: 25_001, js: 200_001, route: "/positions" },
    ];
    expect(verdict(weights, budget)).toStrictEqual({
      lines: [
        "/           JS 174.0 of 180 kB, CSS 22.4 of 25 kB, gzipped",
        "ERROR /positions loads 200.0 kB of JavaScript gzipped, over its budget of 200 kB: load what the page does not show at first through a lazy import, or raise the route's budget in vite.config.ts if the page needs it all.",
        "ERROR /positions loads 25.0 kB of CSS gzipped, over its budget of 25 kB: load what the page does not show at first through a lazy import, or raise the route's budget in vite.config.ts if the page needs it all.",
      ],
      over: true,
    });
  });
});

describe(fileFor, () => {
  const dist = path.join(tmpdir(), "basis-ui-budget-files");
  mkdirSync(path.join(dist, "assets"), { recursive: true });
  writeFileSync(path.join(dist, "index.html"), "");
  writeFileSync(path.join(dist, "assets/main.js"), "");
  afterAll(() => {
    rmSync(dist, { force: true, recursive: true });
  });

  test("serves a built file, index.html for a route, and nothing for /api, a missing file or a path out of dist", () => {
    expect(fileFor(dist, "/assets/main.js?v=1")).toBe(path.join(dist, "assets/main.js"));
    expect(fileFor(dist, "/bonds/US91282CRF04")).toBe(path.join(dist, "index.html"));
    expect(fileFor(dist, "/api/positions")).toBeUndefined();
    expect(fileFor(dist, "/assets/gone.js")).toBeUndefined();
    expect(fileFor(dist, "/../../etc/passwd.txt")).toBeUndefined();
  });
});

/* A build of an entry that loads a stylesheet, a lazy chunk and a worker, and a chunk nothing loads. The entry is large
 * enough for `vp build` to have written a `.gz` beside it, which the task reads rather than gzipping it again; the
 * others it gzips. */
const entry = `const worker = new Worker("/assets/worker.js");\nawait import("/assets/lazy.js");\nconsole.log(worker, "${"entry ".repeat(400)}");\n`;
const built: Readonly<Record<string, string>> = {
  "assets/entry.js": entry,
  "assets/lazy.js": `export const lazy = "${"lazy ".repeat(50)}";\n`,
  "assets/never.js": `export const never = "${"never ".repeat(500)}";\n`,
  "assets/style.css": `body { color: red; }\n${".a { margin: 0; }\n".repeat(30)}`,
  "assets/worker.js": `postMessage("${"worker ".repeat(20)}");\n`,
  "index.html": `<!doctype html><html><head><link rel="stylesheet" href="/assets/style.css"></head><body><script type="module" src="/assets/entry.js"></script></body></html>`,
};
// A `.gz` that differs from what gzipping the entry gives, so the test sees which the task counted.
const writtenGz = Buffer.concat([gzipSync(entry, { level: 9 }), Buffer.alloc(7)]);

/** An app's root holding `built` in its dist/, with the entry's `.gz`. */
function appWithBuild(): string {
  const root = mkdtempSync(path.join(tmpdir(), "basis-ui-budget-"));
  for (const [file, contents] of Object.entries(built)) {
    mkdirSync(path.dirname(path.join(root, "dist", file)), { recursive: true });
    writeFileSync(path.join(root, "dist", file), contents);
  }
  writeFileSync(path.join(root, "dist/assets/entry.js.gz"), writtenGz);
  return root;
}

function gzipped(file: string): number {
  return gzipSync(built[file] ?? "", { level: 9 }).length;
}

function kilobytes(bytes: number): string {
  return (bytes / 1000).toFixed(1);
}

describe(budgetTask, () => {
  const root = appWithBuild();
  afterAll(() => {
    rmSync(root, { force: true, recursive: true });
  });

  test("weighs what the route loads: the entry by its .gz, its lazy chunk and worker gzipped, never what it does not load", async () => {
    const js = writtenGz.length + gzipped("assets/lazy.js") + gzipped("assets/worker.js");
    const css = gzipped("assets/style.css");
    expect(await budgetTask(root, ["/positions=1,1"])).toBe(
      `/positions  JS ${kilobytes(js)} of 1 kB, CSS ${kilobytes(css)} of 1 kB, gzipped`,
    );
  });

  test("fails with an ERROR line for a route over its budget", async () => {
    await expect(budgetTask(root, ["/=0.1,1"])).rejects.toThrow(
      /^ERROR \/ loads \d+\.\d kB of JavaScript gzipped, over its budget of 0\.1 kB: /u,
    );
  });

  test("fails with the fix when there is no build", async () => {
    await expect(budgetTask(path.join(root, "nothing"), ["/=180,25"])).rejects.toThrow(
      "ERROR dist/index.html is missing, so there is no build to weigh: run vp build, then vp run budget again.",
    );
  });
});
