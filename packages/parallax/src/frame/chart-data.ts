/* What a chart frame holds once decoded: the plot a chart the engine reduced draws, with every value a tooltip shows
 * as the engine's text, formatted as grid cells are, so a chart never formats a number itself. */

/** A labelled tick on the x axis. */
interface ChartTickData {
  readonly x: number;
  readonly label: string;
}

/** A line or area series: points in order, with NaN y values at breaks. */
interface SeriesData {
  readonly label: string;
  readonly column: string;
  /** The series column's value, as the label writes it; "" for a series that is not split. */
  readonly key: string;
  /** Drawn against the right y axis. */
  readonly right: boolean;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly xText: readonly (string | null)[];
  readonly yText: readonly (string | null)[];
  /** Each point's x value as exact JSON, for filters that select a range. */
  readonly xJson: readonly (string | null)[];
}

/** A scatter's dots of one series, in x order, with every value's text. */
interface PointSeries {
  readonly label: string;
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Each dot's size column's magnitude as a share of its largest in the chart, NaN for none. */
  readonly size: Float64Array;
  readonly xText: readonly (string | null)[];
  readonly yText: readonly (string | null)[];
  readonly sizeText: readonly (string | null)[];
  readonly fitText: readonly (string | null)[];
  /** The id column's text and exact JSON, null without one. */
  readonly idText: readonly (string | null)[];
  readonly idJson: readonly (string | null)[];
  /** The text of each tooltip column, in the layout's order. */
  readonly tooltip: readonly (readonly (string | null)[])[];
}

/** A scatter's fit line for one series: points in order, with NaN y values at breaks. */
interface FitLineData {
  readonly label: string;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly xText: readonly (string | null)[];
  readonly yText: readonly (string | null)[];
}

/** One series of a histogram: a count per bin. */
interface HistogramSeries {
  readonly label: string;
  readonly from: Float64Array;
  readonly to: Float64Array;
  readonly counts: readonly number[];
  readonly fromText: readonly (string | null)[];
  readonly toText: readonly (string | null)[];
}

/** Candlestick or OHLC buckets; a missing price is NaN, with null text. */
interface CandleData {
  readonly interval: string;
  readonly from: Float64Array;
  readonly to: Float64Array;
  readonly open: Float64Array;
  readonly high: Float64Array;
  readonly low: Float64Array;
  readonly close: Float64Array;
  readonly xText: readonly (string | null)[];
  readonly openText: readonly (string | null)[];
  readonly highText: readonly (string | null)[];
  readonly lowText: readonly (string | null)[];
  readonly closeText: readonly (string | null)[];
  /** Each bucket's total volume for drawing, NaN for none or an overflow, and its text: null for none. Null without a volume indicator. */
  readonly volume: Float64Array | null;
  readonly volumeText: readonly (string | null)[] | null;
  /** Each bucket's start, and the next bucket's start, as exact JSON. */
  readonly xJson: readonly (string | null)[];
  readonly endJson: readonly (string | null)[];
}

/** What a chart frame holds. */
type ChartContent =
  | { readonly kind: "series"; readonly series: readonly SeriesData[] }
  | {
      readonly kind: "points";
      readonly yFrom: number;
      readonly yTo: number;
      readonly series: readonly PointSeries[];
    }
  | {
      readonly kind: "density";
      readonly columns: number;
      readonly rows: number;
      readonly yFrom: number;
      readonly yTo: number;
      readonly counts: Uint32Array;
    }
  | { readonly kind: "histogram"; readonly series: readonly HistogramSeries[] }
  | { readonly kind: "candles"; readonly candles: CandleData };

/** A decoded, checked chart frame. */
interface ChartFrameData {
  readonly viewId: number;
  readonly configVersion: bigint;
  readonly loadVersion: bigint;
  readonly sourceAsOfMicros: bigint;
  readonly pushed: boolean;
  /** The x range shown, in axis positions. */
  readonly xFrom: number;
  readonly xTo: number;
  /** The data's whole x range, in axis positions, which zooming and panning stay within. */
  readonly extentFrom: number;
  readonly extentTo: number;
  readonly ticks: readonly ChartTickData[];
  readonly content: ChartContent;
  /** The indicators' lines, each for one series. */
  readonly indicators: readonly IndicatorLineData[];
  /** The rows the layout's events column marks in the range shown, at most 500, and how many there are in all. */
  readonly events: readonly ChartEventData[];
  readonly eventsTotal: number;
  /** A scatter's fit lines, one per series; empty without a fit column. */
  readonly fits: readonly FitLineData[];
  /** Where each x value the layout's drawings are anchored to sits on the axis, by the value's canonical JSON; NaN where the axis cannot place it. */
  readonly anchors: ReadonlyMap<string, number>;
  /** When the chart window this frame answers was asked for, by `performance.now()`. */
  readonly requestedAtMs?: number;
}

/** A row an events column marks: where, when, and what happened. */
interface ChartEventData {
  readonly x: number;
  readonly xText: string;
  readonly text: string;
  /** The series column's value as text, or "" without a series column. */
  readonly series: string;
}

/** One line of an indicator, for one series: points in order, with NaN y values at breaks. */
interface IndicatorLineData {
  /** The indicator, by index in the layout's chart indicators. */
  readonly indicator: number;
  /** Which of its lines, such as "upper" of Bollinger Bands. */
  readonly line: string;
  /** The series column's value it follows, or "" without a series column. */
  readonly series: string;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly xText: readonly (string | null)[];
  readonly yText: readonly (string | null)[];
}

export type {
  CandleData,
  ChartContent,
  ChartEventData,
  ChartFrameData,
  ChartTickData,
  FitLineData,
  HistogramSeries,
  IndicatorLineData,
  PointSeries,
  SeriesData,
};
