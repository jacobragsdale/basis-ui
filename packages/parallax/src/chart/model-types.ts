/* The draw model's types: what a chart paints and where, worked out from the data without touching a canvas, so that
 * tests can check it. The model's builders, the painter, the interaction and the drawings all speak these. */

import type { ChartFrameData } from "#frame/chart-data.ts";
import type { LayoutChart } from "#layout/chart.ts";
import type { LayoutFormat } from "#layout/layout.ts";
import type { ChartColors } from "#theme/charts.ts";

import type { CategoryData } from "./category-data.ts";
import type { DotsMark } from "./model-dots.ts";

/** A point in CSS pixels. */
interface Point {
  readonly x: number;
  readonly y: number;
}

/** A rectangle in CSS pixels. */
interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Maps values to pixels and back. */
interface Scale {
  readonly domain: readonly [number, number];
  readonly range: readonly [number, number];
  readonly log: boolean;
  readonly map: (value: number) => number;
  readonly invert: (px: number) => number;
}

/** A tick on a value axis. */
interface ValueTick {
  readonly value: number;
  readonly px: number;
  readonly label: string;
}

/** What a tooltip shows for a mark: values first, labels second. */
interface Hit {
  readonly title: string;
  readonly rows: readonly { readonly label: string; readonly value: string }[];
}

/** A line, or a line with an area wash down to its baseline. */
interface LineMark {
  readonly kind: "line";
  readonly color: string;
  readonly segments: readonly Float64Array[];
  readonly baseline: number | null;
  /** Pixels wide: 2 for series, thinner for indicators. */
  readonly width: number;
  readonly dashed: boolean;
}

/** The fill between two lines, such as Bollinger Bands', at a light wash. */
interface BandMark {
  readonly kind: "band";
  readonly color: string;
  readonly upper: Float64Array;
  readonly lower: Float64Array;
}

/** Thin bars from a baseline, as `x, y, w, h` quads, such as volume or MACD's histogram. */
interface ColumnsMark {
  readonly kind: "columns";
  readonly color: string;
  readonly rects: Float64Array;
}

/** A bar or a histogram's bin. */
interface RectMark {
  readonly kind: "rect";
  readonly color: string;
  readonly rect: Rect;
  readonly round: "top" | "bottom" | "left" | "right" | "none";
  readonly hit: Hit;
  /** The group a bar stands for, which clicking it selects. */
  readonly category?: number;
  /** Drawn faint, because another group is selected. */
  readonly dim?: boolean;
  /** The bar's value, written at its end if it fits within `room` pixels across. */
  readonly label?: { readonly text: string; readonly room: number };
}

/** A pie's slice: a ring's segment from `start` to `end`, in radians clockwise from three o'clock. */
interface SliceMark {
  readonly kind: "slice";
  readonly color: string;
  readonly cx: number;
  readonly cy: number;
  readonly outer: number;
  /** The hole's radius; 0 for a pie. */
  readonly inner: number;
  readonly start: number;
  readonly end: number;
  readonly hit: Hit;
  /** The group the slice stands for, which clicking it selects; null for "Other", which stands for several. */
  readonly category: number | null;
  readonly dim: boolean;
  /** The slice's share, written on it if it fits. */
  readonly label?: string;
}

/** A heatmap's or a density's cell. */
interface CellMark {
  readonly kind: "cell";
  readonly color: string;
  readonly rect: Rect;
  readonly hit: Hit | null;
}

/** A candle, or with `bars` an OHLC bar. */
interface CandleMark {
  readonly kind: "candle";
  readonly color: string;
  readonly hollow: boolean;
  readonly bars: boolean;
  readonly x: number;
  readonly width: number;
  readonly open: number;
  readonly close: number;
  readonly high: number;
  readonly low: number;
  readonly hit: Hit;
}

/** One painted shape. */
type Mark =
  | LineMark
  | BandMark
  | ColumnsMark
  | RectMark
  | SliceMark
  | CellMark
  | CandleMark
  | DotsMark;

/** A legend entry: the same shape as the series' mark. */
interface LegendEntry {
  readonly label: string;
  readonly color: string;
  readonly shape: "line" | "rect" | "dot";
  readonly hidden: boolean;
  /** A value beside the label, such as a slice's share. */
  readonly note?: string;
}

/** A value axis. */
interface ValueAxis {
  readonly side: "left" | "right";
  readonly scale: Scale;
  readonly ticks: readonly ValueTick[];
}

/** A labelled tick on the category or x axis, in pixels; `rotated` labels hang down and to the left from their tick. */
interface AxisTick {
  readonly px: number;
  readonly label: string;
  readonly rotated?: boolean;
  /** A label broken between its words onto lines, which are drawn under one another. */
  readonly lines?: readonly string[];
}

