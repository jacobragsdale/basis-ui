/* `vp run sync` and the files it does not own: an app's own file at a path where it writes basis-ui's, and a framework
 * file with changes git has not committed, each kept and named while the rest are written; the deploy files an
 * earlier version wrote, which it hands to the app; and files saved with CRLF
 * line endings, as an editor on Windows may. Run as the preset runs it, Node on src/preset/tasks.ts in an app's root,
 * a temporary folder with this package linked in. */

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

/* Each test here starts Node on a task, the compiler, a build, a browser or vp, which a busy CI runner can make take
 * many seconds: a minute holds there, where Vitest's 5 s did not, and a test that hangs still fails. */
vi.setConfig({ testTimeout: 60_000 });

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const script = path.join(packageRoot, "src/preset/tasks.ts");

/** The line every framework file opens with, but CLAUDE.md, and AGENTS.md, whose block has markers of its own. */
const header =
  "# This file is managed by basis-ui: `vp run sync` rewrites it from the installed @basis/ui, and `vp run verify` fails when it differs.";

/** The environment without git's own variables, which a commit hook sets. */
const environment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);

let app = "";

function run(...args: string[]): {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
} {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: app,
    encoding: "utf8",
    env: environment,
  });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
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

/** The app as a git clone, synced and committed. */
function committedSync(): void {
  git("init", "--quiet");
  run("sync");
  git("add", ".");
  git("commit", "--quiet", "-m", "Synced");
}

beforeEach(() => {
  app = mkdtempSync(path.join(tmpdir(), "basis-ui-sync-own-"));
  mkdirSync(path.join(app, "node_modules/@basis"), { recursive: true });
  symlinkSync(packageRoot, path.join(app, "node_modules/@basis/ui"), "junction");
  write("package.json", JSON.stringify({ dependencies: { "@basis/ui": "0.0.0" }, name: "app" }));
});

afterEach(() => {
  rmSync(app, { force: true, recursive: true });
});

describe("vp run sync", () => {
  test("keeps an app's own file at a framework path, writes the rest, and says so", () => {
    write(".gitattributes", "* text=auto\n");
    write("CLAUDE.md", "# The app's own notes for Claude\n");
    const own = [
      "ERROR .gitattributes is the app's own, which vp run sync did not write, and basis-ui writes its own there: rename it, or delete it to take basis-ui's, then run vp run sync again.",
      "ERROR CLAUDE.md is the app's own, which vp run sync did not write, and basis-ui writes its own there: rename it, or delete it to take basis-ui's, then run vp run sync again.",
    ];
    const synced = run("sync");
    expect(synced.status).toBe(1);
    expect(synced.stderr.split("\n").filter((line) => line.startsWith("ERROR "))).toStrictEqual(
      own,
    );
    expect(read(".gitattributes")).toBe("* text=auto\n");
    expect(read("CLAUDE.md")).toBe("# The app's own notes for Claude\n");
    expect(read(".gitignore").split("\n", 1)[0]).toBe(header);
    expect(run("sync", "--check").stderr.trimEnd().split("\n")).toStrictEqual(own);
  });

  test("never overwrites a framework file's changes git has not committed, and says so", () => {
    committedSync();
    const edited = `${read(".vite-hooks/pre-push")}# a change not yet committed\n`;
    write(".vite-hooks/pre-push", edited);
    const synced = run("sync");
    expect({ status: synced.status, stderr: synced.stderr }).toStrictEqual({
      status: 1,
      stderr:
        "ERROR .vite-hooks/pre-push has changes git has not committed, which vp run sync would overwrite with @basis/ui 0.0.0's: commit or discard them, then run vp run sync again.\n",
    });
    expect(read(".vite-hooks/pre-push")).toBe(edited);
    git("commit", "--quiet", "-am", "An edit");
    expect(run("sync").stdout).toBe("Wrote .vite-hooks/pre-push.\n");
  });
});

describe("vp run sync, with CRLF line endings", () => {
  test("replaces the basis-ui block of an AGENTS.md saved with CRLF, rather than adding a second", () => {
    run("sync");
    write("AGENTS.md", read("AGENTS.md").replaceAll("\n", "\r\n"));
    run("sync");
    expect(read("AGENTS.md").split("<!-- basis-ui:begin").length - 1).toBe(1);
    expect(run("sync", "--check")).toMatchObject({ status: 0 });
  });

  test("names a tsconfig.json that differs only in its line endings as such", () => {
    run("sync");
    write("tsconfig.json", read("tsconfig.json").replaceAll("\n", "\r\n"));
    expect(run("sync", "--check").stderr).toBe(
      "ERROR tsconfig.json has CRLF line endings, where basis-ui writes LF: run vp run sync to write it with LF, and keep the .gitattributes it writes, which checks files out with LF.\n",
    );
    run("sync");
    expect(run("sync", "--check")).toMatchObject({ status: 0 });
  });
});

describe("vp run sync, and the deploy files it hands to the app", () => {
  const former =
    "# This file is managed by basis-ui: `vp run sync` rewrites it from the installed @basis/ui, and `vp run check-full` fails when it differs.";

  beforeEach(() => {
    run("sync");
    write("Dockerfile", `${header}\nFROM caddy:2-alpine\nCOPY dist /srv\n`);
    write(".dockerignore", `${former}\r\n*\r\n!dist\r\n`);
    write("azure-pipelines.yml", `${header}\ntrigger: none\n`);
    write("Caddyfile", ":80 {\n\tfile_server\n}\n");
  });

  test("--check names each that still carries basis-ui's header", () => {
    const check = run("sync", "--check");
    expect(check.status).toBe(1);
    expect(check.stderr.trimEnd().split("\n")).toStrictEqual(
      [".dockerignore", "Dockerfile", "azure-pipelines.yml"].map(
        (file) =>
          `ERROR ${file} carries basis-ui's header, and @basis/ui 0.0.0 no longer manages it: run vp run sync to remove the header, and the file is the app's own.`,
      ),
    );
  });

  test("removes the header, this version's or an earlier one's, and keeps the rest and its line endings", () => {
    expect(run("sync").stdout).toBe(
      [".dockerignore", "Dockerfile", "azure-pipelines.yml"]
        .map((file) => `Handed ${file} to the app: basis-ui's header removed.\n`)
        .join(""),
    );
    expect(read("Dockerfile")).toBe("FROM caddy:2-alpine\nCOPY dist /srv\n");
    expect(read(".dockerignore")).toBe("*\r\n!dist\r\n");
    expect(read("azure-pipelines.yml")).toBe("trigger: none\n");
    expect(read("Caddyfile")).toBe(":80 {\n\tfile_server\n}\n");
  });

  test("never writes or checks them again, so the app edits them as its own", () => {
    run("sync");
    write("Dockerfile", "FROM registry.example.com/caddy:2.10\nUSER caddy\n");
    expect(run("sync", "--check")).toMatchObject({ status: 0 });
    expect(run("sync").stdout).toBe("The framework's files match @basis/ui 0.0.0.\n");
    expect(read("Dockerfile")).toBe("FROM registry.example.com/caddy:2.10\nUSER caddy\n");
  });
});
