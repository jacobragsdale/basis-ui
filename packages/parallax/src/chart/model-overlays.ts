/* What a line or candle chart draws over its price besides the price itself: indicator overlays, the washes between
 * bands, the legend entries they add, and the rows an events column marks. */

import type { ChartFrameData } from "#frame/chart-data.ts";

import type {
  EventMark,
  IndicatorStyle,
  LegendEntry,
  Mark,
  ModelInput,
  Scale,
} from "./model-types.ts";
import { hidden, seriesEntries, shown } from "./model-shared.ts";
import type { Named } from "./model-shared.ts";
import { seriesLabel } from "./series-keys.ts";
import { segmentsOf } from "./panes.ts";
import { pixel } from "./scale.ts";

/** An overlay line's width, and a dashed one's. */
const overlayWidth = 1.5;
const dashedWidth = 1;
/** The fewest numbers a band's run needs, two points, for a wash between its lines. */
const fewestBandNumbers = 2;

/** Whether a line is an overlay over the price that is not hidden. */
function shownOverlay(
  input: ModelInput,
  style: IndicatorStyle | undefined,
): style is IndicatorStyle {
  return style?.pane === null && shown(input, style);
}

/** The values of the overlays shown over the price, which its scale must hold. */
function overlayValues(
  input: ModelInput,
  frame: ChartFrameData,
  styles: readonly IndicatorStyle[],
): number[] {
  return frame.indicators.flatMap((line, i) => (shownOverlay(input, styles[i]) ? [...line.y] : []));
}

/**
 * The washes between two bands' lines, one per stretch both have without a break, so a gap is never filled across.
 * Bands whose breaks differ, as when a log scale cannot place the lower one, get no wash rather than a wrong one.
 */
function washes(
  color: string,
  upper: readonly Float64Array[],
  lower: readonly Float64Array[],
): Mark[] {
  if (upper.length !== lower.length) {
    return [];
  }
  return upper.flatMap((run, i): Mark[] => {
    const below = lower[i];
    return below === undefined ||
      run.length <= fewestBandNumbers ||
      below.length <= fewestBandNumbers
      ? []
      : [{ color, kind: "band", lower: below, upper: run }];
  });
}

/** A band's two lines, as they are found among the frame's lines. */
interface Band {
  upper?: readonly Float64Array[];
  lower?: readonly Float64Array[];
  readonly color: string;
}

/** What overlays are drawn with: the frame, its lines' styles, and the price's scales. */
interface OverlayPlot {
  readonly frame: ChartFrameData;
  readonly styles: readonly IndicatorStyle[];
  readonly x: Scale;
  readonly y: Scale;
}

/** Keeps a band's upper or lower line, under its group, for the wash between them; other lines are no band's. */
function keepBand(
  bands: Map<string, Band>,
  style: IndicatorStyle,
  { segments, side }: { readonly segments: readonly Float64Array[]; readonly side: string },
): void {
  if (side !== "upper" && side !== "lower") {
    return;
  }
  const band = bands.get(style.group) ?? { color: style.color };
  band[side] = segments;
  bands.set(style.group, band);
}

/** An overlay's line, thin and thinner dashed; none when nothing of it is drawn. */
function overlayLine(style: IndicatorStyle, segments: readonly Float64Array[]): readonly Mark[] {
  if (segments.length === 0) {
    return [];
  }
  const width = style.dashed ? dashedWidth : overlayWidth;
  return [
    { baseline: null, color: style.color, dashed: style.dashed, kind: "line", segments, width },
  ];
}

/** The overlays drawn over the price: thin lines, and a wash between Bollinger Bands. */
function overlayMarks(input: ModelInput, { frame, styles, x, y }: OverlayPlot): Mark[] {
  const marks: Mark[] = [];
  const bands = new Map<string, Band>();
  for (const [i, line] of frame.indicators.entries()) {
    const style = styles[i];
    if (shownOverlay(input, style)) {
      const segments = segmentsOf(line.x, line.y, { x, y });
      keepBand(bands, style, { segments, side: line.line });
      marks.push(...overlayLine(style, segments));
    }
  }
  // Washes go under the lines.
  return [
    ...[...bands.values()].flatMap((band) =>
      washes(band.color, band.upper ?? [], band.lower ?? []),
    ),
    ...marks,
  ];
}

/** The legend: the series when there is more than one, and every overlay, one entry each per indicator and series. */
function legendWithOverlays(
  input: ModelInput,
  series: readonly Named[],
  {
    shape,
    styles,
  }: { readonly shape: "line" | "rect"; readonly styles: readonly IndicatorStyle[] },
): readonly LegendEntry[] {
  const overlays = new Map<string, string>();
  for (const style of styles) {
    if (style.pane === null && !overlays.has(style.group)) {
      overlays.set(style.group, style.color);
    }
  }
  const entries: LegendEntry[] =
    series.length > 1 || overlays.size > 0 ? seriesEntries(input, series, shape) : [];
  for (const [label, color] of overlays) {
    entries.push({ color, hidden: hidden(input, label), label, shape: "line" });
  }
  // One series alone needs no legend; an overlay always does, to be told from the price.
  return entries.length < 2 && overlays.size === 0 ? [] : entries;
}

/** The events of series shown: a hidden series' events go with it. */
function eventMarks(input: ModelInput, frame: ChartFrameData, x: Scale): readonly EventMark[] {
  const column = input.chart.y[0] ?? "";
  return frame.events
    .filter(
      (event) =>
        event.series === "" || !hidden(input, seriesLabel(frame, { column, key: event.series })),
    )
    .map((event) => ({ px: pixel(x, event.x), text: event.text, x: event.x, xText: event.xText }));
}

export { eventMarks, legendWithOverlays, overlayMarks, overlayValues };
export type { OverlayPlot };
