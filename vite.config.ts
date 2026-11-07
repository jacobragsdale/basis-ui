import { defineConfig } from "vite-plus";

import { basisPreset } from "./packages/ui/src/preset/index.ts";

// This repo checks its own code with the preset every app uses, so the packages meet the rules they ship.
const preset = basisPreset();
const { lint } = preset;

/* Parallax's Rust and its Angular layer keep their own checks (cargo, and ESLint and Prettier) until roadmap step 2.6
 * replaces that layer with React, so the root checks skip them, the Rust's configuration, and the docs written to their
 * width. The package `@basis/parallax` beside them, its TypeScript and React, is checked here as `@basis/ui` is. */
const parallax = [
  "packages/parallax/web/**",
  "packages/parallax/crates/**",
  "packages/parallax/.cargo/**",
  "packages/parallax/*.toml",
  "packages/parallax/docs/**",
  "packages/parallax/schema/**",
  "packages/parallax/*.md",
];
/* Generated code is regenerated rather than edited: protoc-gen-es writes the protocol's TypeScript, and wasm-bindgen
 * the engine's glue and its declaration, which CI checks still match the Rust and the .proto. */
const parallaxGenerated = ["packages/parallax/src/proto/**", "packages/parallax/wasm/**"];
/* Test fixtures that a script writes, one case a line, are rewritten by their script rather than formatted, and their
 * tests fail when the script has changed since. */
const generatedFixtures = "packages/*/tests/fixtures/*.json";
// A spike's reference code runs in the spike's own throwaway project, whose dependencies this workspace lacks.
const spikeCode = ["docs/spikes/**/*.ts", "docs/spikes/**/*.mjs"];
// The repo's own scripts, package tests and the preset run in Node, unlike an app's code, which runs in a browser.
const nodeCode = ["packages/*/scripts/**", "packages/*/tests/**", "packages/ui/src/preset/**"];

export default defineConfig({
  fmt: {
    ...preset.fmt,
    ignorePatterns: [
      ...(preset.fmt.ignorePatterns ?? []),
      ...parallax,
      ...parallaxGenerated,
      generatedFixtures,
    ],
  },
  lint: {
    ...lint,
    ignorePatterns: [
      ...(lint.ignorePatterns ?? []),
      ...parallax,
      ...parallaxGenerated,
      ...spikeCode,
    ],
    overrides: [
      ...(lint.overrides ?? []),
      { files: nodeCode, rules: { "import/no-nodejs-modules": "off" } },
    ],
  },
  run: {
    cache: true,
  },
  staged: {
    ...preset.staged,
    "packages/parallax/**/*.rs": "rustfmt --edition 2024",
  },
});
