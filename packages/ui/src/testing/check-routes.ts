/* `checkRoutes(routeTree)`: every route of the app, rendered in BasisApp on the app's fixtures, answered as `vp dev`'s
 * fixture mode answers them (src/fixtures/handlers.ts), with no browser. One test for each route fails, with one
 * `ERROR` line for each thing wrong, ending with its fix, when the page
 *
 * - asks for something nothing answers, in fixture mode's own words;
 * - reports an error to telemetry: a failed query or mutation, or an error its route or the error boundary caught;
 * - raises an error toast through `toastError`;
 * - writes an error to the console;
 * - never finishes loading;
 * - or breaks a rule of axe's (axe.ts).
 *
 * ctzd's agents take no screenshots, so this is their look at every page. The fixtures come from `fixtures/`
 * (fixture-sources.ts); `.fixtures/`, whose records differ from one desktop to the next, is never read. */

import { render } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import type { AnyRoute, AnyRouter } from "@tanstack/react-router";
import { createElement } from "react";
import { afterAll, describe, test, vi } from "vite-plus/test";

import { fixtureHandlers } from "#fixtures/handlers.ts";
import { BasisApp } from "#shell/basis-app.tsx";
import { createQueryClient } from "#shell/query-client.ts";
import type { SignIn } from "#shell/sign-in.ts";
import { anonymousSignIn } from "#shell/sign-in.ts";
import { onErrorToast } from "#shell/toast-error.tsx";

import { violationText } from "./axe-rules.ts";
import { axeViolations } from "./axe.ts";
import { loadSources } from "./fixture-sources.ts";
import type { RouteSources } from "./fixture-sources.ts";
import type { MockApi } from "./mock-api.ts";
import { mockApi } from "./mock-api.ts";
import { settled } from "./page-load.ts";
import { nothingFound, recordingTelemetry, reportedLines } from "./page-report.ts";
import type { Found } from "./page-report.ts";
import { routeSamples } from "./route-samples.ts";
import type { RouteParams, RouteSample } from "./route-samples.ts";

interface CheckRoutesOptions {
  /** A sample for each route with a parameter that no fixture gives, such as
   * `{ "/bonds/$security": { security: "US91282CRF04" } }`. A route without one is skipped, with a line that says
   * so. */
  readonly params?: RouteParams;
  /** The sign-in adapter: `anonymousSignIn()` unless set, or `fakeSignIn()` for a signed-in user. */
  readonly signIn?: SignIn;
}

/** How long a page may take to load before its test fails. */
const settleMs = 10_000;
const millisecondsPerSecond = 1000;

/** How long one route's test may take: loading, then axe, which takes a second or two on a large page. */
const testMs = 30_000;

/** One page to check: the app's routes, the page's path, what answers its requests and through what, the user it is
 * opened as, and how long it may take to load. */
interface PageCheck {
  readonly routeTree: AnyRoute;
  readonly path: string;
  readonly sources: RouteSources;
  readonly api: MockApi;
  readonly signIn?: SignIn | undefined;
  readonly limitMs?: number;
}

/** Starts keeping what the page reports: its requests nothing answers, through fixture mode's telemetry, its error
 * toasts and its console errors. Returns the function that stops it. */
function watch({ sources, api }: PageCheck, found: Found): () => void {
  api.use(
    ...fixtureHandlers({
      fixtures: sources.fixtures,
      generated: sources.generated,
      records: [],
      telemetry: recordingTelemetry(found),
    }),
  );
  const logs = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    found.logged.push(args);
  });
  const stopToasts = onErrorToast((raised) => {
    found.toasts.push(raised);
  });
  return () => {
    stopToasts();
    logs.mockRestore();
    api.reset();
  };
}

/** The line for a page still loading when its time ran out, with what kept it loading, or none. */
function loadingLines(path: string, busy: readonly string[], limitMs: number): readonly string[] {
  if (busy.length === 0) {
    return [];
  }
  const seconds = String(limitMs / millisecondsPerSecond);
  return [
    `ERROR ${path}: was still loading after ${seconds} s, with ${busy.join(", ")} in flight: answer each request the page makes with a fixture, or end what keeps it loading.`,
  ];
}

