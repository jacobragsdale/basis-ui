/* `@basis/ui/preset`: what a basis-ui repo's `vite.config.ts` is made of. An app's whole configuration is
 *
 *   export default defineConfig({ ...basisPreset(), plugins: basisPlugins(), test: basisTest() });
 *
 * so every UI repo checks, builds and tests the same way, and an upgrade of `@basis/ui` changes all of them at once. */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { lazyPlugins } from "vite-plus";
import type { Plugin, PluginOption, ViteUserConfig } from "vite-plus";
import type { OxlintConfig } from "vite-plus/lint";

import { budgetArgs } from "./budget-options.ts";
import type { Budget } from "./budget-options.ts";
import { withCompilerFixes } from "./compiler-fixes.ts";
import { headScriptPlugin } from "./head-script.ts";
import { precompressPlugin } from "./precompress.ts";
import { lint } from "./lint.ts";

type Task = NonNullable<NonNullable<ViteUserConfig["run"]>["tasks"]>[string];

/** What `basisPreset()` returns. Its `fmt`, `lint` and `staged` are always set, so a repo can spread them to add its
 * own. */
interface BasisPreset extends ViteUserConfig {
  readonly fmt: NonNullable<ViteUserConfig["fmt"]>;
  readonly lint: OxlintConfig;
  readonly staged: Readonly<Record<string, string>>;
}

/** The client tasks' script, beside this module: TypeScript in basis-ui's own workspace, JavaScript once built, since
 * Node runs no TypeScript from node_modules. */
const clientScript = fileURLToPath(
  new URL(import.meta.url.endsWith(".ts") ? "client.ts" : "client.mjs", import.meta.url),
);

/** The shot task's script, beside this module, as the client tasks' is. */
const shotScript = fileURLToPath(
  new URL(import.meta.url.endsWith(".ts") ? "shot.ts" : "shot.mjs", import.meta.url),
);

/** The framework tasks' script, beside this module, as the client tasks' is: src/preset/tasks.ts says what each does. */
const tasksScript = fileURLToPath(
  new URL(import.meta.url.endsWith(".ts") ? "tasks.ts" : "tasks.mjs", import.meta.url),
);

/** A framework task, never cached, since each reads the repo, git or the machine as they are now. */
function frameworkTask(name: string): Task {
  return { cache: false, command: `node "${tasksScript}" ${name}` };
}

/** A client task: `pull` or `check`, as src/preset/client.ts describes them. Neither is cached, since `pull` reads a
 * repo or a network and `check` must compare the files as they are. */
function clientTask(verb: "check" | "pull"): Task {
  return { cache: false, command: `node "${clientScript}" ${verb}` };
}

/** The live API `vp dev` calls, from `BASIS_API_URL`, such as `http://127.0.0.1:8000`, or `undefined` for fixture
 * mode. */
function liveApi(): string | undefined {
  const target = process.env["BASIS_API_URL"];
  return target === undefined || target === "" ? undefined : target;
}

/** With `BASIS_API_URL` set, `vp dev` sends `/api` to that API with the prefix removed, as the ingress does, so the app
 * runs against a live API on the desktop, and fixture mode is off; without it, nothing is proxied. */
