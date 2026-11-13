/* An app's bundler keeps only the @basis/ui components the app imports: the package's `sideEffects` names only its
 * stylesheets, so a module whose exports go unused is dropped, and `cva` is declared free of side effects, so a
 * variant made at module scope and never used goes too. The package builds one module for each of its own (its
 * vite.config.ts), so the published build keeps them apart: the bundles below are of dist/, as an app installs it,
 * which `vp run @basis/ui#build` writes. */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "vite-plus";
import { afterAll, describe, expect, test, vi } from "vite-plus/test";
import { z } from "zod";

/* Each test here starts Node on a task, the compiler, a build, a browser or vp, which a busy CI runner can make take
 * many seconds: a minute holds there, where Vitest's 5 s did not, and a test that hangs still fails. */
vi.setConfig({ testTimeout: 60_000 });

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const manifestSchema = z.object({ sideEffects: z.array(z.string()) });

/** A built module of the package, failing with the fix when the package has not been built. */
function built(file: string): string {
  const absolute = path.join(packageRoot, "dist", file);
  expect(existsSync(absolute), "run vp run @basis/ui#build first: this bundles its dist/").toBe(
    true,
  );
  return absolute;
}

/** Whether a bundled module id is the package's own, which the bundle keeps, rather than a dependency. */
function isOwn(id: string): boolean {
  return id.startsWith(".") || path.isAbsolute(id);
}

/** The code an app's build keeps of `source`, an entry module, without its dependencies or minifying. */
async function bundled(root: string, source: string): Promise<string> {
  const entry = path.join(root, "main.ts");
  writeFileSync(entry, source);
  const output = await build({
    build: {
      lib: { entry, formats: ["es"] },
      minify: false,
      rolldownOptions: { external: (id) => !isOwn(id) },
      write: false,
    },
    configFile: false,
    logLevel: "silent",
    root,
  });
  const results = Array.isArray(output) ? output : [output];
  const chunks = results.flatMap((result) => ("output" in result ? result.output : []));
  return chunks.map((chunk) => ("code" in chunk ? chunk.code : "")).join("\n");
}

describe("tree-shaking", () => {
  const root = mkdtempSync(path.join(tmpdir(), "basis-ui-shake-"));
  afterAll(() => {
    rmSync(root, { force: true, recursive: true });
  });

  test("the package declares its stylesheets as its only side effects", () => {
    const text = readFileSync(path.join(packageRoot, "package.json"), "utf8");
    const manifest = manifestSchema.parse(JSON.parse(text));
    expect(manifest.sideEffects).toStrictEqual(["**/*.css"]);
  });

  test("an app that imports Badge bundles Badge and none of the components it does not import", async () => {
    const code = await bundled(
      root,
      `import { Badge } from ${JSON.stringify(built("index.mjs"))};\nexport { Badge };\n`,
    );
    expect(code).toContain("function Badge(");
    const absent = ["dialog-overlay", "sidebar-wrapper", "data-table", "buttonVariants"];
    expect(absent.filter((text) => code.includes(text))).toStrictEqual([]);
    // A module-scope React context, which only `sideEffects` lets the bundler drop.
    expect(code).not.toContain("createContext");
  });

  test("a variant made at module scope and never used is dropped with its classes", async () => {
    /* Rolldown finds the call pure on its own; the annotation, which the build keeps, tells a bundler that does not
     * look inside the function. */
    expect(readFileSync(built("vendor/cva/cva.mjs"), "utf8")).toContain(
      "/* @__NO_SIDE_EFFECTS__ */\nfunction cva(",
    );
    const cva = JSON.stringify(built("vendor/cva/cva.mjs"));
    const code = await bundled(
      root,
      `import { cva } from ${cva};\nconst unused = cva("never-drawn");\nconst used = cva("drawn");\nexport { used };\n`,
    );
    expect(code).toContain('"drawn"');
    expect(code).not.toContain("never-drawn");
  });
});
