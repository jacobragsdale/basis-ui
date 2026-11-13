/* `vp run upgrade` when it stops part-way, and `vp run upgrade --continue`, which runs the steps it did not: the app
 * and the feed upgrade/fixture.ts makes, the fake `vp` failing a step when the test says. And the toolchain an upgrade
 * moves with @basis/ui, its pins on vite-plus and typescript. */

import { readFileSync, rmSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { after, before, git as gitIn, makeFixture, write } from "./upgrade/fixture.ts";
import type { Fixture } from "./upgrade/fixture.ts";
import { loggedIn, runUpgrade } from "./upgrade/run.ts";

/* Each test here starts Node on a task, the compiler, a build, a browser or vp, which a busy CI runner can make take
 * many seconds: a minute holds there, where Vitest's 5 s did not, and a test that hangs still fails. */
vi.setConfig({ testTimeout: 60_000 });

let fixture: Fixture = { app: "", feed: "", folder: "" };

function upgrade(
  args: readonly string[],
  extra: Readonly<Record<string, string>> = {},
): ReturnType<typeof runUpgrade> {
  return runUpgrade(fixture, args, extra);
}

function git(...args: string[]): string {
  return gitIn(fixture.app, ...args);
}

function readApp(file: string): string {
  return readFileSync(path.join(fixture.app, file), "utf8");
}

beforeEach(() => {
  fixture = makeFixture();
});

afterEach(() => {
  rmSync(fixture.folder, { force: true, recursive: true });
});

/** The ERROR line of an upgrade from 0.1.0 to 0.2.0 that stopped at `step`, after `ran`, which `left` would finish. */
function stopped(step: string, ran: string, left: string): string {
  return `ERROR the upgrade of @basis/ui from 0.1.0 to 0.2.0 stopped at ${step}, after ${ran} ran: fix what the lines above say, then run vp run upgrade --continue, which runs ${left}; or undo the upgrade with git restore . and git clean -fd ., since it began on a clean tree, then vp install.`;
}

describe("an upgrade that stops part-way", () => {
  test("says which steps ran and which did not", () => {
    const failed = upgrade(["0.2.0"], { FAKE_SYNC_STATUS: "1" });
    expect(failed.status).toBe(1);
    expect(failed.stderr.trimEnd().split("\n")).toStrictEqual([
      "ERROR vp run sync failed for @basis/ui 0.2.0, as its ERROR lines above say: fix what they say.",
      stopped("sync", "install", "sync, codemods and verify"),
    ]);
    expect(readApp("src/report.ts")).toBe(before);
  });

  test("--continue runs the steps that did not run, and then has nothing to continue", () => {
    upgrade(["0.2.0"], { FAKE_SYNC_STATUS: "1" });
    rmSync(path.join(fixture.feed, "log"));
    const continued = upgrade(["--continue"]);
    expect({ status: continued.status, stderr: continued.stderr }).toStrictEqual({
      status: 0,
      stderr: "",
    });
    expect(loggedIn(fixture).filter((line) => line.startsWith("app "))).toStrictEqual([
      "app vp run sync",
      "app vp install",
      "app vp run verify",
    ]);
    expect(readApp("src/report.ts")).toBe(after);
    expect(continued.stdout).toContain(
      "Upgraded @basis/ui and @basis/parallax from 0.1.0 to 0.2.0: vp run sync wrote the framework's files, 1 codemod changed 1 file, and vp run verify passed.",
    );
    expect(upgrade(["--continue"]).stderr).toBe(
      "ERROR no upgrade stopped part-way in this clone, so there is nothing to continue: run vp run upgrade to start one.\n",
    );
  });

  test("a file a codemod cannot change stops it after the others are written, and --continue runs it again", () => {
    write(path.join(fixture.app, "src/broken.ts"), "export const = ;\n");
    git("add", ".");
    git("commit", "--quiet", "-m", "A file that does not parse");
    const failed = upgrade(["0.2.0"]);
    expect(failed.stderr.trimEnd().split("\n")).toStrictEqual([
      expect.stringMatching(
        /^ERROR codemod 0\.2\.0\/fetch-rule-name could not change src\/broken\.ts \(.+\): make the change its changelog entry describes in that file by hand\.$/u,
      ),
      stopped("codemods", "install and sync", "codemods and verify"),
    ]);
    expect(readApp("src/report.ts")).toBe(after);
    write(path.join(fixture.app, "src/broken.ts"), "export const fixed = 1;\n");
    expect(upgrade(["--continue"])).toMatchObject({ status: 0, stderr: "" });
  });

  test("--continue after the upgrade was undone says so, and forgets it", () => {
    upgrade(["0.2.0"], { FAKE_SYNC_STATUS: "1" });
    git("checkout", "--", ".");
    write(
      path.join(fixture.app, "node_modules/@basis/ui/package.json"),
      JSON.stringify({ name: "@basis/ui", version: "0.1.0" }),
    );
    expect(upgrade(["--continue"]).stderr).toBe(
      "ERROR the upgrade that stopped moved @basis/ui to 0.2.0, but 0.1.0 is installed, so it was undone: run vp run upgrade to start again.\n",
    );
    expect(upgrade(["--continue"]).stderr).toContain("ERROR no upgrade stopped part-way");
  });

  test("a changelog the installed version cannot read is named, and the upgrade goes on", () => {
    write(
      path.join(fixture.feed, "@basis/ui/0.2.0/CHANGELOG.md"),
      "# Changelog\n\n## 0.2.0 - 2026-12-01\n\nNot an entry.\n",
    );
    const result = upgrade(["0.2.0"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "@basis/ui 0.2.0's CHANGELOG.md could not be read (CHANGELOG.md line 5 is neither an entry nor part of one), so what changed is not listed here: read it with vp run docs ui/changelog.",
    );
  });
});

/** A release 0.2.0 that peers on vite-plus 1.6.0 and overrides TypeScript to 7.1.0, both in the feed, and an app that
 * pins vite-plus 1.5.0 and TypeScript 7.0.2. */
function newToolchain(): void {
  write(
    path.join(fixture.app, "package.json"),
    JSON.stringify({
      dependencies: { "@basis/parallax": "0.1.0", "@basis/ui": "0.1.0" },
      devDependencies: { typescript: "7.0.2", "vite-plus": "1.5.0" },
    }),
  );
  git("commit", "--quiet", "-am", "Pins");
  const ui = path.join(fixture.feed, "@basis/ui/0.2.0");
  write(
    path.join(ui, "package.json"),
    JSON.stringify({
      name: "@basis/ui",
      peerDependencies: { "vite-plus": "1.6.0" },
      version: "0.2.0",
    }),
  );
  write(path.join(ui, "sync/pnpm-workspace.yaml"), "overrides:\n  typescript: 7.1.0\n");
  for (const [name, version] of [
    ["vite-plus", "1.6.0"],
    ["typescript", "7.1.0"],
  ] as const) {
    write(
      path.join(fixture.feed, name, version, "package.json"),
      JSON.stringify({ name, version }),
    );
  }
}

describe("the toolchain an upgrade moves", () => {
  test("moves the app's exact pins on vite-plus and typescript to the versions the release needs, after sync", () => {
    newToolchain();
    expect(upgrade(["0.2.0"]).stderr).toBe("");
    expect(
      loggedIn(fixture).filter((line) => line.startsWith("app vp ") && !line.includes(" saw ")),
    ).toStrictEqual([
      "app vp add --save-exact @basis/ui@0.2.0 @basis/parallax@0.2.0",
      "app vp run sync",
      "app vp add --save-exact -D vite-plus@1.6.0 typescript@7.1.0",
      "app vp run verify",
    ]);
    expect(JSON.parse(readApp("package.json"))).toMatchObject({
      devDependencies: { typescript: "7.1.0", "vite-plus": "1.6.0" },
    });
  });
});
