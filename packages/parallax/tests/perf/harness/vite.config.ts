import { basisPlugins } from "@basis/ui/preset";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

// The package's build, which the harness runs as an app runs the published package: `vp run @basis/parallax#build`.
const dist = (file: string): string =>
  fileURLToPath(new URL(`../../../dist/${file}`, import.meta.url));

// The scale harness: one page on the package's build, built and served as static files by tests/perf/bench.ts, with
// the datasets it writes beside the page in data/.
export default defineConfig({
  base: "./",
  build: { emptyOutDir: true, outDir: "dist" },
  plugins: basisPlugins(),
  resolve: {
    alias: [
      { find: /^@basis\/parallax$/u, replacement: dist("index.mjs") },
      { find: /^@basis\/parallax\/worker$/u, replacement: dist("worker.mjs") },
    ],
  },
  root: import.meta.dirname,
  worker: { format: "es" },
});
