import { basisPlugins } from "@basis/ui/preset";
import { defineConfig } from "vite-plus";

// The end-to-end harness: a page of grids over the Angular demo's generated datasets, built and served as static
// files, as `in-image.sh` does.
export default defineConfig({
  plugins: basisPlugins(),
  root: import.meta.dirname,
});
