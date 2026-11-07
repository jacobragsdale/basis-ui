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
        fit: "fitted_spread",
        id: "cusip",
        kind: "scatter",
        series: "sector",
        size: "dv01_usd",
        tooltip: ["issuer", "rating", "rich_cheap"],
        x: "duration",
        y: ["spread"],
      },
      formats: {
        dv01_usd: { decimals: 0 },
        fitted_spread: { bps: true, decimals: 1 },
        rich_cheap: { bps: true, decimals: 1 },
        spread: { bps: true, decimals: 1 },
      },
    },
    title:
      "Spread against duration, by sector, sized by DV01, over each sector's fitted curve: click a bond",
  },
  {
    id: "dv01-ladder",
    layout: {
      chart: { kind: "bar" },
      formats: { dv01_usd: { abbreviate: "thousands" } },
      group_by: ["tenor_bucket"],
      measures: [{ aggregate: "sum", column: "dv01_usd" }],
      orders: { tenor_bucket: "tenor" },
    },
    title: "DV01 by tenor bucket, short to long",
  },
  {
    id: "ratings",
    layout: {
      chart: { horizontal: true, kind: "bar" },
      formats: { market_value_usd: { abbreviate: "millions" } },
      group_by: ["rating"],
      measures: [{ aggregate: "sum", column: "market_value_usd" }],
      orders: { rating: "rating" },
    },
    title: "Market value by rating, best first",
  },
  {
    id: "tenor-axis",
    layout: {
      chart: { axis: "tenor", kind: "scatter", x: "years_to_maturity", y: ["yield_to_maturity"] },
      formats: {
        years_to_maturity: { decimals: 2 },
        yield_to_maturity: { decimals: 3, percent: true },
      },
    },
    title: "Yield against maturity on a tenor axis, the standard tenors a step apart",
  },
  {
    id: "par-by-sector",
    layout: {
      chart: { horizontal: true, kind: "bar" },
      formats: { par: { abbreviate: "millions", suffixes: "par" } },
      group_by: ["sector"],
      measures: [{ aggregate: "sum", column: "par" }],
    },
    title: "Par held by sector, written as bond markets write par: MM for millions",
  },
  {
    id: "rich-cheap-bps",
    layout: {
      chart: { kind: "bar" },
      formats: { rich_cheap: { bps: true, decimals: 1 } },
      group_by: ["sector"],
      measures: [{ aggregate: "mean", column: "rich_cheap" }],
    },
    title: "How rich or cheap each sector sits to its curve, on average, in basis points",
  },
  {
    id: "price-32nds",
    layout: {
      chart: { id: "cusip", kind: "scatter", x: "coupon_rate", y: ["price"] },
      formats: {
        coupon_rate: { decimals: 3, percent: true },
        price: { thirty_seconds: "halves" },
      },
    },
    title: "Price in 32nds against coupon",
  },
];

export { fixedIncomeCards };
export type { FixedIncomeCard };
