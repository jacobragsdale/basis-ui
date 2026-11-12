/* A build in fixture mode, `vp build --mode fixtures`: the app as `vp dev` serves it with no backend, as static files,
 * for a demonstration or a desktop with no API to call. MSW's service worker answers `/api` from the synthetic
 * responses in `fixtures/`, then orval's generated handlers, as in `vp dev`; the records in `.fixtures/`, which hold
 * client data, are never built in. The worker's script goes beside the page, and the files fixtures' `body_file`
 * names go under `bodyFilesPath`, copied as they are, so a large dataset streams from the static server. The build
 * needs an absolute `base`, as `/`, since the worker and the files are found from it on every route. */

import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type { Plugin } from "vite-plus";

import { bodyFilesPath } from "#fixtures/answered-by.ts";
import { bodyFileOf } from "#fixtures/record.ts";

import { readFixtures } from "./fixture-files.ts";
import { fixturesModuleCode } from "./fixture-mode.ts";
import { fixturesModule, resolvedFixturesModule, withFixtureMode } from "./fixture-page.ts";

/** The mode that builds the app in fixture mode. */
const fixtureBuildMode = "fixtures";

/** MSW's worker script, as the MSW that `@basis/ui/fixtures` runs on ships it. */
function workerScript(): string {
  return readFileSync(createRequire(import.meta.url).resolve("msw/mockServiceWorker.js"), "utf8");
}

/** Copies each file a fixture's `body_file` names into the build, under `bodyFilesPath`. */
function copyBodyFiles(root: string, outDir: string): number {
  const files = readFixtures(root, { records: false }).fixtures.flatMap((fixture) => {
    const file = bodyFileOf(fixture);
    return file === undefined ? [] : [file];
  });
  for (const file of new Set(files)) {
    const target = path.join(outDir, bodyFilesPath, file);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(root, file), target);
  }
  return new Set(files).size;
}

/** `vp build --mode fixtures`, as this file's header says. */
function fixtureBuildPlugin(): Plugin {
  const state = { base: "/", outDir: "dist", root: process.cwd() };
  return {
    apply: (_config, { command, mode }) => command === "build" && mode === fixtureBuildMode,
    configResolved: (config) => {
      if (!config.base.startsWith("/")) {
        throw new Error(
          `ERROR vp build --mode fixtures needs an absolute base, and vite.config.ts sets ${JSON.stringify(config.base)}: build with --base /, or serve the app at its own path, such as --base /showcase/.`,
        );
      }
      state.base = config.base;
      state.root = config.root;
      state.outDir = path.resolve(config.root, config.build.outDir);
    },
    generateBundle() {
      this.emitFile({
        fileName: "mockServiceWorker.js",
        source: workerScript(),
        type: "asset",
      });
    },
    load: (id) => (id === resolvedFixturesModule ? fixturesModuleCode(state.root, true) : null),
    name: "basis:fixture-build",
    resolveId: (id) => (id === fixturesModule ? resolvedFixturesModule : null),
    transformIndexHtml: {
      handler: (html) => withFixtureMode(html, state.root, state.base) ?? html,
      order: "pre",
    },
    writeBundle() {
      const copied = copyBodyFiles(state.root, state.outDir);
      this.info(
        `Fixture mode: /api is answered by the fixtures in fixtures/, then orval's generated handlers, with ${String(copied)} body files beside the page; .fixtures/ is never built in.`,
      );
    },
  };
}

export { fixtureBuildMode, fixtureBuildPlugin };
