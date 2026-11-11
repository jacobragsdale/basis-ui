import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      /* The template, proven (scripts/prove.ts): an app made from the packed template outside the workspace, installed
       * from the packed packages, and checked as its developer checks it. Never cached, so it sees the whole
       * environment, and an app made from the template is made anew each time. */
      prove: {
        cache: false,
        command: "node scripts/prove.ts",
        // The engine's WebAssembly comes built, in @basis/parallax's tarball, as an app receives it.
        dependsOn: ["@basis/ui#build", "@basis/parallax#build"],
      },
    },
  },
});
