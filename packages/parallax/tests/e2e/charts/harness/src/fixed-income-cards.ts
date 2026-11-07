/* The fixed-income page's cards: the views roadmap step 2.8 adds for the firm's desks, over the bonds that
 * `parallax-datagen bonds` writes. */

import type { LayoutInput } from "#index.ts";

/** A chart the fixed-income page shows. */
interface FixedIncomeCard {
  /** A name that stays when the title is reworded, such as for the chart's screenshot. */
  readonly id: string;
  readonly title: string;
  readonly layout: LayoutInput;
}

const fixedIncomeCards: readonly FixedIncomeCard[] = [
  {
    id: "rich-cheap",
    layout: {
      chart: {
        fit: "fitted_spread_bp",
        id: "cusip",
        kind: "scatter",
        series: "sector",
        size: "dv01_usd",
        tooltip: ["issuer", "rating", "rich_cheap_bp"],
        x: "duration",
        y: ["spread_bp"],
      },
      formats: {
        dv01_usd: { decimals: 0 },
        fitted_spread_bp: { decimals: 1 },
        rich_cheap_bp: { decimals: 1 },
        spread_bp: { decimals: 1 },
      },
    },
    title:
      "Spread against duration, by sector, sized by DV01, over each sector's fitted curve: click a bond",
  },
];

export { fixedIncomeCards };
export type { FixedIncomeCard };