function apiProxy(): Pick<ViteUserConfig, "server"> {
  const target = liveApi();
  if (target === undefined) {
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

interface BasisPresetOptions {
  /** What opening each route may load, in kilobytes gzipped, which `vp run budget` holds the build to, such as
   * `{ "/": { css: 25, js: 180 } }`. */
  readonly budget?: Budget | undefined;
}

/** `vp run budget`: the build, then each route's weight against its budget (budget.ts). */
function budgetTask(budget: Budget): Task {
  const routes = budgetArgs(budget).map((arg) => `"${arg}"`);
  return {
    cache: false,
    command: ["vp build", `node "${tasksScript}" budget ${routes.join(" ")}`],
  };
}

/** `vp run verify`, every check of the app in one verdict (verify.ts), which weighs the routes of `budget`; or
 * `check-full`, its former name, which says so and runs it. Whatever follows `vp run verify` is appended. */
function verifyTask(name: "check-full" | "verify", budget: Budget): Task {
  const routes = budgetArgs(budget).map((arg) => ` --budget "${arg}"`);
  return { cache: false, command: `node "${tasksScript}" ${name}${routes.join("")}` };
}

/** The checks, formatting, staged-file checks and tasks every UI repo shares, and the proxy to a live API. */
function basisPreset({ budget = {} }: BasisPresetOptions = {}): BasisPreset {
  return {
    ...apiProxy(),
    fmt: {
      // The generated client is never formatted, and the API's document is a copy, rewritten by `vp run client-pull`.
      ignorePatterns: ["**/src/api/generated/**", "openapi.json"],
    },
    lint,
    run: {
      tasks: {
        budget: budgetTask(budget),
        "check-full": verifyTask("check-full", budget),
        "client-check": clientTask("check"),
        "client-pull": clientTask("pull"),
        docs: frameworkTask("docs"),
        doctor: frameworkTask("doctor"),
        fixtures: frameworkTask("fixtures"),
        new: frameworkTask("new"),
        review: frameworkTask("review"),
        // Never cached: it pictures the app as it is now. src/preset/shot.ts says what it writes.
        shot: { cache: false, command: `node "${shotScript}"` },
        sync: frameworkTask("sync"),
        upgrade: frameworkTask("upgrade"),
        verify: verifyTask("verify", budget),
      },
    },
    staged: { "*": "vp check --fix" },
  };
}

/** The modules Vite crawls for dependencies in `vp test`, besides the test files Vitest names: every module of the
 * app's own. */
const appModules = "src/**/*.{ts,tsx}";

/** In `vp test`, Vite pre-bundles what every module under `src/` imports before the browser tests start. Vitest crawls
 * only the test files, so a dependency that only app code imports, such as `react-dom/client` in an app's entry, is
 * found only when a test loads that code, and then Vite bundles it and reloads every test page while the tests run,
 * which fails the tests importing at that moment. Derived from the app's modules, the list never needs keeping. */
function testDependenciesPlugin(): Plugin {
  return {
    apply: (_config, { mode }) => mode === "test",
    config: () => ({ optimizeDeps: { entries: [appModules] } }),
    name: "basis:test-dependencies",
  };
}

/** What `@basis/parallax` imports from outside the workspace's own packages, which Vite pre-bundles for it. */
const parallaxDependencies = [
  "apache-arrow",
  "@bufbuild/protobuf",
  "@bufbuild/protobuf/codegenv2",
  "cn",
  "zod",
];

/** Whether the app at `root` has `@basis/parallax` installed. */
function hasParallax(root: string): boolean {
  try {
    createRequire(path.join(root, "package.json")).resolve("@basis/parallax/package.json");
    return true;
  } catch {
    return false;
  }
}

/** `@basis/parallax` starts its engine's worker from a URL beside its own code. Vite's dependency optimizer would
 * bundle the package elsewhere, where that URL finds nothing in `vp dev`; left out of the optimizer, the package is
 * served from where it is installed, and its worker beside it. A build bundles the worker either way. Its own
 * dependencies are pre-bundled through it, so Vite does not find them mid-run and reload the page, or the tests. */
function parallaxWorkerPlugin(): Plugin {
  return {
    config: (config) =>
      hasParallax(config.root ?? process.cwd())
        ? {
            optimizeDeps: {
              exclude: ["@basis/parallax"],
              include: parallaxDependencies.map((name) => `@basis/parallax > ${name}`),
            },
          }
        : {},
    name: "basis:parallax-worker",
  };
}

/** React with the React Compiler, which fails the build on any component it cannot optimize, Tailwind, the head
 * script that applies the stored mode, density and motion before the first paint, written into the app's index.html, and, in
 * `vp dev` and `vp test` only, MSW's service worker at `/mockServiceWorker.js`, so tests serve the generated client's
 * handlers; in `vp dev`, a port of the app's own and fixture mode (fixture-mode.ts); in `vp test`, every dependency of
 * the app's modules is pre-bundled before the tests start. They load only when a command needs them, so `vp lint` and
 * `vp fmt` stay fast. */
function basisPlugins(): PluginOption[] {
  return (
    lazyPlugins(async () => {
      const [
        { default: react, reactCompilerPreset },
        { default: babel },
        { default: tailwindcss },
        { msw },
        { fixtureModePlugin },
      ] = await Promise.all([
        import("@vitejs/plugin-react"),
        import("@rolldown/plugin-babel"),
        import("@tailwindcss/vite"),
        import("msw/vite"),
        import("./fixture-mode.ts"),
      ]);
      return [
        headScriptPlugin(),
        react(),
        withCompilerFixes(
          await babel({ presets: [reactCompilerPreset({ panicThreshold: "all_errors" })] }),
        ),
        tailwindcss(),
        // Worker-only: a test starts the worker itself, and fixture mode's script does in vp dev; no build carries it.
        { ...msw({ mode: "worker-only" }), apply: "serve" },
        fixtureModePlugin({ liveApi: liveApi() }),
        testDependenciesPlugin(),
        parallaxWorkerPlugin(),
        precompressPlugin(),
      ];
    }) ?? []
  );
}

/** Tests that need a real browser, for layout, focus or pixels, and may use Vitest's browser API; every other test is
 * written with `@basis/ui/testing`, which runs in both. */
const browserOnlyTests = "**/*.browser.test.{ts,tsx}";

interface BasisTestOptions {
  /** Run in headless Chromium, as the screenshots and the desktops do: yes unless set, or unless the environment
   * variable `BASIS_TEST_DOM` is `node`. Without a browser, tests run in a Node DOM (happy-dom), and the
   * `*.browser.test.tsx` files, which need one, are left out. */
  readonly browser?: boolean;
}

/** Vitest in a real browser, headless Chromium through Playwright, or, with `browser: false` or `BASIS_TEST_DOM=node`,
 * in a Node DOM, for a machine with no Chromium. */
async function basisTest({
  browser = process.env["BASIS_TEST_DOM"] !== "node",
}: BasisTestOptions = {}): Promise<NonNullable<ViteUserConfig["test"]>> {
  if (!browser) {
    const { configDefaults } = await import("vite-plus/test/config");
    return { environment: "happy-dom", exclude: [...configDefaults.exclude, browserOnlyTests] };
  }
  const { playwright } = await import("vite-plus/test/browser-playwright");
  return {
    browser: {
      enabled: true,
      headless: true,
      instances: [{ browser: "chromium" }],
      provider: playwright(),
      // A desktop, as the firm's users have, so the shell lays out as it does for them, its sidebar open.
      viewport: { height: 720, width: 1280 },
    },
  };
}

export { basisPlugins, basisPreset, basisTest };
export type { BasisPreset, BasisPresetOptions, BasisTestOptions };
export type { Budget, RouteBudget } from "./budget-options.ts";
export type { VerifyError, VerifyReport, VerifyStage } from "./verify-report.ts";
export type { ShotEntry, ShotFiles, ShotProblem, ShotReport } from "./shot-report.ts";
