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
      // The theme studio's: the themes' inputs, the generator and checkTheme, which no app imports.
      "src/theming/index.ts",
      // basisTest() runs it by its path before each test file.
      "src/testing/fixtures-setup.ts",
      // vp run upgrade imports each release's codemods by their paths (src/preset/codemods.ts).
      "src/codemods/*/*.ts",
    ],
    /* The fixture-mode plugin makes this module in an app's vp test; the package never holds it. culori, a dev
     * dependency, is the one package bundled into dist/, and its licence ships beside it, in licenses/culori/: the
     * build fails on any other, which needs its licence there too before it joins the list. */
    deps: { neverBundle: [/^virtual:basis\//u], onlyBundle: ["culori"] },
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
