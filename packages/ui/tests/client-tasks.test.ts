/* `vp run client-pull` and `vp run client-check`, run as the preset runs them: Node on src/preset/client.ts, in an
 * app's root. The app is a temporary folder with this package linked in as `node_modules/@basis/ui`, as an installed
 * app has it, so `@basis/ui/mutator` resolves; the API repo is a temporary git repo holding, under a tag, basis's
 * sample document, as packages/example pins it. */

import { execFileSync, spawnSync } from "node:child_process";
import {
  appendFileSync,
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

import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { z } from "zod";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const script = path.join(packageRoot, "src/preset/client.ts");
const sampleDocument = path.join(packageRoot, "../example/openapi.json");

/** A JSON document's members. */
const membersSchema = z.record(z.string(), z.unknown());

function membersOf(file: string): Record<string, unknown> {
  return membersSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

let app = "";
let apiRepo = "";

/** The environment without git's own variables, which a commit hook sets: with them, git would act on this repo
 * rather than the one named. */
const environment = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")),
);

/** Runs a client task in the app, as `vp run client-TASK ARGS` does. */
function run(task: "check" | "pull", ...args: string[]): Run {
  const result = spawnSync(process.execPath, [script, task, ...args], {
    cwd: app,
    encoding: "utf8",
    env: environment,
  });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

function git(...args: string[]): void {
  execFileSync(
    "git",
    ["-C", apiRepo, "-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
    { env: environment, stdio: "ignore" },
  );
}

beforeAll(() => {
  app = mkdtempSync(path.join(tmpdir(), "basis-ui-app-"));
  mkdirSync(path.join(app, "node_modules/@basis"), { recursive: true });
  symlinkSync(packageRoot, path.join(app, "node_modules/@basis/ui"), "junction");
  apiRepo = mkdtempSync(path.join(tmpdir(), "basis-ui-api-repo-"));
  // The document as basis writes it in the API's repo: with basis's marker, not the example's.
  const members = Object.entries(membersOf(sampleDocument)).filter(([key]) => key !== "x-basis-ui");
  writeFileSync(
    path.join(apiRepo, "openapi.json"),
    JSON.stringify({
      "x-basis": "managed by basis: `basis sync` rewrites it",
      ...Object.fromEntries(members),
    }),
  );
  git("init", "--quiet");
  git("add", "openapi.json");
  git("commit", "--quiet", "--message", "The API's document");
  git("tag", "v1.4.0");
});

afterAll(() => {
  rmSync(app, { force: true, recursive: true });
  rmSync(apiRepo, { force: true, recursive: true });
});

describe("vp run client-pull", () => {
  test("copies the document at a tag, marked with where it came from rather than as basis's", () => {
    const result = run("pull", apiRepo, "v1.4.0");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const pinned = membersOf(path.join(app, "openapi.json"));
    expect(Object.keys(pinned).slice(0, 2)).toStrictEqual(["x-basis-ui", "openapi"]);
    expect(pinned["x-basis-ui"]).toBe(
      `copied by vp run client-pull from ${apiRepo} at v1.4.0; pull it again rather than edit it`,
    );
    expect(pinned).not.toHaveProperty("x-basis");
  });

  test("generates hooks that call @basis/ui's mutator, and ask a dataset route for Arrow", () => {
    expect(run("pull", apiRepo, "v1.4.0").status).toBe(0);
    const client = readFileSync(path.join(app, "src/api/generated/client.ts"), "utf8");
    expect(client).toContain("import { apiFetch } from '@basis/ui/mutator';");
    expect(client).toContain("import type { ErrorType } from '@basis/ui/mutator';");
    expect(client).toContain("export function useConventions");
    expect(client).toContain("headers: { 'Accept': `application/vnd.apache.arrow.stream`");
  });

  test.each([
    [["../positions-api"], /^ERROR vp run client-pull \.\.\/positions-api needs the tag/u],
    [
      ["https://positions.example/api/openapi.json", "v1"],
      /^ERROR vp run client-pull takes no tag/u,
    ],
    [["a", "b", "c"], /^ERROR vp run client-pull takes a source and a tag at most/u],
  ])("refuses the arguments %o with one line that ends with the fix", (args, message) => {
    const result = run("pull", ...args);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(message);
    expect(result.stderr.trimEnd().split("\n")).toHaveLength(1);
    expect(result.stderr).toContain("such as vp run client-pull ../positions-api v1.4.0");
  });

  test("names a tag the repo does not have", () => {
    const result = run("pull", apiRepo, "v9.9.9");
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /^ERROR v9\.9\.9 has no .*openapi\.json in its git repo: name a tag/u,
    );
  });
});

describe("vp run client-check", () => {
  test("passes while the client is what the document generates", () => {
    run("pull");
    const result = run("check");
    expect(result.stdout).toBe("src/api/generated matches openapi.json.\n");
    expect(result.status).toBe(0);
  });

  test("fails on an edited, an added or a removed file, one line each", () => {
    const generated = path.join(app, "src/api/generated");
    appendFileSync(path.join(generated, "client.ts"), "// edited\n");
    writeFileSync(path.join(generated, "extra.ts"), "export {};\n");
    rmSync(path.join(generated, "model/bond.zod.ts"));
    const result = run("check");
    expect(result.status).toBe(1);
    const fix =
      "run vp run client-pull to regenerate the client from openapi.json, and never edit src/api/generated by hand.";
    expect(result.stderr.trimEnd().split("\n")).toStrictEqual([
      `ERROR src/api/generated/client.ts differs from what openapi.json generates: ${fix}`,
      `ERROR src/api/generated/extra.ts is not one openapi.json generates: ${fix}`,
      `ERROR src/api/generated/model/bond.zod.ts is missing, though openapi.json generates it: ${fix}`,
    ]);
    expect(run("pull").status).toBe(0);
    expect(run("check").status).toBe(0);
  });
});