/** A pane of its own under the price, for one indicator, on the same x axis. */
interface Pane {
  readonly title: string;
  readonly plot: Rect;
  readonly axis: ValueAxis;
  readonly marks: readonly Mark[];
  /** Lines across the pane, in pixels, such as RSI's 30 and 70. */
  readonly guides: readonly number[];
  /** A pane of the layout's own: the columns it draws, and the series drawn, by label, in their colours. */
  readonly columns?: readonly string[];
  readonly series?: readonly { readonly label: string; readonly color: string }[];
}

/** An event marker: where, and what its tooltip says. */
interface EventMark {
  readonly px: number;
  /** The axis position, for reading events under a candle. */
  readonly x: number;
  readonly text: string;
  readonly xText: string;
}

/** How one indicator line is drawn and named, in the order of the frame's lines. */
interface IndicatorStyle {
  /** Its label in a tooltip, such as "SMA 20", "BB 20 2 upper" or "%K". */
  readonly label: string;
  /** The legend entry or pane it belongs to: overlays share a legend entry per indicator and series. */
  readonly group: string;
  readonly color: string;
  /** The pane it is drawn in, by index, or null over the price. */
  readonly pane: number | null;
  /** Bars from zero rather than a line, for MACD's histogram. */
  readonly columns: boolean;
  /** A dashed line: Bollinger Bands' middle, or a pane's second line when several series share its colours. */
  readonly dashed: boolean;
  /** The legend label of the series it follows, which hides it too, or "" for none. */
  readonly follows: string;
}

/** Everything a chart paints. */
interface ChartModel {
  readonly width: number;
  readonly height: number;
  readonly plot: Rect;
  readonly xTicks: readonly AxisTick[];
  /** Labels down the left side, for a heatmap's rows or a horizontal bar chart's categories. */
  readonly yLabels: readonly AxisTick[];
  readonly yAxes: readonly ValueAxis[];
  /** The x scale of a chart the engine reduced, in axis positions, for zooming and the crosshair. */
  readonly x: Scale | null;
  readonly marks: readonly Mark[];
  readonly legend: readonly LegendEntry[];
  /** Said instead of a plot when there is nothing to draw. */
  readonly empty: string | null;
  /** Indicator panes stacked under the plot. */
  readonly panes: readonly Pane[];
  /** The style of each of the frame's indicator lines, in its order. */
  readonly indicators: readonly IndicatorStyle[];
  /** Rows the layout's events column marks, along the bottom of the price's plot. */
  readonly events: readonly EventMark[];
  /** A donut's total, or the slice under the pointer, written in its hole. */
  readonly centre?: { readonly value: string; readonly label: string } | null;
  /** The longest a turned category label may be, in pixels, before it is cut. */
  readonly xLabelRoom?: number;
  /** Where vertical gridlines run, for charts whose values run across, such as horizontal bars. */
  readonly verticalGrid?: readonly number[];
}

/** What the model is built from. */
interface ModelInput {
  readonly chart: LayoutChart;
  readonly width: number;
  readonly height: number;
  readonly colors: ChartColors;
  /** The colour of series past the eighth. */
  readonly muted: string;
  /** Measures a label's width in the chart font. */
  readonly measure: (text: string) => number;
  /** The height of a line of label text, the theme's `lineHeightSmall`; 16 pixels if not given. */
  readonly lineHeight?: number;
  /** A series' line width, the theme's `lineWidth`; 2 pixels if not given. */
  readonly lineWidth?: number;
  readonly frame: ChartFrameData | null;
  readonly categories: CategoryData | null;
  /** The narrowest left gutter, so that the price's axis lines up with its panes'. */
  readonly minGutter?: number;
  /** A small tile's chart: less padding around the plot. */
  readonly compact?: boolean;
  /** The selected group, by its label, or a scatter's dot, by its id's text; the others' bars, slices and dots dim. */
  readonly selected?: string | null;
  /** The group under the pointer, by its index: a pie's slice moves out, and a donut's hole names it. */
  readonly hovered?: number | null;
  /** The formats by column, and a grouped view's first measure's, whose styles label value axes. */
  readonly formats?: Readonly<Record<string, LayoutFormat>>;
  readonly measureFormat?: LayoutFormat | null;
}

export type {
  AxisTick,
  BandMark,
  CandleMark,
  CellMark,
  ChartModel,
  ColumnsMark,
  EventMark,
  Hit,
  IndicatorStyle,
  LegendEntry,
  LineMark,
  Mark,
  ModelInput,
  Pane,
  Point,
  Rect,
  RectMark,
  Scale,
  SliceMark,
  ValueAxis,
  ValueTick,
};
export type { CategoryData, CategorySeries } from "./category-data.ts";
