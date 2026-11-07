/* The charts page's cards: every chart kind over the generated prices and positions, the Angular demo's, layout for
 * layout. */

import type { LayoutFilter, LayoutInput } from "@basis/parallax";

/** A chart the page shows. */
interface Card {
  /** A name that stays when the title is reworded, such as for the chart's screenshot. */
  readonly id: string;
  readonly title: string;
  readonly dataset: "prices" | "positions";
  readonly layout: LayoutInput;
}

const three = ["QYE", "ZREZ", "NV"];
const qye: LayoutFilter = { column: "ticker", columns: [], op: "eq", value: "QYE", values: [] };
const ohlc = { close: "close", high: "high", low: "low", open: "open" };

/** Filters to one ticker since a day. */
function since(ticker: string, day: string): LayoutInput["filters"] {
  return [
    { column: "ticker", op: "eq", value: ticker },
    { column: "date", op: "ge", value: day },
  ];
}

const priceCards: readonly Card[] = [
  {
    dataset: "prices",
    id: "technical",
    layout: {
      chart: {
        axis: "trading",
        drawings: [
          { from: { x: "2025-04-07", y: 8100 }, kind: "trend", to: { x: "2026-02-02", y: 12_900 } },
          {
            from: { x: "2025-11-03", y: 9300 },
            kind: "fibonacci",
            to: { x: "2026-03-02", y: 13_700 },
          },
          { kind: "horizontal", y: 12_000 },
          { at: { x: "2026-03-02", y: 13_700 }, kind: "note", text: "Year's high" },
        ],
        events: "event",
        indicators: [
          { kind: "sma", period: 50 },
          { kind: "bollinger" },
          { kind: "rsi" },
          { kind: "macd" },
          { kind: "volume" },
        ],
        kind: "candlestick",
        ohlc,
        volume: "volume",
        x: "date",
      },
      filters: since("QYE", "2025-01-01"),
    },
    title:
      "QYE since 2025: SMA 50, Bollinger Bands and drawings over the candles, RSI, MACD and volume below",
  },
  {
    dataset: "prices",
    id: "compare",
    layout: {
      chart: {
        axis: "trading",
        compare: true,
        events: "event",
        kind: "line",
        series: "ticker",
        x: "date",
        y: ["close"],
      },
      filters: [
        { column: "ticker", op: "in", values: three },
        { column: "date", op: "ge", value: "2025-01-01" },
      ],
    },
    title: "QYE, ZREZ and NV since 2025, compared as percentage changes",
  },
  {
    dataset: "prices",
    id: "closes-log",
    layout: {
      chart: {
        axis: "trading",
        kind: "line",
        log_y: true,
        series: "ticker",
        x: "date",
        y: ["close"],
      },
      filters: [{ column: "ticker", op: "in", values: three }],
    },
    title: "Closing prices on trading days, log scale",
  },
  {
    dataset: "prices",
    id: "candles",
    layout: { chart: { axis: "trading", kind: "candlestick", ohlc, x: "date" }, filters: [qye] },
    title: "QYE candles, bucketed to fit: drag to pan, wheel to zoom, Shift-drag to select days",
  },
  {
    dataset: "prices",
    id: "close-and-volume",
    layout: {
      chart: { axis: "trading", kind: "line", x: "date", y: ["close"], y_right: ["volume"] },
      filters: since("NV", "2025-01-01"),
    },
    title: "NV close since 2025, with its volume on a second axis",
  },
  {
    dataset: "prices",
    id: "ohlc",
    layout: {
      chart: { axis: "trading", kind: "ohlc", ohlc, x: "date" },
      filters: since("NV", "2024-01-01"),
    },
    title: "NV OHLC bars since 2024",
  },
  {
    dataset: "prices",
    id: "area",
    layout: {
      chart: { axis: "trading", kind: "area", x: "date", y: ["close"] },
      filters: since("QYE", "2025-01-01"),
    },
    title: "QYE close since 2025, as an area",
  },
];

const marketValue = [{ aggregate: "sum", column: "market_value_usd" }] as const;
const millions = { market_value_usd: { abbreviate: "millions" } } as const;

const positionCards: readonly Card[] = [
  {
    dataset: "positions",
    id: "stacked-bars",
    layout: {
      chart: { kind: "bar", stacked: true },
      formats: millions,
      group_by: ["sector"],
      measures: [...marketValue],
      split_by: ["asset_class"],
    },
    title: "Market value by sector and asset class",
  },
  {
    dataset: "positions",
    id: "horizontal-bars",
    layout: {
      chart: { horizontal: true, kind: "bar" },
      formats: millions,
      group_by: ["sector"],
      measures: [...marketValue],
      split_by: ["long_short"],
    },
    title: "Market value by sector, long and short side by side",
  },
  {
    dataset: "positions",
    id: "histogram",
    layout: {
      chart: { kind: "histogram", series: "long_short", x: "beta" },
      formats: { beta: { decimals: 2 } },
    },
    title: "Beta of long and short positions",
  },
  {
    dataset: "positions",
    id: "density",
    layout: { chart: { kind: "scatter", x: "market_value_usd", y: ["daily_pnl_usd"] } },
    title: "Daily P&L against market value",
  },
  {
    dataset: "positions",
    id: "heatmap",
    layout: {
      chart: { kind: "heatmap" },
      formats: { daily_pnl_usd: { abbreviate: "thousands", negative: "parentheses" } },
      group_by: ["sector"],
      measures: [{ aggregate: "sum", column: "daily_pnl_usd" }],
      split_by: ["asset_class"],
    },
    title: "Daily P&L by sector and asset class",
  },
  {
    dataset: "positions",
    id: "donut",
    layout: {
      chart: { kind: "pie" },
      formats: millions,
      group_by: ["asset_class"],
      group_sort: { by: { measure: 0 }, descending: true },
      measures: [...marketValue, { ...marketValue[0], show_as: "percent_of_grand_total" }],
    },
    title: "Market value by asset class: click a slice to list its positions",
  },
  {
    dataset: "positions",
    id: "pie",
    layout: {
      chart: { donut: false, kind: "pie" },
      group_by: ["sector"],
      group_sort: { by: { measure: 0 }, descending: true },
      measures: [
        { aggregate: "count_all" },
        { aggregate: "count_all", show_as: "percent_of_grand_total" },
      ],
    },
    title: "Positions by sector, the seven largest and the rest",
  },
];

/** Every card, in the Angular demo's order. */
const cards: readonly Card[] = [...priceCards, ...positionCards];

export { cards, qye };
export type { Card };
