/* Indicator panes stacked under a line or candle chart's price: the price is built in the height left over, with a
 * left gutter wide enough for every pane's labels, so the axes line up, and each pane shares its x scale. */

import type { CandleData, ChartFrameData } from "#frame/chart-data.ts";

import { indicatorStyles, paneSpecs } from "./indicators.ts";
import type {
  ChartModel,
  IndicatorStyle,
  Mark,
  ModelInput,
  Pane,
  Rect,
  Scale,
} from "./model-types.ts";
import { columnWidth, gutter, padOf, shown, xAxisHeight } from "./model-shared.ts";
import { paneDomain, paneGap, paneHeight, paneScale, paneValues, segmentsOf } from "./panes.ts";
import type { PaneSpec } from "./panes.ts";
import { pixel } from "./scale.ts";

/** A pane's line width. */
const paneLineWidth = 1.5;

/** A pane's spec with its place and its values' range. */
interface PlacedPane {
  readonly spec: PaneSpec;
  readonly box: Rect;
  readonly domain: readonly [number, number];
}

/** What a chart's panes are built from: its frame, its candles if it has them, and how many series it plots. */
interface PaneSource {
  readonly frame: ChartFrameData;
  readonly candles: CandleData | null;
  readonly plotted: number;
}

function isShown(input: ModelInput, style: IndicatorStyle | undefined): boolean {
  return style !== undefined && shown(input, style);
}

/** Up and down columns, as `x, y, width, height` quads, in the up and down colours. */
function upDown(input: ModelInput, up: readonly number[], down: readonly number[]): Mark[] {
  return [
    { color: input.colors.up, kind: "columns", rects: Float64Array.from(up) },
    { color: input.colors.down, kind: "columns", rects: Float64Array.from(down) },
  ];
}

/** A polyline's points, and the scales they are drawn on. */
interface Line {
  readonly xs: Float64Array;
  readonly ys: Float64Array;
}

/** An x and a y scale. */
interface Axes {
  readonly x: Scale;
  readonly y: Scale;
}

/** The column of point `i`, of `value`, from the baseline at `zero`: as wide as most of the space to the next point. */
function signedQuad(
  { xs, i }: { readonly xs: Float64Array; readonly i: number },
  { x, y }: Axes,
  { value, zero }: { readonly value: number; readonly zero: number },
): readonly number[] {
  const at = pixel(x, xs[i] ?? 0);
  const neighbour = pixel(x, xs[i + 1] ?? xs[i - 1] ?? 0);
  const width = columnWidth(Math.abs(neighbour - at));
  const top = pixel(y, value);
  return [at - width / 2, Math.min(top, zero), width, Math.abs(zero - top)];
}

/**
 * Columns from zero, up in the up colour and down in the down colour, as for MACD's histogram: as wide as most of the
 * space to the next point, a pixel at least.
 */
function signedColumns(input: ModelInput, { xs, ys }: Line, axes: Axes): Mark[] {
  const zero = pixel(axes.y, 0);
  const [up, down]: [number[], number[]] = [[], []];
  for (let i = 0; i < xs.length; i += 1) {
    const value = ys[i] ?? Number.NaN;
    if (Number.isFinite(value)) {
      (value >= 0 ? up : down).push(...signedQuad({ i, xs }, axes, { value, zero }));
    }
  }
  return upDown(input, up, down);
}

/** Bucket `i`'s volume of `amount`, as wide as its candle, from the baseline at `zero`. */
function volumeQuad(
  { candles, i }: { readonly candles: CandleData; readonly i: number },
  { x, y }: Axes,
  { amount, zero }: { readonly amount: number; readonly zero: number },
): readonly number[] {
  const [from, to] = [pixel(x, candles.from[i] ?? 0), pixel(x, candles.to[i] ?? 0)];
  const width = columnWidth(to - from);
  const top = pixel(y, amount);
  return [(from + to) / 2 - width / 2, top, width, Math.max(0, zero - top)];
}

/** Whether bucket `i` closed at or above its open. */
function rose(candles: CandleData, i: number): boolean {
  return (candles.close[i] ?? 0) >= (candles.open[i] ?? 0);
}

/** Each candle's volume, as wide as the candle, in its direction's colour. */
function volumeMarks(input: ModelInput, candles: CandleData, axes: Axes): Mark[] {
  const { volume } = candles;
  if (volume === null) {
    return [];
  }
  const zero = pixel(axes.y, 0);
  const [up, down]: [number[], number[]] = [[], []];
  for (let i = 0; i < volume.length; i += 1) {
    const amount = volume[i] ?? Number.NaN;
    if (Number.isFinite(amount)) {
      (rose(candles, i) ? up : down).push(...volumeQuad({ candles, i }, axes, { amount, zero }));
    }
  }
  return upDown(input, up, down);
}

