/* `vp run upgrade`, run as the preset runs it: Node on src/preset/tasks.ts, in an app's root, a temporary git clone
 * with @basis/ui 0.1.0 installed. `vp` is upgrade/fake-vp.ts, first on the PATH, and the feed a folder of releases, as
 * upgrade/fixture.ts makes them. */

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { after, before, environment, git as gitIn, makeFixture, write } from "./upgrade/fixture.ts";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const script = path.join(packageRoot, "src/preset/tasks.ts");

let folder = "";
let app = "";
let feed = "";

function git(...args: string[]): string {
  return gitIn(app, ...args);
}

function upgrade(
  args: readonly string[],
  extra: Readonly<Record<string, string>> = {},
): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  const result = spawnSync(process.execPath, [script, "upgrade", ...args], {
    cwd: app,
    encoding: "utf8",
    env: {
      ...environment,
      FAKE_APP: app,
      FAKE_FEED: feed,
      FAKE_WATCH: "src/report.ts",
      PATH: `${path.join(folder, "bin")}${path.delimiter}${process.env["PATH"] ?? ""}`,
      ...extra,
    },
  });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

function logged(): readonly string[] {
  try {
    return readFileSync(path.join(feed, "log"), "utf8").trimEnd().split("\n");
  } catch {
    return [];
  }
}

beforeEach(() => {
  ({ app, feed, folder } = makeFixture());
});

afterEach(() => {
  rmSync(folder, { force: true, recursive: true });
});

