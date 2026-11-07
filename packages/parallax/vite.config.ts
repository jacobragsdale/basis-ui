import babel from "@rolldown/plugin-babel";
import { basisPlugins, basisTest } from "@basis/ui/preset";
import { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

// The Rust the engine is built from: the wasm task runs again only when one of these changes.
const rust = [
  "crates/**",
  "Cargo.toml",
  "Cargo.lock",
  "rust-toolchain.toml",
  ".cargo/config.toml",
  "scripts/build-wasm.ts",
];

export default defineConfig({
  pack: {
    dts: {
      generator: "tsgo",
    },
    entry: ["src/index.ts", "src/worker.ts"],
    /* The worker's bundle loads the engine from beside itself, where wasm-bindgen's glue looks for it, so an app's
     * bundler finds it as an asset of the worker. */
    copy: [{ from: "wasm/parallax_wasm_bg.wasm", to: "dist" }],
    // The React Compiler, as `@basis/ui` builds with it: a hook that breaks the rules of React fails the build.
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
  plugins: basisPlugins(),
  run: {
    tasks: {
      build: { command: "vp pack", dependsOn: ["wasm"] },
      // The charts' end-to-end specs, in the pinned Playwright image (tests/e2e/charts/run.ts); never cached, as they drive
      // a browser against a build of the harness.
      "charts-e2e": { cache: false, command: "node tests/e2e/charts/run.ts", dependsOn: ["wasm"] },
      // The browser tests run the built worker too, as an app gets it.
      test: { command: "vp test", dependsOn: ["build"] },
      wasm: {
        cache: {
          // What changes the module, and where cargo and rustup keep their files, which tasks otherwise never see.
          env: ["CARGO_BUILD_JOBS", "RUSTFLAGS"],
          input: rust,
          output: ["wasm/**"],
          untrackedEnv: ["CARGO_HOME", "CARGO_TARGET_DIR", "RUSTUP_HOME", "RUSTUP_TOOLCHAIN"],
        },
        command: "node scripts/build-wasm.ts",
      },
    },
  },
  test: {
    projects: [
      // The core's logic, in Node.
      { extends: true, test: { include: ["tests/unit/**/*.test.ts"], name: "unit" } },
      // The engine's real worker, the theme's CSS and the React layer, in Chromium.
      {
        extends: true,
        test: {
          include: ["tests/browser/**/*.test.{ts,tsx}"],
          name: "browser",
          ...(await basisTest()),
        },
      },
    ],
  },
});
