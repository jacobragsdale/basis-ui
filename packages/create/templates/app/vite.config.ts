import { basisPlugins, basisPreset, basisTest } from "@basis/ui/preset";
import { defineConfig } from "vite-plus";

export default defineConfig({
  // What each route may load, in kilobytes gzipped, which `vp run budget` holds the build to.
  ...basisPreset({
    budget: {
      "/": { css: 25, js: 250 },
      "/bonds/US91282CRF04": { css: 25, js: 255 },
      "/conventions": { css: 25, js: 250 },
    },
  }),
  plugins: basisPlugins(),
  test: await basisTest(),
});
