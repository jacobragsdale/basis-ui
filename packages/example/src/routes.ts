/* The app's routes, inside the layout: the day count conventions at `/`, one bond at `/bonds/$security`, and the form
 * that records a settlement at `/settlements/new`. */

import { createRootRoute, createRoute } from "@tanstack/react-router";

import { BondPage } from "./pages/bond.tsx";
import { ConventionsPage } from "./pages/conventions.tsx";
import { Layout } from "./pages/layout.tsx";
import { SettlementPage } from "./pages/settlement.tsx";

const rootRoute = createRootRoute({ component: Layout });

const conventionsRoute = createRoute({
  component: ConventionsPage,
  getParentRoute: () => rootRoute,
  path: "/",
});

const bondRoute = createRoute({
  component: BondPage,
  getParentRoute: () => rootRoute,
  path: "/bonds/$security",
});

const settlementRoute = createRoute({
  component: SettlementPage,
  getParentRoute: () => rootRoute,
  path: "/settlements/new",
});

const routeTree = rootRoute.addChildren([conventionsRoute, bondRoute, settlementRoute]);

export { routeTree };
