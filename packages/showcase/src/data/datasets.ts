/* The API's datasets, each loaded into the page's engine by name from its route, streamed as it arrives, so a table of
 * 1,000,000 rows shows its first rows long before its last. Pages that show the same dataset share one load. */

import type { Dataset } from "@basis/parallax";
import { useDataset } from "@basis/parallax";
import { arrowResponse } from "@basis/ui";

import {
  getAttributionUrl,
  getBondsUrl,
  getCurvesUrl,
  getPositionsUrl,
  getTradesUrl,
} from "#api/client.ts";

import type { AttributionRow, BondRow, CurveRow, Position, Trade } from "./rows.ts";

/** The business date the API's tables of one day are for. */
const businessDate = "2026-10-30";

async function trades(): Promise<Response> {
  return arrowResponse(getTradesUrl());
}
async function positions(): Promise<Response> {
  return arrowResponse(getPositionsUrl());
}
async function bonds(): Promise<Response> {
  return arrowResponse(getBondsUrl());
}
async function attribution(): Promise<Response> {
  return arrowResponse(getAttributionUrl());
}
async function curves(): Promise<Response> {
  return arrowResponse(getCurvesUrl());
}

function useTrades(): Dataset<Trade> {
  return useDataset<Trade>("trades", trades, { primaryKey: "trade_id" });
}
function usePositions(): Dataset<Position> {
  return useDataset<Position>("positions", positions, { primaryKey: "position_id" });
}
function useBonds(): Dataset<BondRow> {
  return useDataset<BondRow>("bonds", bonds, { primaryKey: "cusip" });
}
function useAttribution(): Dataset<AttributionRow> {
  return useDataset<AttributionRow>("attribution", attribution);
}
function useCurves(): Dataset<CurveRow> {
  return useDataset<CurveRow>("curves", curves);
}

export { businessDate, useAttribution, useBonds, useCurves, usePositions, useTrades };