/** An indicator's marks in its pane: a line, or for MACD's histogram, signed columns. */
function paneLine(
  input: ModelInput,
  { line, style }: { readonly line: Line; readonly style: IndicatorStyle },
  axes: Axes,
): readonly Mark[] {
  if (style.columns) {
    return signedColumns(input, line, axes);
  }
  const segments = segmentsOf(line.xs, line.ys, axes);
  return segments.length > 0
    ? [
        {
          baseline: null,
          color: style.color,
          dashed: style.dashed,
          kind: "line",
          segments,
          width: paneLineWidth,
        },
      ]
    : [];
}

/** One pane's axis, guides and marks. */
function paneOf(
  input: ModelInput,
  {
    source,
    main,
    x,
  }: { readonly source: PaneSource; readonly main: ChartModel; readonly x: Scale },
  { placed, index }: { readonly placed: PlacedPane; readonly index: number },
): Pane {
  const { frame, candles } = source;
  const { scale, ticks } = paneScale(placed.domain, placed.box);
  const axes = { x, y: scale };
  const marks: Mark[] =
    placed.spec.volume && candles !== null ? volumeMarks(input, candles, axes) : [];
  for (const [i, line] of frame.indicators.entries()) {
    const style = main.indicators[i];
    if (style?.pane === index && shown(input, style)) {
      marks.push(...paneLine(input, { line: { xs: line.x, ys: line.y }, style }, axes));
    }
  }
  return {
    axis: { scale, side: "left", ticks },
    guides: placed.spec.guides.map((guide) => pixel(scale, guide)),
    marks,
    plot: placed.box,
    title: placed.spec.title,
  };
}

/** Each pane's spec, at `height`, with its values' range from the lines shown. */
function placePanes(
  input: ModelInput,
  source: PaneSource,
  { specs, height }: { readonly specs: readonly PaneSpec[]; readonly height: number },
): readonly PlacedPane[] {
  // Which lines go in which pane, from the same styles the price's model gives its lines.
  const styles = indicatorStyles(input.chart, source.frame, {
    colors: input.colors,
    muted: input.muted,
    plotted: source.plotted,
  });
  const shownLines = source.frame.indicators.filter((_line, i) => isShown(input, styles[i]));
  const shownStyles = styles.filter((style) => isShown(input, style));
  return specs.map((spec, pane): PlacedPane => {
    const values = paneValues(pane, {
      candles: source.candles,
      lines: shownLines,
      spec,
      styles: shownStyles,
    });
    return {
      box: { height, width: 0, x: 0, y: 0 },
      domain: paneDomain(spec, values, height),
      spec,
    };
  });
}

/** The panes, `height` tall each, stacked under the price's plot, a gap above each. */
function stackPanes(
  input: ModelInput,
  context: { readonly source: PaneSource; readonly main: ChartModel; readonly x: Scale },
  { placed, height }: { readonly placed: readonly PlacedPane[]; readonly height: number },
): readonly Pane[] {
  const { plot } = context.main;
  let top = plot.y + plot.height;
  return placed.map((pane, index): Pane => {
    top += paneGap;
    const box = { height, width: plot.width, x: plot.x, y: top };
    top += height;
    return paneOf(input, context, { index, placed: { ...pane, box } });
  });
}

/**
 * Stacks the chart's indicator panes under its price: the price is built in the height left over, with a left gutter
 * wide enough for every pane's labels, so the axes line up, and each pane shares its x scale.
 */
function withPanes(
  input: ModelInput,
  source: PaneSource,
  build: (input: ModelInput) => ChartModel,
): ChartModel {
  const specs = paneSpecs(input.chart);
  const height = paneHeight(specs.length, input.height - padOf(input) - xAxisHeight);
  if (height === 0) {
    return build(input);
  }
  const placed = placePanes(input, source, { height, specs });
  const labels = placed.flatMap((pane) => paneScale(pane.domain, pane.box).ticks);
  const main = build({
    ...input,
    height: input.height - specs.length * (height + paneGap),
    minGutter: gutter(input, labels),
  });
  return main.x === null
    ? main
    : {
        ...main,
        height: input.height,
        panes: stackPanes(input, { main, source, x: main.x }, { height, placed }),
      };
}

export { withPanes };
export type { PaneSource };
