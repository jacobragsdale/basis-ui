import { defineConfig } from "vite-plus";

// The workspace's checks. Step 1.2 replaces this lint block with the preset from spike 0.1.
// Parallax keeps its own checks (cargo, and ESLint and Prettier for its Angular layer) until roadmap step 2.6 replaces
// that layer with React, so the root checks skip it.
const parallax = "packages/parallax/**";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
    "packages/parallax/**/*.rs": "rustfmt --edition 2024",
  },
  fmt: {
    ignorePatterns: [parallax],
  },
  lint: {
    ignorePatterns: [parallax],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    categories: { correctness: "error" },
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: true,
  },
});
