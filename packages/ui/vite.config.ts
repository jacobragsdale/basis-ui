import babel from "@rolldown/plugin-babel";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    /* One module out for each module in, so an app's bundler drops every component it does not import: the package's
     * `sideEffects` names only its stylesheets, and `cva` is declared free of side effects. Bundled into one
     * module, an app of one card paid for the whole library. */
    unbundle: true,
    dts: {
      generator: "tsgo",
    },
    entry: [
      "src/index.ts",
      "src/preset/index.ts",
      "src/preset/orval.ts",
      "src/preset/client.ts",
      "src/preset/shot.ts",
      "src/preset/tasks.ts",
      // Oxlint loads the preset's lint plugin by its path, so it is a module of its own.
      "src/preset/lint-plugin.ts",
      "src/fixtures/index.ts",
      "src/numbers/index.ts",
      "src/utils/index.ts",
      "src/dates/index.ts",
      "src/securities/index.ts",
      "src/testing/index.ts",
    ],
    /* The React Compiler, as `basisPlugins()` applies it to an app: a component that breaks the rules of React fails
     * the package's build rather than shipping unoptimized. `vp pack` runs with NODE_ENV=development, which would
     * otherwise add the compiler's hot-reload checks to the published code. */
    plugins: [
      babel({
        presets: [
          reactCompilerPreset({
            environment: { enableResetCacheOnSourceFileChanges: false },
            panicThreshold: "all_errors",
          }),
        ],
      }),
    ],
  },
});
