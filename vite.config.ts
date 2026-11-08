import { defineConfig } from "vite-plus";

import { basisPreset } from "./packages/ui/src/preset/index.ts";

// This repo checks its own code with the preset every app uses, so the packages meet the rules they ship.
const preset = basisPreset();
const { lint } = preset;

/* Parallax's Rust keeps its own checks (cargo), so the root checks skip it, its configuration, and the docs written to
 * its width. The package `@basis/parallax` beside it, its TypeScript and React, is checked here as `@basis/ui` is. */
const parallax = [
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
const nodeCode = [
  "packages/*/scripts/**",
  "packages/*/tests/**",
  "packages/ui/src/preset/**",
  "packages/ui/src/catalogue/**",
  "packages/*/vite.config.ts",
];

export default defineConfig({
  fmt: {
    ...preset.fmt,
    ignorePatterns: [
      ...(preset.fmt.ignorePatterns ?? []),
      ...parallax,
      ...parallaxGenerated,
      generatedFixtures,
      // Written by `vp run @basis/ui#catalogue` as JSON.stringify writes it, which its test compares exactly.
      "packages/ui/catalogue.json",
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
      /* @basis/ui's components and parallax are the formatters the preset sends apps to, so they may round and format
       * numbers themselves. */
      {
        files: [
          "packages/ui/src/**",
          "packages/parallax/src/**",
          "packages/*/tests/**",
          "packages/*/scripts/**",
        ],
        rules: { "eslint/no-restricted-properties": "off" },
      },
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
