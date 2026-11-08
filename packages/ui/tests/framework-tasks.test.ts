/* The framework tasks, run as the preset runs them: Node on src/preset/tasks.ts, in an app's root. The app is a
 * temporary folder with this package linked in as `node_modules/@basis/ui`, as an installed app has it, and the
 * template in packages/create holds exactly what `vp run sync` writes. */

import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const script = path.join(packageRoot, "src/preset/tasks.ts");
const template = path.join(packageRoot, "../create/templates/app");

interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** The environment without git's own variables, which a commit hook sets. */
const environment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);

function runIn(root: string, ...args: string[]): Run {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    env: environment,
  });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

let app = "";

function run(...args: string[]): Run {
  return runIn(app, ...args);
}

function read(file: string): string {
  return readFileSync(path.join(app, file), "utf8");
}

function write(file: string, text: string): void {
  mkdirSync(path.dirname(path.join(app, file)), { recursive: true });
  writeFileSync(path.join(app, file), text);
}

function git(...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
    { cwd: app, encoding: "utf8", env: environment },
  ).trim();
}

beforeEach(() => {
  app = mkdtempSync(path.join(tmpdir(), "basis-ui-tasks-"));
  mkdirSync(path.join(app, "node_modules/@basis"), { recursive: true });
  symlinkSync(packageRoot, path.join(app, "node_modules/@basis/ui"), "junction");
  write("package.json", JSON.stringify({ dependencies: { "@basis/ui": "0.0.0" }, name: "app" }));
});

afterEach(() => {
  rmSync(app, { force: true, recursive: true });
});

describe("vp run sync", () => {
  test("the template holds exactly what it writes", () => {
    const check = runIn(template, "sync", "--check");
    expect(check.stderr).toBe("");
    expect(check.status).toBe(0);
  });

  test("writes the framework's files, each but CLAUDE.md opening with basis-ui's marker", () => {
    expect(run("sync").status).toBe(0);
    expect(read("CLAUDE.md")).toBe("@AGENTS.md\n");
    for (const file of ["Dockerfile", "Caddyfile", ".gitattributes", ".vite-hooks/pre-commit"]) {
      expect(read(file).split("\n", 1)[0]).toContain("managed by basis-ui");
    }
    expect(read(".claude/skills/drive-the-app/SKILL.md")).toBe(
      read(".agents/skills/drive-the-app/SKILL.md"),
    );
    expect(run("sync", "--check")).toMatchObject({ status: 0 });
  });

  test("--check fails with one line ending in the fix for each edited, missing or retired file", () => {
    run("sync");
    write("Caddyfile", `${read("Caddyfile")}# a change of the app's own\n`);
    rmSync(path.join(app, ".vite-hooks/pre-push"));
    write(".vite-hooks/pre-rebase", "# managed by basis-ui: an earlier version's hook\n");
    const check = run("sync", "--check");
    expect(check.status).toBe(1);
    expect(check.stderr.trimEnd().split("\n")).toStrictEqual([
      "ERROR Caddyfile differs from what @basis/ui 0.0.0 writes: run vp run sync to put it back, since a change it needs belongs in @basis/ui.",
      "ERROR .vite-hooks/pre-push is missing: run vp run sync to write it.",
      "ERROR .vite-hooks/pre-rebase carries basis-ui's marker, and @basis/ui 0.0.0 no longer writes it: run vp run sync to remove it.",
    ]);
    expect(run("sync").stdout).toBe(
      "Wrote Caddyfile.\nWrote .vite-hooks/pre-push.\nRemoved .vite-hooks/pre-rebase.\n",
    );
    expect(existsSync(path.join(app, ".vite-hooks/pre-rebase"))).toBe(false);
    expect(run("sync", "--check").status).toBe(0);
  });

  test("keeps the app's own AGENTS.md, rewriting only basis-ui's block", () => {
    write("AGENTS.md", "# Positions\n\nThe app's own notes.\n");
    run("sync");
    const synced = read("AGENTS.md");
    expect(synced.startsWith("# Positions\n\nThe app's own notes.\n\n<!-- basis-ui:begin")).toBe(
      true,
    );
    write("AGENTS.md", synced.replace("## basis-ui", "## basis-ui, edited"));
    expect(run("sync", "--check").stderr).toContain(
      "ERROR AGENTS.md's basis-ui block differs from what @basis/ui 0.0.0 writes: run vp run sync to rewrite it, and keep the repo's own notes outside its markers.",
    );
    write("AGENTS.md", `${synced}\nMore notes, after the block.\n`);
    expect(run("sync", "--check").status).toBe(0);
  });

  test("refuses an argument it does not know", () => {
    expect(run("sync", "--write").stderr).toMatch(
      /^ERROR vp run sync takes --check at most: .+\.\n$/u,
    );
  });
});

