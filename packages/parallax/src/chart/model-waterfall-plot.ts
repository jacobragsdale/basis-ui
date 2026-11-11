/* How a waterfall's bars are placed: the plot and value scale that hold every step, the total and their labels, each
 * step's floating bar in its group's band, and the connectors between them. */

import { barLabel, barPlot, barRect, barSlots } from "./model-bar-plot.ts";
import { categoryAxis } from "./model-categories.ts";
import type { CategoryData, Mark, ModelInput, Rect, Scale } from "./model-types.ts";
import { dimmed, lineHeightOf, padOf, xAxisHeight } from "./model-shared.ts";
import { pixel } from "./scale.ts";

/** The total bar's category label. */
const totalLabel = "Total";
/** The room a step's label leaves at its band's edges. */
const bandMargin = 4;

/** The gap between a step's end and its label, with a margin. */
const labelGap = 6;

/** A group's step: from the running total before it to its own. */
interface Step {
  readonly from: number;
  readonly to: number;
}

/** Where a waterfall's bars go. */
interface Placement {
  readonly plot: Rect;
  readonly value: Scale;
  readonly band: number;
  readonly thickness: number;
  readonly offset: number;
  readonly categories: readonly string[];
  readonly labels: ReturnType<typeof categoryAxis>;
}

/**
 * The values a waterfall's scale covers, with room past both ends for a label: steps fall below zero as well as rise
 * above it, so the bottom's label needs room as much as the top's.
 */
function withLabelSpace(input: ModelInput, values: readonly number[]): readonly number[] {
  if (!input.chart.labels) {
    return values;
  }
  const [low, high] = [Math.min(0, ...values), Math.max(0, ...values)];
  const length = input.height - xAxisHeight - padOf(input);
  // The room a step's label takes past its end: a line and its gap.
  const labelSpace = lineHeightOf(input) + labelGap;
  const room = ((high - low) * labelSpace) / Math.max(1, length - 2 * labelSpace);
  return [...values, low < 0 ? low - room : low, high > 0 ? high + room : high];
}

/** The plot, value scale and bands of a waterfall's groups and its total, with room for their labels. */
function placement(
  input: ModelInput,
  {
    data,
    steps,
    total,
  }: {
    readonly data: CategoryData;
    readonly steps: readonly (Step | null)[];
    readonly total: number;
  },
  texts: readonly string[],
): Placement {
  const categories = [...data.categories, ...(Number.isFinite(total) ? [totalLabel] : [])];
  const ends = steps.flatMap((step) => (step === null ? [] : [step.from, step.to]));
  const totals = withLabelSpace(input, [0, ...ends, ...(Number.isFinite(total) ? [total] : [])]);
  const fit = (xAxis: number): ReturnType<typeof barPlot> =>
    barPlot(input, { labelWidth: 0, texts, totals, xAxis });
  const labels = categoryAxis(input, categories, fit(xAxisHeight).plot.width);
  const { plot, value } = fit(labels.height);
  const band = plot.width / Math.max(1, categories.length);
  const slots = barSlots(band, 1, false);
  return {
    band,
    categories,
    labels,
    offset: slots.offset(0),
    plot,
    thickness: slots.thickness,
    value,
  };
}

/** The bar from `from` to `to` in band `i`, coloured `color`, which says `text` and tells `rows` in its tooltip. */
function stepMark(
  input: ModelInput,
  place: Placement,
  bar: {
    readonly i: number;
    readonly from: number;
    readonly to: number;
    readonly color: string;
    readonly text: string;
    readonly title: string;
    readonly rows: readonly { readonly label: string; readonly value: string }[];
    /** The group a click on it selects, if it stands for one. */
    readonly category: number | null;
  },
): Mark {
  const geometry = {
    horizontal: false,
    stacked: false,
    thickness: place.thickness,
    value: place.value,
  };
  const across = place.plot.x + bar.i * place.band + place.offset;
  return {
    ...barRect(geometry, { across, amount: bar.to - bar.from, start: bar.from }),
    color: bar.color,
    dim: dimmed(input, bar.title),
    hit: { rows: bar.rows, title: bar.title },
    ...(bar.category === null ? {} : { category: bar.category }),
    ...barLabel(input, bar.text, place.band - bandMargin),
  };
}

/** The connectors: from each bar's end across to where the next one starts, at the running total between them. */
function connectors(input: ModelInput, place: Placement, levels: readonly number[]): Mark {
  const segments: Float64Array[] = [];
  for (const [i, level] of levels.entries()) {
    if (i + 1 < place.categories.length) {
      const y = pixel(place.value, level);
      const from = place.plot.x + i * place.band + place.offset + place.thickness;
      segments.push(Float64Array.of(from, y, from + place.band - place.thickness, y));
    }
  }
  return { baseline: null, color: input.muted, dashed: false, kind: "line", segments, width: 1 };
}

export { connectors, placement, stepMark, totalLabel };
export type { Placement, Step };
