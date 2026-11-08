/* A temporary app for fixture mode's tests: this package linked in as `node_modules/@basis/ui`, as an installed app
 * has it, basis's sample document, as packages/example pins it, and the files a test gives it. */

import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const example = path.join(packageRoot, "../example");

/** An empty JSON answer. */
const emptyList = { body: [], media_type: "application/json", status: 200 };

/** A record of the sample API's `operation`, asked as `request`, such as `GET /conventions`, answered by `response`. */
function record(
  operation: string,
  request: string,
  response: Readonly<Record<string, unknown>> = emptyList,
): string {
  const [method, requestPath] = request.split(" ");
  return JSON.stringify({
    format: "basis-ui-fixture/1",
    operation_id: operation,
    recorded_at: "2026-11-06T14:30:00Z",
    request: { method, path: requestPath },
    response,
  });
}

/** Writes `contents` to `file` in the app at `root`, making its folder. */
function writeIn(root: string, file: string, contents: string): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), contents);
}

/** A new app holding `files`, by their names from its root; the caller removes it with `removeApp`. */
function makeApp(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(path.join(tmpdir(), "basis-ui-fixture-app-"));
  mkdirSync(path.join(root, "node_modules/@basis"), { recursive: true });
  symlinkSync(packageRoot, path.join(root, "node_modules/@basis/ui"), "junction");
  copyFileSync(path.join(example, "openapi.json"), path.join(root, "openapi.json"));
  for (const [file, contents] of Object.entries(files)) {
    writeIn(root, file, contents);
  }
  return root;
}

function removeApp(root: string): void {
  rmSync(root, { force: true, recursive: true });
}

export { emptyList, example, makeApp, record, removeApp, writeIn };
