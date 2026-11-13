/* Running `vp run upgrade` as the preset runs it, Node on src/preset/tasks.ts in the fixture's app, with the fake `vp`
 * first on the PATH, and reading what the fake logged. */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { environment } from "./fixture.ts";
import type { Fixture } from "./fixture.ts";

const script = fileURLToPath(new URL("../../src/preset/tasks.ts", import.meta.url));

interface Ran {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** `vp run upgrade ARGS` in the fixture's app, with `extra` in its environment. */
function runUpgrade(
  { app, feed, folder }: Fixture,
  args: readonly string[],
  extra: Readonly<Record<string, string>> = {},
): Ran {
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

/** Each call the fake `vp` logged in the fixture's feed. */
function loggedIn({ feed }: Fixture): readonly string[] {
  try {
    return readFileSync(path.join(feed, "log"), "utf8").trimEnd().split("\n");
  } catch {
    return [];
  }
}

export { loggedIn, runUpgrade };
