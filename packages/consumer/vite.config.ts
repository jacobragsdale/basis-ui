import { basisPlugins, basisPreset, basisTest } from "@basis/ui/preset";
import { defineConfig } from "vite-plus";

export default defineConfig({
  ...basisPreset(),
  plugins: basisPlugins(),
  test: await basisTest(),
});
