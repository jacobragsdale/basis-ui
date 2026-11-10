/* What answers the requests of the pages `checkRoutes` opens: the app's fixtures in `fixtures/`, then orval's
 * generated handlers, as the fixture-mode plugin makes them for `vp test` (src/preset/fixture-mode.ts) and the setup
 * file `basisTest()` adds leaves a loader of them (fixtures-setup.ts); and the values each fixture's path gives its
 * operation's path parameters, from which a route's sample may come. */

import type { RequestHandler } from "msw";

import { generatedHandlers } from "#fixtures/generated.ts";
import type { LoadedFixture } from "#fixtures/record.ts";

import { fixturesKey } from "./fixtures-key.ts";
import { isRecord, quoted } from "./page-report.ts";
import type { SampleSources } from "./route-samples.ts";

/** What answers a route's requests, and where its sample may come from. */
interface RouteSources extends SampleSources {
  readonly fixtures: readonly LoadedFixture[];
  readonly generated: readonly RequestHandler[];
}

type Loaded =
  | { readonly sources: RouteSources; readonly problems: readonly string[] }
  | { readonly missing: string };

/** The values each fixture's path gives its parameters, as the plugin's module holds them, each a string. */
function parametersOf(value: unknown): Readonly<Record<string, Readonly<Record<string, string>>>> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).map(([file, values]) => [
      file,
      Object.fromEntries(
        Object.entries(isRecord(values) ? values : {}).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
    ]),
  );
}

/** The fixtures, problems and generated handlers the plugin's module holds. */
async function sourcesIn(module: unknown): Promise<Loaded> {
  if (!isRecord(module)) {
    throw new TypeError("its fixtures module is not the one the fixture-mode plugin makes");
  }
  const { fixtures, parameters, problems, generated } = module;
  if (!Array.isArray(fixtures) || !Array.isArray(problems) || typeof generated !== "function") {
    throw new TypeError("its fixtures module is not the one the fixture-mode plugin makes");
  }
  const handlers: unknown = await Reflect.apply(generated, undefined, []);
  return {
    problems: problems.map(String),
    sources: {
      // The plugin's module holds what loadFixtureFiles gave, so its fixtures are fixture mode's own.
      fixtures: fixtures.filter((fixture): fixture is LoadedFixture => isRecord(fixture)),
      generated: generatedHandlers(isRecord(handlers) ? handlers : {}),
      parameters: parametersOf(parameters),
    },
  };
}

/** The app's fixtures and generated handlers, and what is wrong with them; or the line that says why there are
 * none. */
async function loadSources(): Promise<Loaded> {
  const loader: unknown = Reflect.get(globalThis, fixturesKey);
  if (typeof loader !== "function") {
    return {
      missing:
        "ERROR checkRoutes found no fixtures to answer the routes with, since this test run has not the setup basisTest() adds: write test: await basisTest() in vite.config.ts, beside plugins: basisPlugins(), as @basis/ui's README shows.",
    };
  }
  try {
    return await sourcesIn(await Reflect.apply(loader, undefined, []));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      missing: `ERROR checkRoutes could not load the app's fixtures (${quoted(reason)}): write plugins: basisPlugins() in vite.config.ts, as @basis/ui's README shows, whose fixture-mode plugin makes them.`,
    };
  }
}

export { loadSources };
export type { RouteSources };
