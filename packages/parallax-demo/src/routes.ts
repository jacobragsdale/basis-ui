/* The demo's routes, inside the layout: a page of one view at `/` and three more, each taking a shared link's layout
 * in `?layout=`, and a page of several views at each other address. Each route's loader asks for the datasets its
 * page shows before the page renders, so they start loading at once. */

import { createRootRoute, createRoute } from "@tanstack/react-router";

import { BreakdownsPage } from "#pages/breakdowns.tsx";
import { ChartsPage } from "#pages/charts.tsx";
import { DashboardPage } from "#pages/dashboard.tsx";
import { FixedIncomePage } from "#pages/fixed-income.tsx";
import { SmallChartsPage } from "#pages/small-charts.tsx";
import { SmallTablesPage } from "#pages/small-tables.tsx";
import { SourcePage } from "#pages/source.tsx";
import { TechnicalPage } from "#pages/technical.tsx";
import { LargestTradesView, PivotView, PricesView, TradesView } from "#pages/view-routes.tsx";
import { allTrades, dailyPrices, largestTrades, positionsPivot } from "#pages/view-layouts.ts";
import { openView, viewSearch } from "#pages/view-link.ts";
import { needDatasets } from "#shell/datasets.ts";
import { Layout } from "#shell/layout.tsx";
import { pages } from "#shell/pages.ts";

const rootRoute = createRootRoute({ component: Layout });

const pivotRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: pages.pivot.path,
  // The search's type comes from validateSearch, so it is given before the loader's options that read it.
  validateSearch: viewSearch,
  loaderDeps: ({ search }) => ({ layout: search.layout }),
  loader: async ({ deps }) => openView(positionsPivot, deps.layout),
  component: PivotView,
});

const tradesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: pages.trades.path,
  // The search's type comes from validateSearch, so it is given before the loader's options that read it.
  validateSearch: viewSearch,
  loaderDeps: ({ search }) => ({ layout: search.layout }),
  loader: async ({ deps }) => openView(allTrades, deps.layout),
  component: TradesView,
});

const largestTradesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: pages.largestTrades.path,
  // The search's type comes from validateSearch, so it is given before the loader's options that read it.
  validateSearch: viewSearch,
  loaderDeps: ({ search }) => ({ layout: search.layout }),
  loader: async ({ deps }) => openView(largestTrades, deps.layout),
  component: LargestTradesView,
});

const pricesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: pages.prices.path,
  // The search's type comes from validateSearch, so it is given before the loader's options that read it.
  validateSearch: viewSearch,
  loaderDeps: ({ search }) => ({ layout: search.layout }),
  loader: async ({ deps }) => openView(dailyPrices, deps.layout),
  component: PricesView,
});

const smallTablesRoute = createRoute({
  component: SmallTablesPage,
  getParentRoute: () => rootRoute,
  loader: () => {
    needDatasets("book", "blotter");
  },
  path: pages.smallTables.path,
});

const sourceRoute = createRoute({
  component: SourcePage,
  getParentRoute: () => rootRoute,
  path: pages.source.path,
});

const dashboardRoute = createRoute({
  component: DashboardPage,
  getParentRoute: () => rootRoute,
  loader: () => {
    needDatasets("book", "blotter");
  },
  path: pages.dashboard.path,
});

const breakdownsRoute = createRoute({
  component: BreakdownsPage,
  getParentRoute: () => rootRoute,
  loader: () => {
    needDatasets("positions", "trades");
  },
  path: pages.breakdowns.path,
});

const chartsRoute = createRoute({
  component: ChartsPage,
  getParentRoute: () => rootRoute,
  loader: () => {
    needDatasets("prices", "positions");
  },
  path: pages.charts.path,
});

const technicalRoute = createRoute({
  component: TechnicalPage,
  getParentRoute: () => rootRoute,
  loader: () => {
    needDatasets("prices");
  },
  path: pages.technical.path,
});

const smallChartsRoute = createRoute({
  component: SmallChartsPage,
  getParentRoute: () => rootRoute,
  path: pages.smallCharts.path,
});

const fixedIncomeRoute = createRoute({
  component: FixedIncomePage,
  getParentRoute: () => rootRoute,
  loader: () => {
    needDatasets("bonds", "attribution");
  },
  path: pages.fixedIncome.path,
});

const routeTree = rootRoute.addChildren([
  pivotRoute,
  tradesRoute,
  largestTradesRoute,
  pricesRoute,
  smallTablesRoute,
  sourceRoute,
  dashboardRoute,
  breakdownsRoute,
  chartsRoute,
  technicalRoute,
  smallChartsRoute,
  fixedIncomeRoute,
]);

export { routeTree };
