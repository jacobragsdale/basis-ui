/* `@basis/create`'s manifest, read as `vp create @basis:app` reads it: by Vite+'s own `validateManifest`, taken from the
 * installed `vite-plus` rather than copied, since nothing runs `vp create` against a registry before one exists. A
 * Vite+ release that renames it fails the test by name. And the template's pins, held to the repo's own. */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { expect, test } from "vite-plus/test";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.join(packageRoot, "../..");
const template = path.join(packageRoot, "../create/templates/app");

type Validate = (raw: unknown, name: string) => unknown;

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

/** The source of Vite+'s functions that read a `@scope/create` manifest, from `OrgManifestSchemaError` to
 * `validateManifest`. */
function readerSource(): string {
  const vitePlus = path.dirname(createRequire(import.meta.url).resolve("vite-plus/package.json"));
  const source = readFileSync(path.join(vitePlus, "dist/create/bin.js"), "utf8");
  const start = source.indexOf("var OrgManifestSchemaError = class");
  const last = source.indexOf("function validateManifest(raw, packageName) {");
  const end = source.indexOf("\n}\n", last);
  if (start === -1 || last < start || end < last) {
    throw new Error("Vite+'s create no longer has OrgManifestSchemaError and validateManifest");
  }
  return source.slice(start, end + 2);
}

/** The `validateManifest` a loaded module exports. */
function exported(loaded: unknown): Validate {
  const validateManifest =
    typeof loaded === "object" && loaded !== null && "validateManifest" in loaded
      ? loaded.validateManifest
      : undefined;
  if (typeof validateManifest !== "function") {
    throw new TypeError("Vite+'s validateManifest did not load");
  }
  return (raw, name): unknown => {
    const result: unknown = Reflect.apply(validateManifest, undefined, [raw, name]);
    return result;
  };
}

/** Vite+'s `validateManifest`, made into a module of its own and loaded. */
async function vitePlusValidateManifest(): Promise<Validate> {
  const folder = mkdtempSync(path.join(tmpdir(), "basis-ui-manifest-"));
  const file = path.join(folder, "validate.mjs");
  writeFileSync(
    file,
    `import path from "node:path";\n${readerSource()}\nexport { validateManifest };\n`,
  );
  try {
    return exported(await import(pathToFileURL(file).href));
  } finally {
    rmSync(folder, { force: true, recursive: true });
  }
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

test("vp create reads @basis/create's manifest, and finds the template at the path it names", async () => {
  const validateManifest = await vitePlusValidateManifest();
  const manifest = readJson(path.join(packageRoot, "../create/package.json"));
  expect(validateManifest(manifest, "@basis/create")).toMatchObject([
    { name: "app", template: "./templates/app" },
  ]);
  expect(readJson(path.join(template, "package.json"))).toMatchObject({ name: "basis-ui-app" });
});

test("the copy of Vite+'s reader refuses a template named by path, as Vite+ 1.5.0 does", async () => {
  const validateManifest = await vitePlusValidateManifest();
  const entry = { description: "An app", name: "app", path: "./t" };
  expect(() => validateManifest({ createConfig: { templates: [entry] } }, "@basis/create")).toThrow(
    "createConfig.templates[0].template must be a non-empty string",
  );
});

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
