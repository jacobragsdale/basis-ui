/* `@basis/create`'s creator, `vp dlx @basis/create NAME`, run as Node runs its bin: the app it makes is the template,
 * under the folder's name, with `.gitignore` back and a git repository; it refuses a folder that holds something, and a
 * name no package can take, each with one ERROR line ending in the fix. The proof (packages/create/scripts/prove.ts)
 * runs it through `vp dlx` from the packed tarball, and the app through every check. */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

/* Each test here starts Node on a task, the compiler, a build, a browser or vp, which a busy CI runner can make take
 * many seconds: a minute holds there, where Vitest's 5 s did not, and a test that hangs still fails. */
vi.setConfig({ testTimeout: 60_000 });

const creator = fileURLToPath(new URL("../../create/bin/create.mjs", import.meta.url));
const template = fileURLToPath(new URL("../../create/templates/app", import.meta.url));

const environment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);

let folder = "";

function create(...args: string[]): {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
} {
  const ran = spawnSync(process.execPath, [creator, ...args], {
    cwd: folder,
    encoding: "utf8",
    env: environment,
  });
  return { status: ran.status, stderr: ran.stderr, stdout: ran.stdout };
}

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), "basis-create-"));
});

afterEach(() => {
  rmSync(folder, { force: true, recursive: true });
});

/** The names the app holds, but git's, sorted. */
function appFiles(app: string): readonly string[] {
  return readdirSync(app)
    .filter((name) => name !== ".git")
    .toSorted();
}

describe("vp dlx @basis/create NAME", () => {
  test("makes the template at NAME, named after it, with .gitignore and a git repository", () => {
    const made = create("positions-ui");
    expect({ status: made.status, stderr: made.stderr }).toStrictEqual({ status: 0, stderr: "" });
    expect(made.stdout).toContain("\n  cd positions-ui\n  vp install\n");
    const app = path.join(folder, "positions-ui");
    const expected = readdirSync(template).map((name) =>
      name === "_gitignore" ? ".gitignore" : name,
    );
    expect(appFiles(app)).toStrictEqual(expected.toSorted());
    expect(readFileSync(path.join(app, ".gitignore"), "utf8")).toBe(
      readFileSync(path.join(template, "_gitignore"), "utf8"),
    );
    const page = readFileSync(path.join(app, "index.html"), "utf8");
    expect(`${readFileSync(path.join(app, "package.json"), "utf8")}${page}`).toMatch(
      /"name": "positions-ui"[\s\S]*<title>positions-ui<\/title>/u,
    );
    expect(existsSync(path.join(app, ".git"))).toBe(true);
  });

  test("refuses a folder that holds something, and names the fix", () => {
    mkdirSync(path.join(folder, "positions-ui"));
    writeFileSync(path.join(folder, "positions-ui/notes.txt"), "mine\n");
    const made = create("positions-ui");
    expect(made.status).toBe(1);
    expect(made.stderr).toBe(
      `ERROR ${path.join(folder, "positions-ui")} exists and is not empty, and @basis/create makes a new app: name a new folder, or empty this one, then run it again.\n`,
    );
    expect(readdirSync(path.join(folder, "positions-ui"))).toStrictEqual(["notes.txt"]);
  });

  test("refuses no name, two names, or one no package can take", () => {
    const usage = "run vp dlx @basis/create NAME, such as vp dlx @basis/create positions-ui.";
    expect(create().stderr).toBe(
      `ERROR @basis/create takes the new app's folder alone: ${usage}\n`,
    );
    expect(create("a", "b").stderr).toBe(
      `ERROR @basis/create takes the new app's folder alone: ${usage}\n`,
    );
    expect(create("Positions UI").stderr).toBe(
      `ERROR Positions UI cannot name the app's package, which takes lowercase letters, digits, dots, dashes and underscores: ${usage}\n`,
    );
  });
});
