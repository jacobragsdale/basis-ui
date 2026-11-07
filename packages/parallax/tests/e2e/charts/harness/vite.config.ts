// The end-to-end harness, built as an app is: @basis/ui's plugins, with React and the React Compiler.
import { basisPlugins } from "@basis/ui/preset";
import { defineConfig } from "vite-plus";

export default defineConfig({
  build: { emptyOutDir: true, outDir: "../dist" },
  plugins: basisPlugins(),
  worker: { format: "es" },
});
