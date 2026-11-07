/* The pages of one view as their routes render them: each with the view its route's loader opened, keyed by its link,
 * so that opening another link, or the page's own view, starts it afresh. */

import { getRouteApi } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { pages } from "#shell/pages.ts";

import { ViewPage } from "./view.tsx";

const pivotApi = getRouteApi("/");
const tradesApi = getRouteApi("/trades");
const largestTradesApi = getRouteApi("/largest-trades");
const pricesApi = getRouteApi("/prices");

function PivotView(): ReactNode {
  const { layout } = pivotApi.useSearch();
  return <ViewPage key={layout ?? ""} page={pages.pivot} opened={pivotApi.useLoaderData()} />;
}

function TradesView(): ReactNode {
  const { layout } = tradesApi.useSearch();
  return <ViewPage key={layout ?? ""} page={pages.trades} opened={tradesApi.useLoaderData()} />;
}

function LargestTradesView(): ReactNode {
  const { layout } = largestTradesApi.useSearch();
  return (
    <ViewPage
      key={layout ?? ""}
      page={pages.largestTrades}
      opened={largestTradesApi.useLoaderData()}
    />
  );
}

function PricesView(): ReactNode {
  const { layout } = pricesApi.useSearch();
  return <ViewPage key={layout ?? ""} page={pages.prices} opened={pricesApi.useLoaderData()} />;
}

export { LargestTradesView, PivotView, PricesView, TradesView };
