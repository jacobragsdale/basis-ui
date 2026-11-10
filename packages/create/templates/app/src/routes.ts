/* The app's routes, in AppShell: each page's title and icon in its staticData put it in the sidebar, the breadcrumbs
 * and the command palette. Each page loads with lazyRouteComponent, as its own chunk when it opens, so the first page
 * loads no other page's code, and @basis/parallax, which a page imports for a grid or chart, loads only with that
 * page; `vp run budget` weighs what each route loads. The sample's routes call basis's example API; delete them with
 * src/sample/ once the app calls its own (AGENTS.md). */

import { AppShell, CalendarIcon, LayoutDashboardIcon } from "@basis/ui";
import { createRootRoute, createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { createElement } from "react";

/** Every page in the shell. */
function Shell(): ReturnType<typeof AppShell> {
  return createElement(AppShell, { appName: "basis-ui app" });
}

const rootRoute = createRootRoute({ component: Shell });

const homeRoute = createRoute({
  component: lazyRouteComponent(async () => import("./pages/home.tsx"), "HomePage"),
  getParentRoute: () => rootRoute,
  path: "/",
  staticData: { icon: LayoutDashboardIcon, title: "Home" },
});

const conventionsRoute = createRoute({
  component: lazyRouteComponent(async () => import("./sample/conventions.tsx"), "ConventionsPage"),
  getParentRoute: () => rootRoute,
  path: "/conventions",
  staticData: { icon: CalendarIcon, title: "Day count conventions" },
});

const bondRoute = createRoute({
  component: lazyRouteComponent(async () => import("./sample/bond.tsx"), "BondPage"),
  getParentRoute: () => rootRoute,
  path: "/bonds/$security",
  staticData: { title: "Bond" },
});

const routeTree = rootRoute.addChildren([homeRoute, conventionsRoute, bondRoute]);

export { routeTree };
