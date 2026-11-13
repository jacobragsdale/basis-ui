// @vitest-environment happy-dom
/* `checkRoutes` and `renderApp` on the app's own router options: its context, with the query client BasisApp holds,
 * and its basepath, so that a loader that fills `context.queryClient` is under test as the app runs it. */

import { screen } from "@testing-library/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, createRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { afterAll, expect, test } from "vite-plus/test";

import { routeProblems } from "#testing/check-routes.ts";
import { renderApp } from "#testing/index.ts";
import { mockApi } from "#testing/mock-api.ts";

interface AppContext {
  readonly queryClient: QueryClient;
  readonly desk: string;
}

/** The positions query the loader fills and the page reads; asked again, it says so. */
const positions = {
  queryFn: async (): Promise<string> => Promise.resolve("asked again by the page"),
  queryKey: ["positions"],
  staleTime: Number.POSITIVE_INFINITY,
};

function Positions(): ReactElement {
  const { data } = useSuspenseQuery(positions);
  return <p>{data}</p>;
}

/** What the loader does: fills the positions query in the query client its context holds. */
async function fill({ queryClient, desk }: AppContext): Promise<string> {
  return queryClient.query({
    ...positions,
    queryFn: async () => Promise.resolve(`filled by the loader for the ${desk}`),
    staleTime: "static",
  });
}

function Frame(): ReactElement {
  return (
    <main>
      <h1>Positions</h1>
      <Outlet />
    </main>
  );
}

const rootRoute = createRootRouteWithContext<AppContext>()({ component: Frame });

const routeTree = rootRoute.addChildren([
  createRoute({
    component: Positions,
    getParentRoute: () => rootRoute,
    loader: async ({ context }: { readonly context: AppContext }) => fill(context),
    path: "/",
  }),
]);

/** The app's router options, as its `router.ts` gives them, with the query client BasisApp holds. */
function router(queryClient: QueryClient): { readonly context: AppContext } {
  return { context: { desk: "Rates desk", queryClient } };
}

const api = await mockApi();

afterAll(async () => {
  await api.close();
});

test("renderApp makes the router with the app's options, its context holding BasisApp's query client", async () => {
  renderApp(routeTree, "/", { router });
  expect(await screen.findByText("filled by the loader for the Rates desk")).toBeTruthy();
});

test("renderApp opens an app with a basepath at an address under it", async () => {
  renderApp(routeTree, "/desk/", {
    router: (queryClient) => ({ ...router(queryClient), basepath: "/desk" }),
  });
  expect(await screen.findByText("filled by the loader for the Rates desk")).toBeTruthy();
});

test("checkRoutes' page makes the router with the app's options", async () => {
  const problems = await routeProblems({
    api,
    path: "/",
    router,
    routeTree,
    sources: { fixtures: [], generated: [] },
  });
  expect(problems).toStrictEqual([]);
});
