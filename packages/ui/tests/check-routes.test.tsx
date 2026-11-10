// @vitest-environment happy-dom
/* `checkRoutes` and `expectAccessible`, in the Node DOM a laptop without Chromium runs them in: each kind of failure,
 * by its exact line, on a small app whose pages each go wrong one way, its requests answered as fixture mode answers
 * them. packages/example runs `checkRoutes` on a real app, from the fixtures the plugin reads. */

import { render } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { Outlet, createRootRoute, createRoute, useRouterState } from "@tanstack/react-router";
import { http, HttpResponse } from "msw";
import { useEffect } from "react";
import type { ReactElement } from "react";
import { afterAll, describe, expect, test } from "vite-plus/test";

import { apiFetch } from "#api/fetch.ts";
import { loadFixtureFiles } from "#fixtures/load.ts";
import { toastError } from "#shell/toast-error.tsx";
import { expectAccessible } from "#testing/axe.ts";
import { routeProblems } from "#testing/check-routes.ts";
import { loadSources } from "#testing/fixture-sources.ts";
import type { RouteSources } from "#testing/fixture-sources.ts";
import { fixturesKey } from "#testing/fixtures-key.ts";
import { mockApi } from "#testing/mock-api.ts";

/** A page that shows whether `GET url` has answered. */
function Asking({ url }: { readonly url: string }): ReactElement {
  const { data } = useQuery({
    queryFn: async () => apiFetch<{ readonly data: unknown }>(url),
    queryKey: [url],
  });
  return <p>{data === undefined ? "Loading" : "Loaded"}</p>;
}

function Fine(): ReactElement {
  return <p>All is well.</p>;
}

function Trades(): ReactElement {
  return <Asking url="/trades" />;
}

/** A bond's page, which asks for the bond at its own path. */
function Bond(): ReactElement {
  const path = useRouterState({ select: ({ location }) => location.pathname });
  return <Asking url={path} />;
}

function Boom(): ReactElement {
  throw new Error("The page broke.");
}

function Toasting(): ReactElement {
  useEffect(() => {
    toastError(new Error("The save failed."));
  }, []);
  return <p>Saved?</p>;
}

function Logging(): ReactElement {
  useEffect(() => {
    // oxlint-disable-next-line eslint/no-console -- the page under test logs an error, which checkRoutes must catch.
    console.error("The widget %s failed to draw.", "Positions");
  }, []);
  return <p>Drawn?</p>;
}

/** A list that holds a paragraph where its items should be, which axe fails. */
function Listing(): ReactElement {
  return (
    <ul>
      <p>Positions</p>
    </ul>
  );
}

function Forever(): ReactElement {
  return <Asking url="/forever" />;
}

/** The app's frame: a main landmark with the page's heading, as AppShell gives one. */
function Frame(): ReactElement {
  return (
    <main>
      <h1>Desk</h1>
      <Outlet />
    </main>
  );
}

const rootRoute = createRootRoute({ component: Frame });

const pages: Readonly<Record<string, () => ReactElement>> = {
  "/": Fine,
  "/bonds/$security": Bond,
  "/boom": Boom,
  "/forever": Forever,
  "/list": Listing,
  "/logs": Logging,
  "/toast": Toasting,
  "/trades": Trades,
};

const routeTree = rootRoute.addChildren(
  Object.entries(pages).map(([path, component]) =>
    createRoute({ component, getParentRoute: () => rootRoute, path }),
  ),
);

/** A fixture of `GET path` answering `status` with `body`. */
function fixture(path: string, status: number, body: unknown): Record<string, unknown> {
  return {
    format: "basis-ui-fixture/1",
    operation_id: "bond",
    recorded_at: "2026-11-07T12:00:00Z",
    request: { method: "GET", path },
    response: {
      body,
      media_type: status < 300 ? "application/json" : "application/problem+json",
      status,
    },
  };
}

const { fixtures } = loadFixtureFiles("fixture", {
  "fixtures/bond-US0000000000.json": fixture("/bonds/US0000000000", 404, {
    detail: "No bond has the ISIN US0000000000.",
    status: 404,
    title: "No bond has that ISIN",
    type: "unknown-bond",
  }),
  "fixtures/bond-US91282CRF04.json": fixture("/bonds/US91282CRF04", 200, { coupon: 0.04125 }),
});

/** What holds `GET /forever` unanswered until its test has seen the page wait for it. */
const forever = Promise.withResolvers<boolean>();

const sources: RouteSources = {
  fixtures,
  generated: [
    http.get("*/api/positions", () => HttpResponse.json([])),
    http.get("*/api/forever", async () => {
      await forever.promise;
      return HttpResponse.json([]);
    }),
  ],
};

const api = await mockApi();

afterAll(async () => {
  await api.close();
});