describe("vp run docs", () => {
  test("lists the installed README's sections, and prints one by its slug", () => {
    const listing = run("docs");
    expect(listing.stdout).toContain("ui/calling-the-api");
    const page = run("docs", "calling-the-api");
    expect(page.stdout.startsWith("## Calling the API\n")).toBe(true);
    expect(page.stdout).not.toContain("\n## ");
  });

  test("names the fix for a page it does not have", () => {
    expect(run("docs", "no-such-page").stderr).toBe(
      "ERROR there is no docs page no-such-page: run vp run docs to list the pages, then vp run docs PAGE with one of them.\n",
    );
  });
});

describe("vp run review", () => {
  beforeEach(() => {
    git("init", "--quiet", "--initial-branch=main");
    write(".gitignore", "node_modules/\n");
    git("add", "--all");
    git("commit", "--quiet", "-m", "First commit");
    git("switch", "--quiet", "-c", "change");
    write(
      "openapi.json",
      JSON.stringify({ openapi: "3.1.0", paths: { "/books": { get: { operationId: "books" } } } }),
    );
    write("package.json", JSON.stringify({ dependencies: { "@basis/ui": "0.1.0" }, name: "app" }));
    git("add", "--all");
    git("commit", "--quiet", "-m", "Books");
  });

  test("refuses a commit vp run check-full has not passed on", () => {
    expect(run("review").stderr).toMatch(
      /^ERROR vp run check-full has not passed on \w+, the commit to review: .+\.\n$/u,
    );
  });

  test("summarises a checked commit against main: versions and operations", () => {
    expect(run("checked").stdout).toMatch(/^Recorded for vp run review/u);
    const summary = run("review").stdout;
    expect(summary).toContain(": Books\n");
    expect(summary).toContain("| `@basis/ui` | 0.0.0 | 0.1.0 (changed) |");
    expect(summary).toContain("- Operations added: `books`; removed: none; changed: none.");
  });

  test("records no check while the worktree has uncommitted changes", () => {
    write("notes.txt", "uncommitted\n");
    expect(run("checked").stdout).toMatch(
      /^Not recorded for vp run review: the worktree has uncommitted changes/u,
    );
  });
});

describe("vp run doctor", () => {
  test("outside a git clone, fails with the fix for each problem", () => {
    const result = run("doctor");
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/^ok git /u);
    expect(`${result.stdout}${result.stderr}`).toMatch(/Playwright \d+\.\d+\.\d+'s Chromium/u);
    expect(result.stderr).toContain(
      "ERROR this folder is not a git clone, so no hook runs: clone the app's repo, or run git init, then vp config.",
    );
  });
});

describe("vp run upgrade", () => {
  test("refuses a version not written exactly", () => {
    expect(run("upgrade", "^0.4").stderr).toMatch(
      /^ERROR vp run upgrade takes one version at most, written exactly: .+\.\n$/u,
    );
  });
});

describe("a task @basis/ui does not have", () => {
  test("names the ones it has", () => {
    expect(run("deploy").stderr).toBe(
      "ERROR deploy is no task of @basis/ui's: run one of checked, docs, doctor, review, sync, upgrade with vp run.\n",
    );
  });
});
