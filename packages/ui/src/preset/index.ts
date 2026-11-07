/* `@basis/ui/preset`: what a basis-ui repo's `vite.config.ts` is made of. An app's whole configuration is
 *
 *   export default defineConfig({ ...basisPreset(), plugins: basisPlugins(), test: basisTest() });
 *
 * so every UI repo checks, builds and tests the same way, and an upgrade of `@basis/ui` changes all of them at once. */

import { lazyPlugins } from "vite-plus";
import type { PluginOption, ViteUserConfig } from "vite-plus";
import type { OxlintConfig } from "vite-plus/lint";

import { lint } from "./lint.ts";

type Task = NonNullable<NonNullable<ViteUserConfig["run"]>["tasks"]>[string];

/** What `basisPreset()` returns. Its `lint` and `staged` are always set, so a repo can spread them to add its own. */
interface BasisPreset extends ViteUserConfig {
  readonly lint: OxlintConfig;
  readonly staged: Readonly<Record<string, string>>;
}

/** A task a later roadmap step builds. Until then it fails with one line that says so. */
function notYet(task: string, step: string): Task {
  const message = `ERROR vp run ${task} is not built yet: it arrives in basis-ui roadmap step ${step}; upgrade @basis/ui once that release is out.`;
  return { cache: false, command: `node -e "console.error('${message}'); process.exit(1)"` };
}

/** The checks, formatting, staged-file checks and tasks every UI repo shares. */
function basisPreset(): BasisPreset {
  return {
    fmt: {},
    lint,
    run: {
      tasks: {
        // Screenshot comparison in WSL joins these in step 1.6.
        "check-full": { command: ["vp check", "vp test"] },
        "client-pull": notYet("client-pull", "1.3"),
        docs: notYet("docs", "1.7"),
        doctor: notYet("doctor", "1.7"),
        review: notYet("review", "1.7"),
        shot: notYet("shot", "1.6"),
        sync: notYet("sync", "1.7"),
        upgrade: notYet("upgrade", "1.7"),
      },
    },
    staged: { "*": "vp check --fix" },
  };
}

/** React with the React Compiler, which fails the build on any component it cannot optimize, and Tailwind. They load
 * only when a command needs them, so `vp lint` and `vp fmt` stay fast. */
function basisPlugins(): PluginOption[] {
  return (
    lazyPlugins(async () => {
      const [
        { default: react, reactCompilerPreset },
        { default: babel },
        { default: tailwindcss },
      ] = await Promise.all([
        import("@vitejs/plugin-react"),
        import("@rolldown/plugin-babel"),
        import("@tailwindcss/vite"),
      ]);
      return [
        react(),
        babel({ presets: [reactCompilerPreset({ panicThreshold: "all_errors" })] }),
        tailwindcss(),
      ];
    }) ?? []
  );
}

/** Vitest in a real browser: headless Chromium through Playwright, as the screenshots and the desktops use. */
async function basisTest(): Promise<NonNullable<ViteUserConfig["test"]>> {
  const { playwright } = await import("vite-plus/test/browser-playwright");
  return {
    browser: {
      enabled: true,
      headless: true,
      instances: [{ browser: "chromium" }],
      provider: playwright(),
    },
  };
}

export { basisPlugins, basisPreset, basisTest };
export type { BasisPreset };
