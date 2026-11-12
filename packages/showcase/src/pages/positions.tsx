/* Positions: the pivot over 1,000,000 position lots, by fund and asset class against the long or short side, its
 * settings beside it. A double click on a value opens the rows behind it. */

import { Pivot } from "@basis/parallax";
import type { LayoutFor } from "@basis/parallax";
import { Page } from "@basis/ui";
import type { ReactElement } from "react";

import { usePositions } from "#data/datasets.ts";
import type { Position } from "#data/rows.ts";

const inMillions = { abbreviate: "millions", decimals: 1 } as const;

const byFund: LayoutFor<Position> = {
  formats: { daily_pnl_usd: inMillions, dv01_usd: { decimals: 0 }, market_value_usd: inMillions },
  group_by: ["fund", "asset_class"],
  measures: [
    { aggregate: "sum", column: "market_value_usd" },
    { aggregate: "sum", column: "daily_pnl_usd" },
    { aggregate: "sum", column: "dv01_usd" },
  ],
  split_by: ["long_short"],
  // A measure's header is its label, `sum(market_value_usd)`, unless titled here.
  titles: {
    "sum(daily_pnl_usd)": "P&L on the day",
    "sum(dv01_usd)": "DV01",
    "sum(market_value_usd)": "Market value",
  },
};

function PositionsPage(): ReactElement {
  const positions = usePositions();
  return (
    <Page
      title="Positions"
      description="Every lot on 30 October, 1,000,000 of them, pivoted: regroup with the settings, and double-click a value for the rows behind it."
      layout="fill"
    >
      <Pivot dataset={positions} layout={byFund} />
    </Page>
  );
}

export { PositionsPage };