async function problemsAt(path: string, limitMs?: number): Promise<readonly string[]> {
  return routeProblems({
    api,
    path,
    routeTree,
    sources,
    ...(limitMs === undefined ? {} : { limitMs }),
  });
}

describe("checkRoutes, a page at a time", () => {
  test("passes a page that loads, reports nothing and breaks no rule", async () => {
    expect(await problemsAt("/")).toStrictEqual([]);
    expect(await problemsAt("/bonds/US91282CRF04")).toStrictEqual([]);
  });

  test("fails a request nothing answers, in fixture mode's words", async () => {
    expect(await problemsAt("/trades")).toStrictEqual([
      "ERROR /trades: No fixture or generated handler answers GET /trades: add a fixture of it to fixtures/, or run vp run client-pull if the API has gained the route.",
    ]);
  });

  test("fails an error reported to telemetry: a failed query, and what the route's error component caught", async () => {
    expect(await problemsAt("/bonds/US0000000000")).toStrictEqual([
      "ERROR /bonds/US0000000000: reported an error from its query /bonds/US0000000000, the API answered 404 No bond has that ISIN (No bond has the ISIN US0000000000.): answer the request with a fixture that succeeds, or name another sample in checkRoutes' params.",
    ]);
    expect(await problemsAt("/boom")).toStrictEqual([
      "ERROR /boom: reported an error from its route, whose error component caught it, Error: The page broke.: fix the code that threw.",
    ]);
  });

  test("fails an error toast", async () => {
    expect(await problemsAt("/toast")).toStrictEqual([
      'ERROR /toast: raised an error toast as it opened, "Something went wrong: The save failed.": a page opens without one, so answer what it asks with a fixture that succeeds, or fix the code that raised it.',
    ]);
  });

  test("fails an error written to the console, its substitutions made", async () => {
    expect(await problemsAt("/logs")).toStrictEqual([
      'ERROR /logs: wrote an error to the console, "The widget Positions failed to draw.": fix what logged it, since a page that works logs none.',
    ]);
  });

  test("fails a rule of axe's", async () => {
    expect(await problemsAt("/list")).toStrictEqual([
      "ERROR /list: axe list at ul, <ul><p>Positions</p></ul>: <ul> and <ol> must only directly contain <li>, <script> or <template> elements (https://dequeuniversity.com/rules/axe/4.14/list?application=axeAPI): fix all of the following: List element has direct children that are not allowed: p",
    ]);
  });

  test("fails a page that never finishes loading, naming what it waits for", async () => {
    expect(await problemsAt("/forever", 300)).toStrictEqual([
      "ERROR /forever: was still loading after 0.3 s, with the query /forever in flight: answer each request the page makes with a fixture, or end what keeps it loading.",
    ]);
    forever.resolve(true);
  });
});

describe("where checkRoutes finds the app's fixtures", () => {
  test("says how to configure the test run when basisTest()'s setup has not run", async () => {
    Reflect.deleteProperty(globalThis, fixturesKey);
    expect(await loadSources()).toStrictEqual({
      missing:
        "ERROR checkRoutes found no fixtures to answer the routes with, since this test run has not the setup basisTest() adds: write test: await basisTest() in vite.config.ts, beside plugins: basisPlugins(), as @basis/ui's README shows.",
    });
  });

  test("says how to configure the plugin when the fixtures module does not load", async () => {
    Reflect.set(globalThis, fixturesKey, async () =>
      Promise.reject(new Error("Cannot find module 'virtual:basis/test-fixtures'")),
    );
    expect(await loadSources()).toStrictEqual({
      missing:
        "ERROR checkRoutes could not load the app's fixtures (Cannot find module 'virtual:basis/test-fixtures'): write plugins: basisPlugins() in vite.config.ts, as @basis/ui's README shows, whose fixture-mode plugin makes them.",
    });
    Reflect.deleteProperty(globalThis, fixturesKey);
  });
});

describe("expectAccessible", () => {
  test("fails with a line for each element at fault, and passes what breaks no rule", async () => {
    const terms = render(
      <dl>
        <p>Coupon</p>
      </dl>,
    );
    await expect(expectAccessible(terms.container)).rejects.toThrow(
      "ERROR axe definition-list at dl, <dl><p>Coupon</p></dl>: <dl> elements must only directly contain properly-ordered <dt> and <dd> groups, <script>, <template> or <div> elements (https://dequeuniversity.com/rules/axe/4.14/definition-list?application=axeAPI): fix all of the following: dl element has direct children that are not allowed: p",
    );
    terms.unmount();
    const named = render(
      <dl>
        <dt>Coupon</dt>
        <dd>4.125%</dd>
      </dl>,
    );
    // An element alone sits in no landmark, which the whole document's check would fail.
    await expectAccessible(named.container);
    await expect(expectAccessible()).rejects.toThrow(/^ERROR axe /u);
    named.unmount();
  });
});
