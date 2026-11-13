/* `vp run docs`, run as the preset runs it: Node on src/preset/tasks.ts, in an app's root. The app is a temporary
 * folder with this package linked in as `node_modules/@basis/ui`, as an installed app has it, so the task reads the
 * README and the catalogue an app reads. Its errors are tested in preset-errors.test.ts. */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, test } from "vite-plus/test";
import { z } from "zod";
import { uiVersion } from "./ui-version.ts";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const script = path.join(packageRoot, "src/preset/tasks.ts");

const app = mkdtempSync(path.join(tmpdir(), "basis-ui-docs-"));
mkdirSync(path.join(app, "node_modules/@basis"), { recursive: true });
symlinkSync(packageRoot, path.join(app, "node_modules/@basis/ui"), "junction");
writeFileSync(
  path.join(app, "package.json"),
  JSON.stringify({ dependencies: { "@basis/ui": uiVersion }, name: "app" }),
);

afterAll(() => {
  rmSync(app, { force: true, recursive: true });
});

function run(...args: string[]): { readonly status: number | null; readonly stdout: string } {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: app, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout };
}

/* Each test starts Node on the task once or more, a second or so each, and a busy runner takes several: five seconds,
 * Vitest's default, was passed on CI by the test that runs it four times. */
describe("vp run docs", { timeout: 30_000 }, () => {
  test("lists the installed README's sections and each family's main component, and prints a page by its slug", () => {
    const listing = run("docs");
    expect(listing.stdout).toContain("ui/calling-the-api");
    expect(listing.stdout).toMatch(/^ {2}DataTable +A table of a few hundred rows/mu);
    const page = run("docs", "calling-the-api");
    expect(page.stdout.startsWith("## Calling the API\n")).toBe(true);
    expect(page.stdout).not.toContain("\n## ");
  });

  test("prints one component from the installed catalogue in about 60 lines, with its Base UI props", () => {
    const select = run("docs", "Select");
    expect(select.status).toBe(0);
    expect(select.stdout.split("\n", 1)[0]).toBe(
      'Select, a component from @basis/ui: import { Select } from "@basis/ui";',
    );
    expect(select.stdout).toMatch(/^ {2}onValueChange\?: /mu);
    expect(select.stdout).toContain("Example:");
    expect(select.stdout.split("\n").length).toBeLessThan(80);
  });

  test("prints a hook, a type and a module, and any of them as JSON", () => {
    expect(run("docs", "numberText").stdout).toContain("numberText, a function from @basis/ui");
    expect(run("docs", "DataTableColumn").stdout).toContain("Fields:");
    expect(run("docs", "dates").stdout).toContain("settlementDate");
    const json: unknown = JSON.parse(run("docs", "useSession", "--json").stdout);
    expect(json).toMatchObject({ kind: "hook", module: "@basis/ui", name: "useSession" });
  });

  test("says that an entry is parallax's when the app has not installed it", () => {
    expect(run("docs", "Grid").stdout.split("\n", 1)[0]).toBe(
      "@basis/parallax is not installed in this app: add it with vp add @basis/parallax to use this.",
    );
  });

  test("finds entries by what they are for, best first", () => {
    const found = run("docs", "--search", "date range");
    expect(found.stdout.split("\n", 1)[0]).toMatch(/^ {2}DateRangePicker +component /u);
    const result = z.object({ name: z.string() });
    const json = z
      .object({ query: z.string(), results: z.array(result) })
      .parse(JSON.parse(run("docs", "--search", "date", "range", "--json").stdout));
    expect(json.query).toBe("date range");
    expect(json.results[0]?.name).toBe("DateRangePicker");
  });
});
