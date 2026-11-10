/* Fixture mode in `vp dev`, which `basisPlugins()` gives every app: the app runs with no backend, MSW's service worker
 * answering `/api` from the records in `.fixtures/`, then the synthetic responses in `fixtures/`, then orval's
 * generated handlers (src/fixtures/handlers.ts). The plugin
 *
 * - serves `vp dev` on a port of the app's own, derived from its folder, so apps in parallel git worktrees never
 *   collide and each keeps its address from one run to the next, and names the app's root at `rootPath`;
 * - reads and checks the fixture files, prints an `ERROR` line for each one wrong, and reloads the page when one
 *   changes;
 * - starts fixture mode from index.html before the app's entry module runs, so an app writes no code for it.
 *
 * With `BASIS_API_URL` set, `vp dev` calls that API instead, and fixture mode is off. Tests never see `.fixtures/`,
 * whose records differ from one desktop to the next, and build their own handlers with `@basis/ui/fixtures`. */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

import type { Logger, Plugin, UserConfig, ViteDevServer } from "vite-plus";

import { fixtureFolders } from "#fixtures/load.ts";

import { readFixtures } from "./fixture-files.ts";
import type { ReadFixtures } from "./fixture-files.ts";
import { documentFile, generatedFolder } from "./orval-options.ts";

/** The module the page imports the fixtures from, which the plugin makes from the files. */
const fixturesModule = "virtual:basis/fixtures";
const resolvedFixturesModule = `\0${fixturesModule}`;

/** orval's MSW handlers in an app, from its root. */
const generatedHandlersFile = `${generatedFolder}/client.msw.ts`;

/** Where `vp dev` answers with the app's root, so `vp run shot` can tell the app's own `vp dev` on its port from
 * another app's, which Vite moved there when its own port was taken, or from another program. */
const rootPath = "/__basis/root";

/** `vp dev`'s ports: 10,000 of them from 20,000, below every operating system's ephemeral range. */
const firstPort = 20_000;
const portCount = 10_000;

/** The port `vp dev` serves the app at `root` on: the same on every run, and different in another worktree. Vite
 * moves to the next free port if another program holds it. */
function devPort(root: string): number {
  const digest = createHash("sha256").update(path.resolve(root)).digest();
  return firstPort + (digest.readUInt32BE(0) % portCount);
}

/** A module script of the app's own that a page loads, such as `<script type="module" src="/src/main.tsx">`. */
const scriptTag = /<script\b(?<attributes>[^>]*)>\s*<\/script>/giu;
const sourceAttribute = /\bsrc=["'](?<source>(?:\/(?!\/)|\.\/)[^"']+)["']/iu;
const moduleType = /\btype=["']module["']/iu;

/** The page, its own module scripts replaced by one that starts fixture mode and then imports them, in order. */
function withFixtureMode(html: string, root: string): string | undefined {
  const entries: string[] = [];
  const rest = html.replaceAll(scriptTag, (tag: string, attributes: string) => {
    const source = sourceAttribute.exec(attributes)?.groups?.["source"];
    if (source === undefined || !moduleType.test(attributes)) {
      return tag;
    }
    entries.push(source);
    return entries.length === 1 ? "<!-- basis:fixture-mode -->" : "";
  });
  if (entries.length === 0) {
    return undefined;
  }
  const generated = existsSync(path.join(root, generatedHandlersFile))
    ? `import * as generated from "/${generatedHandlersFile}";`
    : "const generated = {};";
  const script = [
    '<script type="module">',
    'import { startFixtureMode } from "@basis/ui/fixtures";',
    `import fixtures from "${fixturesModule}";`,
    generated,
    "await startFixtureMode({ ...fixtures, generated });",
    ...entries.map((entry) => `await import(${JSON.stringify(entry)});`),
    "</script>",
  ].join("\n");
  return rest.replace("<!-- basis:fixture-mode -->", () => script);
}

/** How many `items` there are, as `1 record` or `2 records`. */
function count(items: readonly unknown[], noun: string): string {
  return `${String(items.length)} ${noun}${items.length === 1 ? "" : "s"}`;
}

/** The line `vp dev` prints under its addresses, saying what answers `/api`. */
function banner(liveApi: string | undefined, read: ReadFixtures): string {
  if (liveApi !== undefined) {
    return `  ➜  Live API: /api goes to ${liveApi}, as BASIS_API_URL says; fixture mode is off.`;
  }
  return `  ➜  Fixture mode: /api is answered by ${count(read.records, "record")} in .fixtures/, then ${count(read.fixtures, "fixture")} in fixtures/, then orval's generated handlers. Set BASIS_API_URL to call a live API instead.`;
}

/** How long the watcher waits after a change for the rest of a burst, such as an export of many records, before it
 * reads the fixtures again. */
const settleMilliseconds = 100;

/** Drops the fixtures module, prints every problem, and reloads the page. */
function reloadFixtures(server: ViteDevServer, root: string, logger: Logger): void {
  const { client } = server.environments;
  const module = client.moduleGraph.getModuleById(resolvedFixturesModule);
  if (module !== undefined) {
    client.moduleGraph.invalidateModule(module);
  }
  for (const problem of readFixtures(root).problems) {
    logger.error(problem);
  }
  client.hot.send({ type: "full-reload" });
}

/** Reloads the fixtures once a burst of changes to them, or to the document, has settled. */
function watchFixtures(server: ViteDevServer, root: string, logger: Logger): void {
  const watched = [`${fixtureFolders.record}/`, `${fixtureFolders.fixture}/`];
  let pending: ReturnType<typeof setTimeout> | undefined = undefined;
  server.watcher.on("all", (_event, file) => {
    const name = path.relative(root, file).split(path.sep).join("/");
    if (name !== documentFile && !watched.some((folder) => name.startsWith(folder))) {
      return;
    }
    clearTimeout(pending);
    pending = setTimeout(() => {
      reloadFixtures(server, root, logger);
    }, settleMilliseconds);
  });
}

/** Whether a page starts in fixture mode: with no live API, in an app with an API document. */
function fixtureModeOn(root: string, liveApi: string | undefined): boolean {
  return liveApi === undefined && existsSync(path.join(root, documentFile));
}

/** The plugin's part of the configuration in `vp dev`: the app's own port, unless the app or the command line sets
 * one, and, in fixture mode, the dependencies the page's script imports. */
function devConfig(config: UserConfig, liveApi: string | undefined): UserConfig {
  const root = path.resolve(config.root ?? process.cwd());
  const generated = existsSync(path.join(root, generatedHandlersFile));
  /* The page imports fixture mode, and the generated handlers' msw and faker, from the script this plugin writes,
   * which Vite's scan of index.html on disk never sees; named here, they are bundled before the page asks. */
  const entries = [
    ...(config.optimizeDeps?.entries === undefined ? ["**/*.html"] : []),
    ...(generated ? [generatedHandlersFile] : []),
  ];
  return {
    ...(config.server?.port === undefined ? { server: { port: devPort(root) } } : {}),
    ...(fixtureModeOn(root, liveApi)
      ? { optimizeDeps: { entries, include: ["@basis/ui/fixtures"] } }
      : {}),
  };
}

/** Prints the banner, and any problem with the fixtures, under the addresses `vp dev` prints. */
function printBanner(server: ViteDevServer, liveApi: string | undefined, read: ReadFixtures): void {
  const printUrls = server.printUrls.bind(server);
  server.printUrls = (): void => {
    printUrls();
    server.config.logger.info(banner(liveApi, read));
    for (const problem of read.problems) {
      server.config.logger.error(problem);
    }
  };
}

/** The module the page imports the fixtures from: in `vp test`, the synthetic ones alone. It fails with every problem,
 * which Vite shows over the page. */
function fixturesModuleCode(root: string, test: boolean): string {
  const { records, fixtures, problems } = readFixtures(root, { records: !test });
  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }
  return `export default ${JSON.stringify({ fixtures, records })};`;
}

