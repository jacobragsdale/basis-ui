/* The app's routes, in AppShell: each page's title and icon in its staticData put it in the sidebar, the breadcrumbs
 * and the command palette. The sample's routes call basis's example API; delete them with src/sample/ once the app
 * calls its own (AGENTS.md). */

import { AppShell, CalendarIcon, LayoutDashboardIcon } from "@basis/ui";
import { createRootRoute, createRoute } from "@tanstack/react-router";
import { createElement } from "react";

import { HomePage } from "./pages/home.tsx";
import { BondPage } from "./sample/bond.tsx";
import { ConventionsPage } from "./sample/conventions.tsx";

/** Every page in the shell. */
function Shell(): ReturnType<typeof AppShell> {
  return createElement(AppShell, { appName: "basis-ui app" });
}

const rootRoute = createRootRoute({ component: Shell });

const homeRoute = createRoute({
  component: HomePage,
  getParentRoute: () => rootRoute,
  path: "/",
  staticData: { icon: LayoutDashboardIcon, title: "Home" },
});

const conventionsRoute = createRoute({
  component: ConventionsPage,
  getParentRoute: () => rootRoute,
  path: "/conventions",
  staticData: { icon: CalendarIcon, title: "Day count conventions" },
});

const bondRoute = createRoute({
  component: BondPage,
  getParentRoute: () => rootRoute,
  path: "/bonds/$security",
  staticData: { title: "Bond" },
});

const routeTree = rootRoute.addChildren([homeRoute, conventionsRoute, bondRoute]);

export { routeTree };
