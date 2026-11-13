/* What the tasks say when git will not read a clone, or the clone holds files not committed: `vp run doctor` in a clone
 * git holds to be another user's, as a folder under /mnt/c in WSL is, names git's own fix rather than `git init`; and
 * `vp run upgrade` and verify's record name the files that stop them, and `.git/info/exclude` for one git should never
 * see. Run as the preset runs them, Node on src/preset/tasks.ts in a temporary app; git's refusal comes from a stand-in
 * for git, first on the PATH, which answers `rev-parse` as git does for such a clone. */

import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { uiVersion } from "./ui-version.ts";

import { recordCheck } from "#preset/review.ts";

/* Each test here starts Node on a task, the compiler, a build, a browser or vp, which a busy CI runner can make take
 * many seconds: a minute holds there, where Vitest's 5 s did not, and a test that hangs still fails. */
vi.setConfig({ testTimeout: 60_000 });

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const script = path.join(packageRoot, "src/preset/tasks.ts");

const environment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);

let app = "";

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
  app = mkdtempSync(path.join(tmpdir(), "basis-ui-git-"));
  mkdirSync(path.join(app, "node_modules/@basis"), { recursive: true });
  symlinkSync(packageRoot, path.join(app, "node_modules/@basis/ui"), "junction");
  write("package.json", JSON.stringify({ dependencies: { "@basis/ui": uiVersion }, name: "app" }));
  write(".gitignore", "node_modules/\n");
  write(".npmrc", "registry=http://127.0.0.1:9/\n");
  git("init", "--quiet");
  git("add", ".");
  git("commit", "--quiet", "-m", "An app");
});

afterEach(() => {
  rmSync(app, { force: true, recursive: true });
});

describe("a clone git will not read", () => {
  test.skipIf(process.platform === "win32")(
    "vp run doctor names git's own fix, not git init",
    () => {
      const bin = mkdtempSync(path.join(tmpdir(), "basis-ui-git-bin-"));
      const real = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
      writeFileSync(
        path.join(bin, "git"),
        `#!/bin/sh\nif [ "$1" = "rev-parse" ]; then\n  echo "fatal: detected dubious ownership in repository at '/mnt/c/apps/positions'" >&2\n  exit 128\nfi\nexec "${real}" "$@"\n`,
      );
      chmodSync(path.join(bin, "git"), 0o755);
      const ran = spawnSync(process.execPath, [script, "doctor"], {
        cwd: app,
        encoding: "utf8",
        env: { ...environment, PATH: `${bin}${path.delimiter}${process.env["PATH"] ?? ""}` },
      });
      rmSync(bin, { force: true, recursive: true });
      expect(ran.stderr).toContain(
        `ERROR git will not read this clone, since another user owns /mnt/c/apps/positions ("detected dubious ownership"), as for a folder under /mnt/c in WSL or a redirected one: run git config --global --add safe.directory /mnt/c/apps/positions, then vp run doctor again.\n`,
      );
      expect(ran.stderr).not.toContain("git init");
    },
  );
});

describe("files not committed", () => {
  test("vp run upgrade names them, and .git/info/exclude for a file git should never see", () => {
    write(".idea/workspace.xml", "<project />\n");
    write("src/draft.ts", "export const draft = 1;\n");
    const ran = spawnSync(process.execPath, [script, "upgrade", "0.2.0"], {
      cwd: app,
      encoding: "utf8",
      env: environment,
    });
    expect(ran.stderr).toBe(
      "ERROR the working tree has changes not committed (.idea/workspace.xml, src/draft.ts), which the upgrade's own would mix with: commit them, or stash them with git stash, keeping a file git should never see, as an editor's, in .git/info/exclude, then run vp run upgrade again; to finish an upgrade that stopped part-way, run vp run upgrade --continue.\n",
    );
  });

  test("verify's record names them, and .git/info/exclude", async () => {
    write(".vscode/settings.json", "{}\n");
    await expect(recordCheck(app)).resolves.toBe(
      "Not recorded for vp run review: the worktree has changes not committed (.vscode/settings.json), so no commit holds what passed; keep a file git should never see, as an editor's, in .git/info/exclude.",
    );
  });
});
