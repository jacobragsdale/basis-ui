/* `vp run sync` for an app that is a package of a larger pnpm workspace, as packages/example is of basis-ui's: pnpm
 * and Vite read the nearest pnpm-workspace.yaml, so the app gets none of its own, which would split the workspace and
 * leave `vp dev` refusing every file outside the app. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { planSync } from "#preset/sync.ts";

let repo = "";

/** The paths `vp run sync` writes in the app at `folder`, from the repo's root. */
async function written(folder: string): Promise<readonly string[]> {
  const plan = await planSync(path.join(repo, folder));
  return plan.wanted.map((file) => file.path);
}

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), "basis-ui-workspace-"));
  writeFileSync(
    path.join(repo, "pnpm-workspace.yaml"),
    'packages:\n  - "apps/*" # every app\n  - "!apps/legacy"\n\ncatalogMode: strict\n',
  );
  for (const folder of ["apps/web", "apps/legacy", "templates/app"]) {
    mkdirSync(path.join(repo, folder), { recursive: true });
  }
});

afterEach(() => {
  rmSync(repo, { force: true, recursive: true });
});

describe("vp run sync in a pnpm workspace", () => {
  test("writes no pnpm-workspace.yaml for an app the workspace above it holds", async () => {
    expect(await written("apps/web")).not.toContain("pnpm-workspace.yaml");
    expect(await written("apps/web")).toContain("Dockerfile");
  });

  test("writes it for an app the workspace leaves out, or that is a workspace's root", async () => {
    expect(await written("apps/legacy")).toContain("pnpm-workspace.yaml");
    expect(await written("templates/app")).toContain("pnpm-workspace.yaml");
    expect(await written("")).toContain("pnpm-workspace.yaml");
  });
});
