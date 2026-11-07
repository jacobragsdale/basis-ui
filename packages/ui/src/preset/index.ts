/* `@basis/ui/preset`: what a basis-ui repo's `vite.config.ts` is made of. An app's whole configuration is
 *
 *   export default defineConfig({ ...basisPreset(), plugins: basisPlugins(), test: basisTest() });
 *
 * so every UI repo checks, builds and tests the same way, and an upgrade of `@basis/ui` changes all of them at once. */

import { fileURLToPath } from "node:url";

import { lazyPlugins } from "vite-plus";
import type { PluginOption, ViteUserConfig } from "vite-plus";
import type { OxlintConfig } from "vite-plus/lint";

import { headScriptPlugin } from "./head-script.ts";
import { lint } from "./lint.ts";

type Task = NonNullable<NonNullable<ViteUserConfig["run"]>["tasks"]>[string];

/** What `basisPreset()` returns. Its `fmt`, `lint` and `staged` are always set, so a repo can spread them to add its
 * own. */
interface BasisPreset extends ViteUserConfig {
  readonly fmt: NonNullable<ViteUserConfig["fmt"]>;
  readonly lint: OxlintConfig;
  readonly staged: Readonly<Record<string, string>>;
}

/** A task a later roadmap step builds. Until then it fails with one line that says so. */
function notYet(task: string, step: string): Task {
  const message = `ERROR vp run ${task} is not built yet: it arrives in basis-ui roadmap step ${step}; upgrade @basis/ui once that release is out.`;
  return { cache: false, command: `node -e "console.error('${message}'); process.exit(1)"` };
}

/** The client tasks' script, beside this module: TypeScript in basis-ui's own workspace, JavaScript once built, since
 * Node runs no TypeScript from node_modules. */
const clientScript = fileURLToPath(
  new URL(import.meta.url.endsWith(".ts") ? "client.ts" : "client.mjs", import.meta.url),
);

/** A client task: `pull` or `check`, as src/preset/client.ts describes them. Neither is cached, since `pull` reads a
 * repo or a network and `check` must compare the files as they are. */
function clientTask(verb: "check" | "pull"): Task {
  return { cache: false, command: `node "${clientScript}" ${verb}` };
}

/** With `BASIS_API_URL` set, such as `http://127.0.0.1:8000`, `vp dev` sends `/api` to that API with the prefix
 * removed, as the ingress does, so the app runs against a live API on the desktop; without it, nothing is proxied. */
function apiProxy(): Pick<ViteUserConfig, "server"> {
  const target = process.env["BASIS_API_URL"];
  if (target === undefined || target === "") {
    return {};
  }
  return {
    server: {
      proxy: {
        "/api": { changeOrigin: true, rewrite: (url) => url.replace(/^\/api/u, ""), target },
      },
    },
  };
}

/** The checks, formatting, staged-file checks and tasks every UI repo shares, and the proxy to a live API. */
function basisPreset(): BasisPreset {
  return {
    ...apiProxy(),
    fmt: {
      // The generated client is never formatted, and the API's document is a copy, rewritten by `vp run client-pull`.
      ignorePatterns: ["**/src/api/generated/**", "openapi.json"],
    },
    lint,
    run: {
      tasks: {
        // Screenshot comparison in WSL joins these in step 1.6.
        "check-full": { command: ["vp run client-check", "vp check", "vp test"] },
        "client-check": clientTask("check"),
        "client-pull": clientTask("pull"),
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

/** React with the React Compiler, which fails the build on any component it cannot optimize, Tailwind, the head
 * script that applies the stored mode and density before the first paint, written into the app's index.html, and, in
 * `vp dev` and `vp test` only, MSW's service worker at `/mockServiceWorker.js`, so tests serve the generated client's
 * handlers. They load only when a command needs them, so `vp lint` and `vp fmt` stay fast. */
function basisPlugins(): PluginOption[] {
  return (
    lazyPlugins(async () => {
      const [
        { default: react, reactCompilerPreset },
        { default: babel },
        { default: tailwindcss },
        { msw },
      ] = await Promise.all([
        import("@vitejs/plugin-react"),
        import("@rolldown/plugin-babel"),
        import("@tailwindcss/vite"),
        import("msw/vite"),
      ]);
      return [
        headScriptPlugin(),
        react(),
        babel({ presets: [reactCompilerPreset({ panicThreshold: "all_errors" })] }),
        tailwindcss(),
        // Worker-only: the app starts the worker itself, in a test or in fixture mode, and no build carries it.
        { ...msw({ mode: "worker-only" }), apply: "serve" },
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