/** The page `check` names, rendered in BasisApp on a memory history, reporting to `found`. */
function renderPage(
  check: PageCheck,
  found: Found,
): {
  readonly router: AnyRouter;
  readonly queryClient: QueryClient;
  readonly unmount: () => void;
} {
  const { routeTree, path, signIn = anonymousSignIn() } = check;
  const queryClient = createQueryClient();
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree,
  });
  const telemetry = recordingTelemetry(found);
  const { unmount } = render(createElement(BasisApp, { queryClient, router, signIn, telemetry }));
  return {
    queryClient,
    router,
    unmount: () => {
      unmount();
      queryClient.clear();
    },
  };
}

/** Every problem with the page at `path`: rendered in BasisApp, its requests answered by `sources` through `api`,
 * then checked by axe once it has loaded. Each line names the page by its path. */
async function routeProblems(check: PageCheck): Promise<readonly string[]> {
  const { path, limitMs = settleMs } = check;
  const found = nothingFound();
  const stop = watch(check, found);
  const page = renderPage(check, found);
  try {
    const busy = await settled(page.router, page.queryClient, limitMs);
    const violations = await axeViolations(document);
    return [
      ...reportedLines(path, found),
      ...loadingLines(path, busy, limitMs),
      ...violations.map((violation) => `ERROR ${path}: ${violationText(violation)}`),
    ];
  } finally {
    page.unmount();
    stop();
  }
}

/** The router's paths, as it lists them: `/`, `/bonds/$security`. */
function pathsOf(routeTree: AnyRoute): readonly string[] {
  return Object.keys(createRouter({ routeTree }).routesByPath);
}

/** Fails a test with `lines`, one `ERROR` line each. */
function fail(lines: readonly string[]): void {
  if (lines.length > 0) {
    throw new Error(lines.join("\n"));
  }
}

/** A route's test's name: its path, and the page that stands for it when it takes a parameter. */
function testName({ route, path, from }: RouteSample): string {
  return from === undefined ? route : `${route} at ${path}, from ${from}`;
}

/** The tests of every route of `routeTree`, answered by `sources` through `api`. */
function routeTests(
  routeTree: AnyRoute,
  { sources, api }: { readonly sources: RouteSources; readonly api: MockApi },
  options: CheckRoutesOptions,
): void {
  for (const plan of routeSamples(pathsOf(routeTree), sources, options.params)) {
    if ("line" in plan) {
      test.skip(plan.line);
    } else if ("problem" in plan) {
      test(plan.route, () => {
        fail([plan.problem]);
      });
    } else {
      const check = { api, path: plan.path, routeTree, signIn: options.signIn, sources };
      test(
        testName(plan),
        async () => {
          fail(await routeProblems(check));
        },
        testMs,
      );
    }
  }
}

/** One test for every route of `routeTree`: each renders the route in BasisApp, in a Node DOM, with its requests
 * answered from the app's `fixtures/` as `vp dev`'s fixture mode answers them, then orval's generated handlers, and
 * fails with an `ERROR` line, ending with its fix, for each request nothing answers, each error the page reports to
 * telemetry, raises as a toast or writes to the console, a page that never finishes loading, and each rule of axe's it
 * breaks.
 *
 * A route with a parameter, such as `/bonds/$security`, opens at the sample `params` gives it, or else at a fixture's
 * value for it: one whose path it matches, as `GET /bonds/US91282CRF04` does, or whose operation takes a path
 * parameter of the same name. Without either it is skipped, the test's name saying how to give one. Call it once, at
 * the top of a test file.
 *
 * @example
 * ```ts
 * import { checkRoutes } from "@basis/ui/testing";
 *
 * import { routeTree } from "#routes.ts";
 *
 * checkRoutes(routeTree);
 * ```
 */
function checkRoutes(routeTree: AnyRoute, options: CheckRoutesOptions = {}): void {
  describe("every route, on the app's fixtures", async () => {
    const loaded = await loadSources();
    if ("missing" in loaded) {
      test("the app's fixtures", () => {
        fail([loaded.missing]);
      });
      return;
    }
    if (loaded.problems.length > 0) {
      test("the app's fixtures", () => {
        fail(loaded.problems);
      });
    }
    const api = await mockApi();
    afterAll(async () => {
      await api.close();
    });
    routeTests(routeTree, { api, sources: loaded.sources }, options);
  });
}

export { checkRoutes, routeProblems };
export type { CheckRoutesOptions, PageCheck };
