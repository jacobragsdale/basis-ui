import { fileURLToPath } from "node:url";

import { defineConfig } from "vite-plus";

import { basisPreset } from "./packages/ui/src/preset/index.ts";
import { appLimits, libraryLimits } from "./packages/ui/src/preset/lint.ts";

// This repo checks its own code with the preset every app uses, so the packages meet the rules they ship.
const preset = basisPreset();
const { lint } = preset;
/* The gallery's, parallax's and the demo's suites are basis-ui's own browser tests, of drawing, focus and layout, not an
 * app's: they keep Vitest's browser API, as the preset allows a `*.browser.test.tsx` file to. */
const browserTestRules = lint.overrides?.find(({ files }) =>
  files.includes("**/*.browser.test.tsx"),
)?.rules;
const browserSuites = [
  "packages/gallery/**/*.test.{ts,tsx}",
  "packages/parallax/**/*.test.{ts,tsx}",
  "packages/parallax-demo/**/*.test.{ts,tsx}",
];

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
/* The two apps, written as an app's agent or ctzd writes one, take the app's limits; the rest of the repo keeps
 * basis-ui's own, as strict as before they were loosened for apps. */
const apps = ["packages/example/**", "packages/consumer/**"];
// A spike's reference code runs in the spike's own throwaway project, whose dependencies this workspace lacks.
const spikeCode = ["docs/spikes/**/*.ts", "docs/spikes/**/*.mjs"];
/* Every shipped theme passes `checkTheme`, reported at its file by the repo's own rule (check-themes-plugin.ts): a lint
 * rule is how a check runs in every `vp check`, the commit hook's and CI's, at no cost of a step of its own. */
const themeFiles = "packages/ui/src/theme/themes/*.ts";
// The repo's own scripts, package tests, the preset and this file run in Node, unlike an app's code, which runs in a browser.
const nodeCode = [
  "packages/*/scripts/**",
  "packages/*/tests/**",
  "packages/ui/src/preset/**",
  "packages/ui/src/codemods/**",
  "packages/ui/src/catalogue/**",
  "packages/*/vite.config.ts",
  "vite.config.ts",
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
    rules: { ...lint.rules, ...libraryLimits },
    jsPlugins: [
      ...(lint.jsPlugins ?? []),
      {
        name: "basis-ui",
        specifier: fileURLToPath(
          new URL("packages/ui/scripts/check-themes-plugin.ts", import.meta.url),
        ),
      },
    ],
    ignorePatterns: [
      ...(lint.ignorePatterns ?? []),
      ...parallax,
      ...parallaxGenerated,
      ...spikeCode,
      // The app template is checked as a generated app, by its own config, once installed (roadmap 1.7).
      "packages/create/templates/**",
    ],
    overrides: [
      // Before the preset's overrides, so that a test in an app still turns off what tests turn off.
      { files: apps, rules: appLimits },
      ...(lint.overrides ?? []),
      ...(browserTestRules === undefined
        ? []
        : [{ files: browserSuites, rules: browserTestRules }]),
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
      { files: [themeFiles], rules: { "basis-ui/check-theme": "error" } },
      // Oxlint loads a JS plugin from its module's default export.
      {
        files: ["packages/ui/scripts/check-themes-plugin.ts"],
        rules: { "import/no-default-export": "off" },
      },
      /* basis-ui's own client layers fetch what no generated client serves: @basis/ui's is the `apiFetch` the
       * generated client calls, and the demo's and the charts' harness's read their datasets' files. An app's src/api
       * may not. */
      {
        files: [
          "packages/ui/src/api/**",
          "packages/parallax-demo/src/api/**",
          "packages/parallax/tests/e2e/charts/harness/src/api/**",
        ],
        rules: { "basis/no-fetch": "off" },
      },
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
