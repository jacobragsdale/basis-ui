/* One page, as a ctzd dashboard starts: a card of figures, on an anonymous session. */

import { createRootRoute, createRoute } from "@tanstack/react-router";

import { SummaryPage } from "./summary.tsx";

const rootRoute = createRootRoute();

const summaryRoute = createRoute({
  component: SummaryPage,
  getParentRoute: () => rootRoute,
  path: "/",
});

const routeTree = rootRoute.addChildren([summaryRoute]);

export { routeTree };
