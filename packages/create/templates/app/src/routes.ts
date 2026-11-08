/* The app's routes, in AppShell: each page's title and icon in its staticData put it in the sidebar, the breadcrumbs
 * and the command palette. */

import { AppShell, LayoutDashboardIcon } from "@basis/ui";
import { createRootRoute, createRoute } from "@tanstack/react-router";
import { createElement } from "react";

import { HomePage } from "./pages/home.tsx";

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

const routeTree = rootRoute.addChildren([homeRoute]);

export { routeTree };
