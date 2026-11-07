/* The app's routes: the positions at `/`, and one position at `/positions/$positionId`, inside the layout. */

import { createRootRoute, createRoute } from "@tanstack/react-router";

import { Layout } from "./pages/layout.tsx";
import { PositionPage } from "./pages/position.tsx";
import { PositionsPage } from "./pages/positions.tsx";

const rootRoute = createRootRoute({ component: Layout });

const positionsRoute = createRoute({
  component: PositionsPage,
  getParentRoute: () => rootRoute,
  path: "/",
});

const positionRoute = createRoute({
  component: PositionPage,
  getParentRoute: () => rootRoute,
  path: "/positions/$positionId",
});

const routeTree = rootRoute.addChildren([positionsRoute, positionRoute]);

export { routeTree };
