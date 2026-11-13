/* The template's pins, held to the repo's own: Node and pnpm, and the Node an install refuses below. `@basis/create`
 * names no `createConfig`, since a repo is made with its own creator, `vp dlx @basis/create NAME`, rather than with
 * `vp create`, which rewrites the app (docs/design.md, A UI repo); create-app.test.ts tests the creator. */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vite-plus/test";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.join(packageRoot, "../..");
const template = path.join(packageRoot, "../create/templates/app");

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

/** A manifest's pins: its `engines` and `devEngines`. */
function pins(value: unknown): unknown {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return {
    devEngines: "devEngines" in value ? value.devEngines : undefined,
    engines: "engines" in value ? value.engines : undefined,
  };
}

test("the template pins Node and pnpm as the repo does, and refuses an older Node at install with the fix", () => {
  const app = readJson(path.join(template, "package.json"));
  const repo = readJson(path.join(repoRoot, "package.json"));
  expect(pins(app)).toStrictEqual(pins(repo));
  const nodeVersion = readFileSync(path.join(repoRoot, ".node-version"), "utf8");
  expect(readFileSync(path.join(template, ".node-version"), "utf8")).toBe(nodeVersion);
  const preinstall: unknown = expect.stringContaining("run vp env on");
  expect(app).toMatchObject({ scripts: { preinstall } });
  expect(readJson(path.join(packageRoot, "package.json"))).toMatchObject({
    engines: { node: ">=26.0.0" },
  });
});

test("@basis/create names no createConfig, so vp create @basis:app offers no template it would rewrite", () => {
  expect(readJson(path.join(packageRoot, "../create/package.json"))).not.toHaveProperty(
    "createConfig",
  );
});
