/* `vp build` writes FILE.gz and FILE.br beside each built file over 1 KB that compression helps, so a server sends the
 * smaller one the browser accepts without compressing on every request: basis-api serves them, and so does the
 * template's image. Brotli runs at its best quality, 11, for files under 1 MB, and at 9 for larger ones, such as
 * parallax's wasm, where 11 takes seconds for a few percent more. Every file compresses at once, on libuv's threads. */

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";

import type { Plugin, ResolvedConfig } from "vite-plus";

const brotli = promisify(brotliCompress);
const gzipped = promisify(gzip);

/** Files smaller than this gain too little to be worth a second request path. */
const minimumBytes = 1024;
/** Past this, Brotli's best quality costs seconds for a few percent. */
const largeBytes = 1_000_000;
const bestQuality = 11;
const largeQuality = 9;
const gzipLevel = 9;

/** The kinds of file compression helps; images, fonts and archives are compressed already. */
const compressible = new Set([
  ".html",
  ".js",
  ".mjs",
  ".css",
  ".json",
  ".svg",
  ".wasm",
  ".txt",
  ".xml",
  ".map",
  ".arrow",
]);

/** Every file under `folder`. */
async function filesUnder(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

/** Writes `file`.gz and `file`.br beside it, if it is a kind and a size compression helps. */
async function precompress(file: string): Promise<void> {
  if (!compressible.has(path.extname(file))) {
    return;
  }
  const { size } = await stat(file);
  if (size <= minimumBytes) {
    return;
  }
  const bytes = await readFile(file);
  const quality = bytes.length > largeBytes ? largeQuality : bestQuality;
  const [gz, br] = await Promise.all([
    gzipped(bytes, { level: gzipLevel }),
    brotli(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: quality } }),
  ]);
  await Promise.all([writeFile(`${file}.gz`, gz), writeFile(`${file}.br`, br)]);
}

/** Writes the .gz and .br of every file under `outDir` that compression helps. */
async function precompressFolder(outDir: string): Promise<void> {
  const files = await filesUnder(outDir);
  await Promise.all(files.map(async (file) => precompress(file)));
}

/** The plugin, for `vp build` only: after the build is written, every file in its output folder gets its .gz and .br. */
function precompressPlugin(): Plugin {
  let outDir = "dist";
  return {
    apply: "build",
    async closeBundle() {
      await precompressFolder(outDir);
    },
    configResolved(config: ResolvedConfig) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    name: "basis:precompress",
  };
}

export { precompressFolder, precompressPlugin };
