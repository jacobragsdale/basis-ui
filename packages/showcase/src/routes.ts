/* The showcase's routes, in AppShell: each page's title, icon and group in its staticData put it in the sidebar, the
 * breadcrumbs and the command palette. Each page loads with lazyRouteComponent, as its own chunk. The pages that show
 * parallax sit under one layout, which starts its engine, so parallax loads only with the first of them. */

import {
  ChartColumnIcon,
  ChartLineIcon,
  ChartScatterIcon,
  GaugeIcon,
  LayoutDashboardIcon,
  PenSquareIcon,
  SigmaIcon,
  TableIcon,
  UploadIcon,
  filterSearchSchema,
} from "@basis/ui";
import { createRootRoute, createRoute, lazyRouteComponent } from "@tanstack/react-router";

import { tradeFilters } from "#data/trade-filters.ts";
import { Shell } from "#shell/shell.tsx";

const rootRoute = createRootRoute({ component: Shell });

const dataRoute = createRoute({
  component: lazyRouteComponent(async () => import("./shell/data-layout.tsx"), "DataLayout"),
  getParentRoute: () => rootRoute,
  id: "data",
});

const overviewRoute = createRoute({
  component: lazyRouteComponent(async () => import("./pages/overview.tsx"), "OverviewPage"),
  getParentRoute: () => dataRoute,
  path: "/",
  staticData: { group: "Desk", icon: LayoutDashboardIcon, title: "Overview" },
});

const blotterRoute = createRoute({
  component: lazyRouteComponent(async () => import("./pages/blotter.tsx"), "BlotterPage"),
  getParentRoute: () => dataRoute,
  path: "/blotter",
  staticData: { group: "Desk", icon: TableIcon, title: "Blotter" },
  validateSearch: filterSearchSchema(tradeFilters),
});

const positionsRoute = createRoute({
  component: lazyRouteComponent(async () => import("./pages/positions.tsx"), "PositionsPage"),
  getParentRoute: () => dataRoute,
  path: "/positions",
  staticData: { group: "Desk", icon: SigmaIcon, title: "Positions" },
});

const relativeValueRoute = createRoute({
  component: lazyRouteComponent(
    async () => import("./pages/relative-value.tsx"),
    "RelativeValuePage",
  ),
  getParentRoute: () => dataRoute,
  path: "/relative-value",
  staticData: { group: "Analytics", icon: ChartScatterIcon, title: "Relative value" },
});

const pnlRoute = createRoute({
  component: lazyRouteComponent(async () => import("./pages/pnl-explain.tsx"), "PnlExplainPage"),
  getParentRoute: () => dataRoute,
  path: "/pnl-explain",
  staticData: { group: "Analytics", icon: ChartColumnIcon, title: "P&L explain" },
});

const curvesRoute = createRoute({
  component: lazyRouteComponent(async () => import("./pages/curves.tsx"), "CurvesPage"),
  getParentRoute: () => dataRoute,
  path: "/curves",
  staticData: { group: "Analytics", icon: ChartLineIcon, title: "Curves" },
});

/* The probe sits under a layout of its own, the same as the data pages', so it comes last in the sidebar; it starts the
 * engine afresh, which a probe of the desktop wants. */
const toolsRoute = createRoute({
  component: lazyRouteComponent(async () => import("./shell/data-layout.tsx"), "DataLayout"),
  getParentRoute: () => rootRoute,
  id: "tools",
});

const probeRoute = createRoute({
  component: lazyRouteComponent(async () => import("./pages/probe.tsx"), "ProbePage"),
  getParentRoute: () => toolsRoute,
  path: "/probe",
  staticData: { group: "Tools", icon: GaugeIcon, title: "Probe" },
});

const bondRoute = createRoute({
  component: lazyRouteComponent(async () => import("./pages/bond.tsx"), "BondPage"),
  getParentRoute: () => rootRoute,
  path: "/bonds/$cusip",
  staticData: { title: "Bond" },
});

const bookRoute = createRoute({
  component: lazyRouteComponent(async () => import("./pages/book-trade.tsx"), "BookTradePage"),
  getParentRoute: () => rootRoute,
  path: "/book",
  staticData: { group: "Trading", icon: PenSquareIcon, title: "Book a trade" },
});

const importRoute = createRoute({
  component: lazyRouteComponent(async () => import("./pages/import.tsx"), "ImportPage"),
  getParentRoute: () => rootRoute,
  path: "/import",
  staticData: { group: "Trading", icon: UploadIcon, title: "Import tickets" },
});

const routeTree = rootRoute.addChildren([
  dataRoute.addChildren([
    overviewRoute,
    blotterRoute,
    positionsRoute,
    relativeValueRoute,
    pnlRoute,
    curvesRoute,
  ]),
  bondRoute,
  bookRoute,
  importRoute,
  toolsRoute.addChildren([probeRoute]),
]);

export { routeTree };
