/* The harness's dataset: the Angular demo's positions, which `tests/e2e/pivot/data.sh` generates beside the page,
 * fetched as an app fetches its API's Arrow, and the demo's reference pivot of them. */

import type { DatasetSource, LayoutInput } from "#index.ts";

/** Fetches the generated positions' Arrow stream. */
async function fetchPositions(): Promise<ArrayBuffer> {
  const url = "data/positions.arrows";
  // oxlint-disable-next-line basis/no-fetch -- the harness reads the file data.sh wrote beside it; it calls no API, so there is no generated client to go through.
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} answered ${String(response.status)}; run tests/e2e/pivot/data.sh`);
  }
  return response.arrayBuffer();
}

/** The positions' source, one function, so the dataset loads once. */
const positions: DatasetSource = fetchPositions;

/** The demo's reference pivot of the positions. */
const referencePivot: LayoutInput = {
  dataset: "positions",
  expand_depth: 3,
  group_by: ["fund", "strategy", "sector", "ticker"],
  measures: [
    { aggregate: "sum", column: "market_value_usd" },
    { aggregate: "sum", column: "daily_pnl_usd" },
    { aggregate: "count_all" },
  ],
  split_by: ["asset_class"],
};

/** A flat view of the positions, whose link opens a grid. */
const flatPositions: LayoutInput = { dataset: "positions" };

export { flatPositions, positions, referencePivot };
