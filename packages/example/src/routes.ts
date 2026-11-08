/* The app's routes, inside AppShell, each titled for its sidebar, breadcrumbs and command palette: the day count conventions at `/`, one bond at `/bonds/$security`, and the form
 * that records a settlement at `/settlements/new`. */

import { AppShell, CalendarIcon, PlusIcon } from "@basis/ui";
import { createRootRoute, createRoute } from "@tanstack/react-router";
import { createElement } from "react";
import { z } from "zod";

import { BondPage } from "./pages/bond.tsx";
import { ConventionsPage } from "./pages/conventions.tsx";
import { SettlementPage } from "./pages/settlement.tsx";

/** Every page in the shell: the sidebar of the pages below, the breadcrumbs, Ctrl+K and `?`. */
function Shell(): ReturnType<typeof AppShell> {
  return createElement(AppShell, { appName: "Accruals" });
}

const rootRoute = createRootRoute({ component: Shell });

const conventionsRoute = createRoute({
  component: ConventionsPage,
  getParentRoute: () => rootRoute,
  path: "/",
  staticData: { icon: CalendarIcon, title: "Day count conventions" },
  // The filter bar's and the split view's state: the text a convention's name must hold, and the one selected.
  validateSearch: z.object({ convention: z.string().optional(), selected: z.string().optional() }),
});

const bondRoute = createRoute({
  component: BondPage,
  getParentRoute: () => rootRoute,
  path: "/bonds/$security",
  staticData: { title: "Bond" },
});

const settlementRoute = createRoute({
  component: SettlementPage,
  getParentRoute: () => rootRoute,
  path: "/settlements/new",
  staticData: { icon: PlusIcon, title: "Record a settlement" },
});

const routeTree = rootRoute.addChildren([conventionsRoute, bondRoute, settlementRoute]);

export { routeTree };
