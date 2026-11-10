import { basisPlugins, basisPreset, basisTest } from "@basis/ui/preset";
import { defineConfig } from "vite-plus";

export default defineConfig({
  ...basisPreset({ budget: { "/": { css: 25, js: 180 } } }),
  plugins: basisPlugins(),
  test: await basisTest(),
});