describe("vp run upgrade", () => {
  test("refuses a version not written exactly", () => {
    expect(upgrade(["^0.4"]).stderr).toBe(
      "ERROR vp run upgrade takes one version at most, written exactly, and --dry-run: run vp run upgrade for the latest release, or vp run upgrade VERSION, such as vp run upgrade 0.4.0, with --dry-run to see what it would do.\n",
    );
  });

  test("names the fix when vp cannot be run", () => {
    // git alone on the PATH, since the upgrade asks git first whether the tree is clean.
    const bin = path.join(folder, "only-git");
    mkdirSync(bin);
    symlinkSync(execFileSync("which", ["git"], { encoding: "utf8" }).trim(), path.join(bin, "git"));
    expect(upgrade([], { PATH: bin }).stderr).toBe(
      "ERROR vp run upgrade could not run vp (spawnSync vp ENOENT): check that Vite+'s vp is on the PATH, as vp --version shows, then run vp run upgrade again.\n",
    );
  });

  test("refuses a working tree with changes not committed, and runs nothing", () => {
    write(path.join(app, "src/draft.ts"), "export const draft = 1;\n");
    const result = upgrade([]);
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(
      "ERROR the working tree has changes not committed, which the upgrade's own would mix with: commit them, or stash them with git stash, then run vp run upgrade again.\n",
    );
    expect(logged()).toStrictEqual([]);
  });

  test("says there is nothing to upgrade when the installed version is the latest", () => {
    writeFileSync(path.join(feed, "latest"), "0.1.0\n");
    const result = upgrade([]);
    expect(result).toStrictEqual({
      status: 0,
      stderr: "",
      stdout: "@basis/ui 0.1.0 is installed, the latest release, so there is nothing to upgrade.\n",
    });
    expect(logged()).toStrictEqual(["app vp info @basis/ui dist-tags.latest"]);
  });

  test("refuses a version older than the installed one", () => {
    const result = upgrade(["0.0.9"]);
    expect(result.stderr).toBe(
      "ERROR @basis/ui 0.1.0 is installed, newer than 0.0.9, and vp run upgrade moves only forward: to go back, revert the commit that upgraded it.\n",
    );
  });

  test("refuses @basis/ui linked from a workspace, which the feed does not move", () => {
    write(
      path.join(app, "package.json"),
      JSON.stringify({ dependencies: { "@basis/ui": "workspace:*" } }),
    );
    git("commit", "--quiet", "-am", "Linked");
    expect(upgrade([]).stderr).toBe(
      "ERROR @basis/ui is linked from this workspace (workspace:*), so it moves with the workspace, not from the feed: run vp run sync when it changes, and vp run upgrade in an app that installs it from the feed.\n",
    );
  });

  test("installs both packages, prints the changelog between, syncs, runs the codemod, then verifies", () => {
    const result = upgrade([]);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(logged()).toStrictEqual([
      "app vp info @basis/ui dist-tags.latest",
      "app vp add --save-exact @basis/ui@0.2.0 @basis/parallax@0.2.0",
      "app vp run sync",
      "app vp run verify",
      ...`verify saw ${after.trimEnd()}`.split("\n"),
    ]);
    expect(readFileSync(path.join(app, "src/report.ts"), "utf8")).toBe(after);
    expect(result.stdout).toContain("## 0.2.0 - 2026-12-01");
    expect(result.stdout).toContain("## 0.1.1 - 2026-11-20\n\n- A fix of the shell's sidebar.");
    expect(result.stdout).not.toContain("## 0.1.0");
    expect(result.stdout).toContain(
      [
        "codemod 0.2.0/fetch-rule-name, which renames eslint/no-restricted-globals to basis/no-fetch in the comments that turn it off, changes:",
        "     src/report.ts",
        "         1 - // oxlint-disable-next-line eslint/no-restricted-globals -- a download outside the client.",
        "         1 + // oxlint-disable-next-line basis/no-fetch -- a download outside the client.",
      ].join("\n"),
    );
    expect(result.stdout.trimEnd().split("\n").slice(-7)).toStrictEqual([
      "Upgraded @basis/ui and @basis/parallax from 0.1.0 to 0.2.0: vp run sync wrote the framework's files, 1 codemod changed 1 file, and vp run verify passed.",
      "What to look at:",
      "  - git diff: the framework's files and what the codemods changed, before you commit.",
      "  - What the changelog asks of the app, which no codemod does:",
      "    - 0.2.0: nothing, since a codemod renames it in disable comments.",
      "    - 0.2.0: move a page's buttons into `actions`.",
      "Then commit package.json, the lockfile and the changed files together.",
    ]);
  });

  test("ends with the summary and one ERROR line when verify fails", () => {
    const result = upgrade(["0.2.0"], { FAKE_VERIFY_STATUS: "1" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      "Upgraded @basis/ui and @basis/parallax from 0.1.0 to 0.2.0: vp run sync wrote the framework's files, 1 codemod changed 1 file, and vp run verify failed.",
    );
    expect(result.stderr).toBe(
      "ERROR @basis/ui 0.2.0 is installed, its files synced and its codemods run, but vp run verify fails, as its output above says: fix what it says, then commit the upgrade.\n",
    );
  });

  test("an upgrade to 0.1.1 runs no codemod of 0.2.0's", () => {
    const result = upgrade(["0.1.1"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No codemod ships between the two.");
    expect(result.stdout).not.toContain("## 0.2.0");
    expect(readFileSync(path.join(app, "src/report.ts"), "utf8")).toBe(before);
  });

  test("names the fix when the feed has no such version", () => {
    const result = upgrade(["0.3.0"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("ERR_PNPM_NO_MATCHING_VERSION");
    expect(result.stderr.trimEnd().split("\n").at(-1)).toBe(
      "ERROR vp add could not install @basis/ui and @basis/parallax at 0.3.0, as its output above says: check that the feed has that version, with vp info @basis/ui versions, then run vp run upgrade again.",
    );
  });
});

describe("vp run upgrade --dry-run", () => {
  test("prints the changelog and each codemod's change, and changes nothing", () => {
    write(path.join(app, "src/draft.ts"), "export const draft = 1;\n");
    const result = upgrade(["--dry-run"]);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      [
        "Dry run, which changes nothing: @basis/ui 0.1.0 is installed, and vp run upgrade 0.2.0 would move @basis/ui and @basis/parallax to 0.2.0.",
        "",
        "What changed, from @basis/ui 0.2.0's CHANGELOG.md:",
        "",
        "## 0.2.0 - 2026-12-01",
        "",
        "- The rule that refuses `fetch` is `basis/no-fetch`. What to do: nothing, since a codemod renames it in",
        "  disable comments.",
        "- `Page` takes `actions`. What to do: move a page's buttons into `actions`.",
        "",
        "## 0.1.1 - 2026-11-20",
        "",
        "- A fix of the shell's sidebar.",
        "",
        "What vp run upgrade 0.2.0 would do:",
        "  1. vp add --save-exact @basis/ui@0.2.0 @basis/parallax@0.2.0",
        "  2. vp run sync, which writes the framework's files from 0.2.0",
        "  3. codemod 0.2.0/fetch-rule-name, which renames eslint/no-restricted-globals to basis/no-fetch in the comments that turn it off, changes:",
        "          src/report.ts",
        "              1 - // oxlint-disable-next-line eslint/no-restricted-globals -- a download outside the client.",
        "              1 + // oxlint-disable-next-line basis/no-fetch -- a download outside the client.",
        "  4. vp run verify",
        "",
        "What the changelog asks of the app, which no codemod does:",
        "  - 0.2.0: nothing, since a codemod renames it in disable comments.",
        "  - 0.2.0: move a page's buttons into `actions`.",
        "The working tree has changes not committed, and vp run upgrade 0.2.0 refuses to start until they are committed or stashed.",
        "Run vp run upgrade 0.2.0 to upgrade.",
        "",
      ].join("\n"),
    );
    expect(readFileSync(path.join(app, "src/report.ts"), "utf8")).toBe(before);
    expect(readFileSync(path.join(app, "package.json"), "utf8")).toContain('"@basis/ui":"0.1.0"');
    expect(logged()).toStrictEqual([
      "app vp info @basis/ui dist-tags.latest",
      "elsewhere vp add --save-exact --ignore-scripts @basis/ui@0.2.0",
    ]);
  });
});