/** The page in fixture mode, or as it was, with an `ERROR` line, when it loads no module of the app's own. */
function pageFor(html: string, root: string, logger: Logger | undefined): string {
  const page = withFixtureMode(html, root);
  if (page === undefined) {
    logger?.error(
      'ERROR index.html loads no module script of the app\'s own, such as /src/main.tsx, so fixture mode cannot start before the app: load the app\'s entry with <script type="module" src="/src/main.tsx"></script>.',
    );
    return html;
  }
  return page;
}

interface FixtureModePluginOptions {
  /** The live API `vp dev` sends `/api` to, from `BASIS_API_URL`, which turns fixture mode off. */
  readonly liveApi: string | undefined;
}

/** `vp dev`'s port, fixture mode, and its banner, as this file's header says. */
function fixtureModePlugin({ liveApi }: FixtureModePluginOptions): Plugin {
  const state: { root: string; test: boolean; logger?: Logger } = {
    root: process.cwd(),
    test: false,
  };
  return {
    apply: "serve",
    config: (config, { mode }) => (mode === "test" ? null : devConfig(config, liveApi)),
    configResolved: (config) => {
      state.root = config.root;
      state.test = config.mode === "test";
      state.logger = config.logger;
    },
    configureServer: (server) => {
      if (state.test) {
        return;
      }
      server.middlewares.use(rootPath, (_request, response) => {
        response.setHeader("content-type", "text/plain; charset=utf-8");
        response.end(state.root);
      });
      const on = fixtureModeOn(state.root, liveApi);
      if (!on && liveApi === undefined) {
        return;
      }
      printBanner(
        server,
        liveApi,
        on ? readFixtures(state.root) : { fixtures: [], problems: [], records: [] },
      );
      if (on) {
        watchFixtures(server, state.root, server.config.logger);
      }
    },
    load: (id) =>
      id === resolvedFixturesModule ? fixturesModuleCode(state.root, state.test) : null,
    name: "basis:fixture-mode",
    resolveId: (id) => (id === fixturesModule ? resolvedFixturesModule : null),
    // Before Vite's own work on the page, so the script below has its imports resolved and Vite's client is no entry.
    transformIndexHtml: {
      handler: (html) =>
        state.test || !fixtureModeOn(state.root, liveApi)
          ? html
          : pageFor(html, state.root, state.logger),
      order: "pre",
    },
  };
}

export { devPort, fixtureModePlugin, rootPath, withFixtureMode };
export type { FixtureModePluginOptions };
