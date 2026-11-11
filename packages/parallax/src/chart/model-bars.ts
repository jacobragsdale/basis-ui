/* The draw model of a bar chart of the layout's grouped view: a group per category, its series side by side or
 * stacked, upright or across, each bar's value at its end where it fits. A selected group's bars stay bright while
 * the others dim. */

import { styleOf, styledTicks } from "./axis-styles.ts";
import type { AxisStyle } from "./axis-styles.ts";
import { barExtent, barLabel, barPlot, barRect, barSlots } from "./model-bar-plot.ts";
import type { Visible } from "./model-bar-plot.ts";
import { categoryAxis, categoryLabels, sideTicks } from "./model-categories.ts";
import type { CategoryAxis } from "./model-categories.ts";
import type {
  AxisTick,
  CategoryData,
  ChartModel,
  Mark,
  ModelInput,
  Rect,
  Scale,
} from "./model-types.ts";
import {
  axis,
  dimmed,
  gap,
  hidden,
  legendOf,
  lineHeightOf,
  padOf,
  seriesColor,
  xAxisHeight,
} from "./model-shared.ts";
import { valueTicks } from "./scale.ts";

/** The room a lone bar's label leaves at its band's edges. */
const bandMargin = 4;
/** The most of the chart's width category labels beside bars may take. */
const labelWidthShare = 0.45;
/** Pixels per tick on the values running across. */
const pixelsPerAcrossTick = 90;

/** A category's stack so far: where its next segment above zero and below it starts. */
interface Stack {
  above: number;
  below: number;
}

/** Where a bar of `amount` starts: on its stack, which it then grows, or at zero when bars are not stacked. */
function stackOn(stack: Stack, amount: number, stacked: boolean): number {
  if (!stacked) {
    return 0;
  }
  const start = amount > 0 ? stack.above : stack.below;
  stack.above += Math.max(0, amount);
  stack.below += Math.min(0, amount);
  return start;
}

/** The width of category labels beside bars that run across. */
function sideLabelWidth(input: ModelInput, data: CategoryData): number {
  const widest = Math.max(0, ...data.categories.map((category) => input.measure(category)));
  return Math.min(input.width * labelWidthShare, widest + padOf(input) + 2);
}

/** How a bar chart's bars are placed in its plot. */
interface BarLayout {
  readonly plot: Rect;
  readonly value: Scale;
  readonly band: number;
  readonly slots: ReturnType<typeof barSlots>;
  /** The room across a bar for its label. */
  readonly room: number;
}

/** One category's bars, side by side or stacked. */
function categoryBars(
  input: ModelInput,
  {
    data,
    visible,
    c,
  }: { readonly data: CategoryData; readonly visible: readonly Visible[]; readonly c: number },
  layout: BarLayout,
): Mark[] {
  const { horizontal, stacked } = input.chart;
  const category = data.categories[c] ?? "";
  const stack: Stack = { above: 0, below: 0 };
  return visible.flatMap(({ series, i }, place): Mark[] => {
    const amount = series.values[c] ?? Number.NaN;
    if (!Number.isFinite(amount) || amount === 0) {
      return [];
    }
    const start = stackOn(stack, amount, stacked);
    const across =
      (horizontal ? layout.plot.y : layout.plot.x) + c * layout.band + layout.slots.offset(place);
    const geometry = {
      horizontal,
      stacked,
      thickness: layout.slots.thickness,
      value: layout.value,
    };
    const text = series.texts[c] ?? "";
    return [
      {
        ...barRect(geometry, { across, amount, start }),
        color: seriesColor(input, i),
        hit: { rows: [{ label: series.label, value: text }], title: category },
        ...(data.others[c] === true ? {} : { category: c }),
        dim: dimmed(input, category),
        ...barLabel(input, text, layout.room),
      },
    ];
  });
}

/** Where a bar chart's bars go, with category labels laid out along the bottom when bars stand upright. */
function barLayout(
  input: ModelInput,
  data: CategoryData,
  visible: readonly Visible[],
): BarLayout & { readonly categoryRoom: CategoryAxis | null } {
  const { horizontal, stacked } = input.chart;
  const totals = barExtent(data, visible, stacked);
  const texts = visible.flatMap(({ series }) => series.texts);
  const labelWidth = horizontal ? sideLabelWidth(input, data) : 0;
  // Upright bars' labels may need a taller axis, which shortens the plot; their width barely changes with it.
  const categoryRoom = horizontal
    ? null
    : categoryAxis(
        input,
        data.categories,
        barPlot(input, { labelWidth, texts, totals, xAxis: xAxisHeight }).plot.width,
      );
  const { plot, value } = barPlot(input, {
    labelWidth,
    texts,
    totals,
    xAxis: categoryRoom?.height ?? xAxisHeight,
  });
  const band = (horizontal ? plot.height : plot.width) / Math.max(1, data.categories.length);
  const slots = barSlots(band, visible.length, stacked);
  const room = stacked || visible.length <= 1 ? band - bandMargin : slots.thickness + 2 * gap;
  return { band, categoryRoom, plot, room, slots, value };
}

/** The value ticks along the bottom of horizontal bars, in the first measure's style. */
function acrossTicks(value: Scale, width: number, style: AxisStyle): AxisTick[] {
  const count = Math.max(2, width / pixelsPerAcrossTick);
  const ticks =
    style.kind === "plain" ? valueTicks(value, count) : styledTicks(value, count, style);
  return ticks.map((tick) => ({ label: tick.label, px: tick.px }));
}

/** The model of a bar chart. */
function barModel(input: ModelInput, data: CategoryData): ChartModel {
  const { horizontal } = input.chart;
  const visible = data.series
    .map((series, i) => ({ i, series }))
    .filter(({ series }) => !hidden(input, series.label));
  const layout = barLayout(input, data, visible);
  const { plot, value, band, categoryRoom } = layout;
  const marks = data.categories.flatMap((_category, c) =>
    categoryBars(input, { c, data, visible }, layout),
  );
  const positions = (i: number): number => (horizontal ? plot.y : plot.x) + (i + 1 / 2) * band;
  const style = styleOf(input.measureFormat);
  const across = horizontal ? acrossTicks(value, plot.width, style) : [];
  return {
    empty: data.categories.length === 0 ? "No groups to show" : null,
    events: [],
    height: input.height,
    indicators: [],
    legend: legendOf(
      input,
      data.series.map((series) => series.label),
      "rect",
    ),
    marks,
    panes: [],
    plot,
    verticalGrid: across.map((tick) => tick.px),
    width: input.width,
    x: null,
    xLabelRoom: categoryRoom?.room ?? 0,
    xTicks:
      categoryRoom === null ? across : categoryLabels(data.categories, positions, categoryRoom),
    yAxes: horizontal ? [] : [axis("left", value, { style })],
    yLabels: horizontal
      ? sideTicks(data.categories, positions, {
          length: plot.height,
          lineHeight: lineHeightOf(input),
        })
      : [],
  };
}

export { barModel };
