import { basisPlugins, basisPreset, basisTest } from "@basis/ui/preset";
import { defineConfig } from "vite-plus";

export default defineConfig({
  ...basisPreset({
    // What each route may load, in kilobytes gzipped, which `vp run budget` holds the build to: what each loaded on
    // 2026-11-11 and a little more. The shell is about 300; parallax adds about 170.
    budget: {
      "/": { css: 30, js: 490 },
      "/blotter": { css: 30, js: 530 },
      "/book": { css: 30, js: 320 },
      "/bonds/ATL000A02": { css: 30, js: 320 },
      "/curves": { css: 30, js: 490 },
      "/import": { css: 30, js: 320 },
      "/pnl-explain": { css: 30, js: 490 },
      "/positions": { css: 30, js: 490 },
      "/probe": { css: 30, js: 490 },
      "/relative-value": { css: 30, js: 490 },
    },
  }),
  plugins: basisPlugins(),
  test: await basisTest(),
});
