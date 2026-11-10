/* The app and the feed upgrade.test.ts runs `vp run upgrade` against: a temporary folder holding the app, a git clone
 * with @basis/ui 0.1.0 installed; the feed, a folder of releases, 0.1.1 and 0.2.0 after the installed one, 0.2.0
 * shipping the real fetch-rule-name codemod; and `bin/vp`, which runs fake-vp.ts. */

import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const fakeVp = path.join(packageRoot, "tests/upgrade/fake-vp.ts");
const realCodemod = path.join(packageRoot, "src/codemods/unreleased/fetch-rule-name.ts");

const changelog = `# Changelog

What changed.

## 0.2.0 - 2026-12-01

- The rule that refuses \`fetch\` is \`basis/no-fetch\`. What to do: nothing, since a codemod renames it in
  disable comments.
- \`Page\` takes \`actions\`. What to do: move a page's buttons into \`actions\`.

## 0.1.1 - 2026-11-20

- A fix of the shell's sidebar.

## 0.1.0 - 2026-11-15

- The first release.
`;

const before = `// oxlint-disable-next-line eslint/no-restricted-globals -- a download outside the client.
export const response = fetch("/report.csv");
`;
const after = `// oxlint-disable-next-line basis/no-fetch -- a download outside the client.
export const response = fetch("/report.csv");
`;

/** The environment without git's own variables, which a commit hook sets. */
const environment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);

/** The mode of a file anyone may run. */
const executable = 0o755;

/** The folders of one fixture: the one that holds the rest, the app, and the feed. */
interface Fixture {
  readonly folder: string;
  readonly app: string;
  readonly feed: string;
}

function write(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function git(app: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
    { cwd: app, encoding: "utf8", env: environment },
  ).trim();
}

/** A release in the feed: its package.json, and for @basis/ui its changelog and the codemod. */
function release(feed: string, name: string, version: string): void {
  const dir = path.join(feed, name, version);
  write(path.join(dir, "package.json"), JSON.stringify({ name, version }));
  if (name === "@basis/ui") {
    write(path.join(dir, "CHANGELOG.md"), changelog);
    write(
      path.join(dir, "dist/codemods/0.2.0/fetch-rule-name.mjs"),
      `export { codemod } from ${JSON.stringify(pathToFileURL(realCodemod).href)};\n`,
    );
  }
}

/** The fake vp, first on the PATH, and the feed with three releases of each package, the latest 0.2.0. */
function makeFeed({ feed, folder }: Fixture): void {
  const vp = path.join(folder, "bin/vp");
  write(vp, `#!/bin/sh\nexec "${process.execPath}" "${fakeVp}" "$@"\n`);
  chmodSync(vp, executable);
  for (const version of ["0.1.0", "0.1.1", "0.2.0"]) {
    release(feed, "@basis/ui", version);
    release(feed, "@basis/parallax", version);
  }
  write(path.join(feed, "latest"), "0.2.0\n");
}

/** The app: both packages at 0.1.0, @basis/ui installed, a file the codemod changes, all committed. */
function makeApp(app: string): void {
  write(
    path.join(app, "package.json"),
    JSON.stringify({ dependencies: { "@basis/parallax": "0.1.0", "@basis/ui": "0.1.0" } }),
  );
  write(
    path.join(app, "node_modules/@basis/ui/package.json"),
    JSON.stringify({ name: "@basis/ui", version: "0.1.0" }),
  );
  write(path.join(app, ".gitignore"), "node_modules/\n");
  write(path.join(app, "src/report.ts"), before);
  git(app, "init", "--quiet");
  git(app, "add", ".");
  git(app, "commit", "--quiet", "-m", "An app");
}

/** A new fixture, in a temporary folder of its own. */
function makeFixture(): Fixture {
  const folder = mkdtempSync(path.join(tmpdir(), "basis-ui-upgrade-"));
  const fixture = { app: path.join(folder, "app"), feed: path.join(folder, "feed"), folder };
  makeFeed(fixture);
  makeApp(fixture.app);
  return fixture;
}

export { after, before, environment, git, makeFixture, write };
export type { Fixture };
