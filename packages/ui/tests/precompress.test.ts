import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

import { build } from "vite-plus";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { precompressFolder, precompressPlugin } from "#preset/precompress.ts";

const out = mkdtempSync(path.join(tmpdir(), "basis-precompress-"));
const script = "export const answer = 42;\n".repeat(200);
const js = path.join(out, "assets", "index-abc123.js");

beforeAll(async () => {
  mkdirSync(path.join(out, "assets"), { recursive: true });
  writeFileSync(js, script);
  writeFileSync(path.join(out, "index.html"), "<!doctype html><title>x</title>");
  writeFileSync(path.join(out, "assets", "logo.png"), Buffer.alloc(4096, 1));
  await precompressFolder(out);
});

afterAll(() => {
  rmSync(out, { force: true, recursive: true });
});

describe(precompressFolder, () => {
  test("a compressible file over 1 KB gets a .gz and a .br that read back to it", () => {
    expect(gunzipSync(readFileSync(`${js}.gz`)).toString()).toBe(script);
    expect(brotliDecompressSync(readFileSync(`${js}.br`)).toString()).toBe(script);
  });

  test("a file of 1 KB or less, or one compressed already, gets neither", () => {
    expect(existsSync(path.join(out, "index.html.br"))).toBe(false);
    expect(existsSync(path.join(out, "assets", "logo.png.gz"))).toBe(false);
  });
});

describe(precompressPlugin, () => {
  test("leaves a failed build's error alone, with no dist/ to compress", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "basis-precompress-failed-"));
    try {
      writeFileSync(
        path.join(root, "index.html"),
        '<!doctype html><title>x</title><script type="module" src="./main.js"></script>',
      );
      writeFileSync(path.join(root, "main.js"), "export const broken = ;\n");
      const built = build({
        configFile: false,
        logLevel: "silent",
        plugins: [precompressPlugin()],
        root,
      });
      await expect(built).rejects.toThrow(/main\.js/u);
      await expect(built).rejects.not.toThrow(/ENOENT/u);
      expect(existsSync(path.join(root, "dist"))).toBe(false);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
