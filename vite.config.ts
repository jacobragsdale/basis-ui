import { defineConfig } from "vite-plus";

import { basisPreset } from "./packages/ui/src/preset/index.ts";

// This repo checks its own code with the preset every app uses, so the packages meet the rules they ship.
const preset = basisPreset();
const { lint } = preset;

/* Parallax keeps its own checks (cargo, and ESLint and Prettier for its Angular layer) until roadmap step 2.6 replaces
 * that layer with React, so the root checks skip it. */
const parallax = "packages/parallax/**";
// A spike's reference code runs in the spike's own throwaway project, whose dependencies this workspace lacks.
const spikeCode = ["docs/spikes/**/*.ts", "docs/spikes/**/*.mjs"];
// The repo's own scripts, package tests and the preset run in Node, unlike an app's code, which runs in a browser.
const nodeCode = ["packages/*/scripts/**", "packages/*/tests/**", "packages/ui/src/preset/**"];

export default defineConfig({
  fmt: {
    ignorePatterns: [parallax],
  },
  lint: {
    ...lint,
    ignorePatterns: [...(lint.ignorePatterns ?? []), parallax, ...spikeCode],
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
