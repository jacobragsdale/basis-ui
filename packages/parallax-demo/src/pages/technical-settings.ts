/* The technical-analysis page's settings and the layouts they make, as in the Angular demo. */

import type { LayoutFilter, LayoutInput } from "@basis/parallax";

const tickers = ["QYE", "ZREZ", "NV"] as const;
type Ticker = (typeof tickers)[number];

const kinds = ["candlestick", "ohlc", "line", "area"] as const;
type Kind = (typeof kinds)[number];

const starts = ["2016-01-01", "2020-01-01", "2024-01-01", "2025-06-01"] as const;
type Since = (typeof starts)[number];

/** An indicator the page offers: what it is, and whether it needs candles or reads prices. */
interface IndicatorOption {
  readonly key: string;
  readonly label: string;
  readonly indicator: NonNullable<NonNullable<LayoutInput["chart"]>["indicators"]>[number];
  /** It reads the high, low or volume, which only candles have. */
  readonly candles: boolean;
  /** It is in prices, which a comparison's percentages would not match. */
  readonly priced: boolean;
}

const options: readonly IndicatorOption[] = [
  {
    candles: false,
    indicator: { kind: "sma", period: 20 },
    key: "sma20",
    label: "SMA 20",
    priced: true,
  },
  {
    candles: false,
    indicator: { kind: "sma", period: 50 },
    key: "sma50",
    label: "SMA 50",
    priced: true,
  },
  {
    candles: false,
    indicator: { kind: "sma", period: 200 },
    key: "sma200",
    label: "SMA 200",
    priced: true,
  },
  {
    candles: false,
    indicator: { kind: "ema", period: 20 },
    key: "ema20",
    label: "EMA 20",
    priced: true,
  },
  {
    candles: false,
    indicator: { kind: "wma", period: 20 },
    key: "wma20",
    label: "WMA 20",
    priced: true,
  },
  {
    candles: false,
    indicator: { deviations: 2, kind: "bollinger", period: 20 },
    key: "bollinger",
    label: "Bollinger 20 2",
    priced: true,
  },
  { candles: true, indicator: { kind: "vwap" }, key: "vwap", label: "VWAP", priced: true },
  {
    candles: false,
    indicator: { kind: "rsi", period: 14 },
    key: "rsi",
    label: "RSI 14",
    priced: false,
  },
  {
    candles: false,
    indicator: { fast: 12, kind: "macd", signal: 9, slow: 26 },
    key: "macd",
    label: "MACD 12 26 9",
    priced: false,
  },
  {
    candles: true,
    indicator: { kind: "atr", period: 14 },
    key: "atr",
    label: "ATR 14",
    priced: false,
  },
  {
    candles: true,
    // The layout's defaults are TA-Lib's: %K over 14, smoothed over 3, and %D over 3.
    indicator: { kind: "stochastic" },
    key: "stochastic",
    label: "Stochastic 14 3 3",
    priced: false,
  },
  { candles: true, indicator: { kind: "volume" }, key: "volume", label: "Volume", priced: false },
];

/** The page's settings. */
interface Settings {
  readonly ticker: Ticker;
  readonly kind: Kind;
  readonly since: Since;
  readonly on: ReadonlySet<string>;
  readonly compare: boolean;
  readonly events: boolean;
  readonly log: boolean;
}

const firstSettings: Settings = {
  compare: false,
  events: true,
  kind: "candlestick",
  log: false,
  on: new Set(["sma50", "bollinger", "rsi", "macd", "volume"]),
  since: "2024-01-01",
  ticker: "QYE",
};

/** Whether an option fits the chart the settings make. */
function fits(option: IndicatorOption, settings: Settings): boolean {
  const candles =
    !settings.compare && (settings.kind === "candlestick" || settings.kind === "ohlc");
  return (candles || !option.candles) && !(settings.compare && option.priced);
}

/** What a chart keeps from the one it replaces: its drawings, zoom and hidden series. */
type Kept = Partial<Pick<NonNullable<LayoutInput["chart"]>, "drawings" | "range" | "hidden">>;

function sinceFilter(settings: Settings): LayoutFilter {
  return { column: "date", columns: [], op: "ge", value: settings.since, values: [] };
}

function tickerFilter(settings: Settings): LayoutFilter {
  return settings.compare
    ? { column: "ticker", columns: [], op: "in", value: null, values: [...tickers] }
    : { column: "ticker", columns: [], op: "eq", value: settings.ticker, values: [] };
}

/** The chart the settings make, keeping what the chart before it holds. */
function chartLayout(settings: Settings, kept: Kept): LayoutInput {
  const indicators = options
    .filter((option) => settings.on.has(option.key) && fits(option, settings))
    .map((option) => option.indicator);
  const events = settings.events ? "event" : null;
  const filters = [tickerFilter(settings), sinceFilter(settings)];
  if (settings.compare) {
    const chart = {
      ...kept,
      axis: "trading",
      compare: true,
      events,
      indicators,
      kind: "line",
    } as const;
    return {
      chart: { ...chart, series: "ticker", x: "date", y: ["close"] },
      dataset: "prices",
      filters,
    };
  }
  const candles = settings.kind === "candlestick" || settings.kind === "ohlc";
  const plotted = candles
    ? { ohlc: { close: "close", high: "high", low: "low", open: "open" } }
    : { y: ["close"] };
  return {
    chart: {
      ...kept,
      ...plotted,
      axis: "trading",
      events,
      indicators,
      kind: settings.kind,
      log_y: settings.log,
      volume: "volume",
      x: "date",
    },
    dataset: "prices",
    filters,
  };
}

/** The ticker's days, narrowed to a brushed range. */
function daysLayout(settings: Settings, brush: readonly LayoutFilter[]): LayoutInput {
  return {
    columns: ["date", "ticker", "open", "high", "low", "close", "volume", "event"],
    dataset: "prices",
    filters: [tickerFilter(settings), sinceFilter(settings), ...brush],
    sort: [{ column: "date", descending: true }, { column: "ticker" }],
  };
}

export { chartLayout, daysLayout, firstSettings, fits, kinds, options, starts, tickers };
export type { IndicatorOption, Kept, Kind, Settings, Since, Ticker };
