/* Indicators on a chart: averages, bands and VWAP drawn over the price, and RSI, MACD, ATR, the stochastic and volume
 * in panes stacked under it on the same x axis. The engine computed every value over every row and sent its text;
 * this decides where each line goes, its colour, and its label. */

import type { ChartFrameData, IndicatorLineData } from "#frame/chart-data.ts";
import type { LayoutChart, LayoutIndicator } from "#layout/chart.ts";
import type { ChartColors } from "#theme/charts.ts";

import type { IndicatorStyle } from "./model-types.ts";
import type { PaneSpec } from "./panes.ts";
import { seriesLabel } from "./series-keys.ts";

const overlayKinds: ReadonlySet<LayoutIndicator["kind"]> = new Set([
  "sma",
  "ema",
  "wma",
  "bollinger",
  "vwap",
]);

// An oscillator's fixed range, and the guides drawn across its pane.
const oscillatorTop = 100;
const rsiLow = 30;
const rsiHigh = 70;
const stochasticLow = 20;
const stochasticHigh = 80;
const rsiGuides = [rsiLow, rsiHigh] as const;
const stochasticGuides = [stochasticLow, stochasticHigh] as const;

/** Whether an indicator is drawn over the price, rather than in a pane of its own. */
function overlays(indicator: LayoutIndicator): boolean {
  return overlayKinds.has(indicator.kind);
}

/** An indicator's name with its parameters, as in its legend entry or pane title. */
function indicatorLabel(indicator: LayoutIndicator): string {
  switch (indicator.kind) {
    case "sma":
    case "ema":
    case "wma":
    case "rsi":
    case "atr": {
      return `${indicator.kind.toUpperCase()} ${String(indicator.period)}`;
    }
    case "bollinger": {
      return `BB ${String(indicator.period)} ${String(indicator.deviations)}`;
    }
    case "macd": {
      return `MACD ${String(indicator.fast)} ${String(indicator.slow)} ${String(indicator.signal)}`;
    }
    case "stochastic": {
      return `Stoch ${String(indicator.k)} ${String(indicator.k_smooth)} ${String(indicator.d)}`;
    }
    case "vwap": {
      return "VWAP";
    }
    case "volume": {
      return "Volume";
    }
    default: {
      return indicator satisfies never;
    }
  }
}

/** What a line of an indicator is called in a tooltip. */
const lineNames: ReadonlyMap<string, string> = new Map([
  ["macd", "MACD"],
  ["signal", "Signal"],
  ["histogram", "Histogram"],
  ["k", "%K"],
  ["d", "%D"],
]);

function paneSpec(indicator: LayoutIndicator): PaneSpec {
  const title = indicatorLabel(indicator);
  switch (indicator.kind) {
    case "rsi": {
      return { domain: [0, oscillatorTop], guides: rsiGuides, title, volume: false };
    }
    case "stochastic": {
      return { domain: [0, oscillatorTop], guides: stochasticGuides, title, volume: false };
    }
    case "macd": {
      return { domain: null, guides: [0], title, volume: false };
    }
    case "volume": {
      return { domain: null, guides: [], title, volume: true };
    }
    case "atr":
    case "sma":
    case "ema":
    case "wma":
    case "bollinger":
    case "vwap": {
      return { domain: null, guides: [], title, volume: false };
    }
    default: {
      return indicator satisfies never;
    }
  }
}

/** The panes a chart stacks under its price, in the order of its indicators. */
function paneSpecs(chart: LayoutChart): readonly PaneSpec[] {
  return chart.indicators.filter((indicator) => !overlays(indicator)).map((i) => paneSpec(i));
}

/** Where each indicator of a chart is drawn: its pane, by index among the panes, or null over the price. */
function paneIndexes(chart: LayoutChart): readonly (number | null)[] {
  let next = 0;
  return chart.indicators.map((indicator) => {
    if (overlays(indicator)) {
      return null;
    }
    next += 1;
    return next - 1;
  });
}

/** What an overlay's style is made of. */
interface OverlayParts {
  readonly indicator: LayoutIndicator;
  readonly line: string;
  readonly group: string;
  readonly follows: string;
  readonly color: string;
}

function overlayStyle({ indicator, line, group, follows, color }: OverlayParts): IndicatorStyle {
  const part = indicator.kind === "bollinger" ? ` ${line}` : "";
  return {
    color,
    columns: false,
    dashed: line === "middle",
    follows,
    group,
    label: `${group}${part}`,
    pane: null,
  };
}

/** What a pane's line needs to know of its neighbours. */
interface PaneContext {
  readonly group: string;
  readonly follows: string;
  readonly pane: number;
  readonly series: string;
  readonly many: boolean;
  readonly order: readonly string[];
  readonly color: (slot: number) => string;
}

/**
 * In a pane, a second line such as MACD's signal takes the next slot; with several series, each keeps its own slot and
 * the second line is dashed instead.
 */
function paneStyle(line: IndicatorLineData, context: PaneContext): IndicatorStyle {
  const second = line.line === "signal" || line.line === "d";
  const slot = context.many ? context.order.indexOf(line.series) : Number(second);
  const label = `${lineNames.get(line.line) ?? context.group}${context.series}`;
  return {
    color: context.color(slot),
    columns: line.line === "histogram",
    dashed: context.many && second,
    follows: context.follows,
    group: context.group,
    label,
    pane: context.pane,
  };
}

/** An overlay group's place among the overlays, in the order they first appear. */
function slotOf(groups: Map<string, number>, group: string): number {
  if (!groups.has(group)) {
    groups.set(group, groups.size);
  }
  return groups.get(group) ?? 0;
}

/** The colours indicator lines take, and how many slots the plotted series hold before them. */
interface StyleColors {
  readonly colors: ChartColors;
  readonly muted: string;
  readonly plotted: number;
}

/**
 * The style of every indicator line in a frame. Overlays take the palette's slots after the plotted series, one per
 * indicator and series, so an average never shares a colour with a price; a pane's lines take the first slots, its
 * histogram the up and down colours.
 */
function indicatorStyles(
  chart: LayoutChart,
  frame: ChartFrameData,
  { colors, muted, plotted }: StyleColors,
): readonly IndicatorStyle[] {
  // Lines follow a series of a line chart, of its price column and with the series' key.
  const price = chart.y[0] ?? "";
  const panes = paneIndexes(chart);
  const groups = new Map<string, number>();
  const order = [...new Set(frame.indicators.map((line) => line.series))];
  const many = order.length > 1;
  const color = (slot: number): string => colors.series[slot] ?? muted;
  return frame.indicators.map((line): IndicatorStyle => {
    const indicator = chart.indicators[line.indicator] ?? { kind: "volume" };
    const series = many && line.series !== "" ? ` ${line.series}` : "";
    const group = `${indicatorLabel(indicator)}${series}`;
    const follows = price === "" ? "" : seriesLabel(frame, { column: price, key: line.series });
    const pane = panes[line.indicator] ?? null;
    if (pane === null) {
      return overlayStyle({
        color: color(plotted + slotOf(groups, group)),
        follows,
        group,
        indicator,
        line: line.line,
      });
    }
    return paneStyle(line, { color, follows, group, many, order, pane, series });
  });
}

export { indicatorLabel, indicatorStyles, overlays, paneSpecs };
export type { StyleColors };
