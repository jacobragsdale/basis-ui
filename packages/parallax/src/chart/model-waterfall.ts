/* The draw model of a waterfall of the layout's grouped view, as attribution and P&L explain are drawn: each group's
 * step floats from the running total before it to the one after, rising steps in the up colour and falling ones in
 * the down colour, joined by connectors, and a total bar from zero ends them. The view carries the first measure and
 * the engine's running total of it, so every step's ends are exact sums and the last one ends on the total; the
 * labels are the engine's text. */

import { styleOf } from "./axis-styles.ts";
import { categoryLabels } from "./model-categories.ts";
import type {
  CategoryData,
  CategorySeries,
  ChartModel,
  LegendEntry,
  Mark,
  ModelInput,
} from "./model-types.ts";
import { axis, emptyModel, hidden, seriesColor } from "./model-shared.ts";
import { connectors, placement, stepMark, totalLabel } from "./model-waterfall-plot.ts";
import type { Placement, Step } from "./model-waterfall-plot.ts";

/** The legend's names for rising and falling steps. */
const rising = "Increase";
const falling = "Decrease";

/** Each group's step, from the level the steps before it reached to its running total; none for a group with no value. */
function stepsOf(first: CategorySeries, runs: CategorySeries): readonly (Step | null)[] {
  let level = 0;
  return first.values.map((value, i) => {
    if (!Number.isFinite(value)) {
      return null;
    }
    const step = { from: level, to: runs.values[i] ?? Number.NaN };
    level = step.to;
    return step;
  });
}

/** Why the steps can't be drawn: a running total that is no number, such as one across units, or steps that miss the
 * total because groups are hidden. Null when they can. */
function refusal(
  data: CategoryData,
  { first, runs }: { readonly first: CategorySeries; readonly runs: CategorySeries },
  steps: readonly (Step | null)[],
): string | null {
  const broken = steps.findIndex((step) => step !== null && !Number.isFinite(step.to));
  if (broken !== -1) {
    const category = data.categories[broken] ?? "";
    return `A waterfall can't run on past ${category}: its running total is ${runs.texts[broken] ?? ""}`;
  }
  const reached = steps.findLast((step) => step !== null)?.to ?? 0;
  const total = first.totalValue ?? Number.NaN;
  return Number.isFinite(total) && total !== reached
    ? "A waterfall's steps don't reach its total: show every group, or keep the rest as Other"
    : null;
}

/** The legend: rising and falling steps, and the total. */
function waterfallLegend(input: ModelInput): readonly LegendEntry[] {
  const entry = (label: string, color: string): LegendEntry => ({
    color,
    hidden: hidden(input, label),
    label,
    shape: "rect",
  });
  return [
    entry(rising, input.colors.up),
    entry(falling, input.colors.down),
    entry(totalLabel, seriesColor(input, 0)),
  ];
}

/** Each group's step as a bar, in the up or down colour, unless its kind is hidden. */
function stepMarks(
  input: ModelInput,
  {
    data,
    steps,
    first,
    runs,
  }: {
    readonly data: CategoryData;
    readonly steps: readonly (Step | null)[];
    readonly first: CategorySeries;
    readonly runs: CategorySeries;
  },
  place: Placement,
): Mark[] {
  return steps.flatMap((step, i): Mark[] => {
    const up = step !== null && step.to >= step.from;
    if (step === null || step.to === step.from || hidden(input, up ? rising : falling)) {
      return [];
    }
    const text = first.texts[i] ?? "";
    return [
      stepMark(input, place, {
        ...step,
        // "Other" stands for several groups and selects nothing.
        category: data.others[i] === true ? null : i,
        color: up ? input.colors.up : input.colors.down,
        i,
        rows: [
          { label: first.label, value: text },
          { label: runs.label, value: runs.texts[i] ?? "" },
        ],
        text,
        title: data.categories[i] ?? "",
      }),
    ];
  });
}

/** The level each group's step ends at, a group with no value carrying the level before it across. */
function carriedLevels(steps: readonly (Step | null)[]): readonly number[] {
  let level = 0;
  return steps.map((step) => {
    level = step?.to ?? level;
    return level;
  });
}

/** The total bar, from zero to the grand total, after the last group, unless it is hidden or there is no total. */
function totalMarks(
  input: ModelInput,
  place: Placement,
  { data, first }: { readonly data: CategoryData; readonly first: CategorySeries },
): Mark[] {
  const total = first.totalValue ?? Number.NaN;
  if (!Number.isFinite(total) || hidden(input, totalLabel)) {
    return [];
  }
  const text = first.total ?? "";
  return [
    stepMark(input, place, {
      category: null,
      color: seriesColor(input, 0),
      from: 0,
      i: data.categories.length,
      rows: [{ label: first.label, value: text }],
      text,
      title: totalLabel,
      to: total,
    }),
  ];
}

/** The model of a waterfall of the steps worked out from `first` and its running totals `runs`. */
function waterfallOf(
  input: ModelInput,
  data: CategoryData,
  parts: {
    readonly first: CategorySeries;
    readonly runs: CategorySeries;
    readonly steps: readonly (Step | null)[];
  },
): ChartModel {
  const { first, steps } = parts;
  // A waterfall stands upright and its steps float: it is neither across nor stacked.
  const upright = {
    ...input,
    chart: { ...input.chart, horizontal: false, log_y: false, stacked: false },
  };
  const texts = [...first.texts, ...(first.total === null ? [] : [first.total])];
  const total = first.totalValue ?? Number.NaN;
  const place = placement(upright, { data, steps, total }, texts);
  const positions = (i: number): number => place.plot.x + (i + 1 / 2) * place.band;
  return {
    empty: data.categories.length === 0 ? "No groups to show" : null,
    events: [],
    height: input.height,
    indicators: [],
    legend: waterfallLegend(input),
    marks: [
      connectors(input, place, carriedLevels(steps)),
      ...stepMarks(upright, { data, ...parts }, place),
      ...totalMarks(upright, place, { data, first }),
    ],
    panes: [],
    plot: place.plot,
    width: input.width,
    x: null,
    xLabelRoom: place.labels.room,
    xTicks: categoryLabels(place.categories, positions, place.labels),
    yAxes: [axis("left", place.value, { style: styleOf(input.measureFormat) })],
    yLabels: [],
  };
}

/**
 * A waterfall of the grouped view's first measure: a step per group, in the view's order, from the running total
 * before it to its own, and a total bar. The view's second column is the engine's running total of the first, which
 * the chart's engine layout adds; a waterfall whose steps would not reach its total, because an aggregate filter or a
 * top-N without "Other" hides groups, is refused rather than drawn with a gap.
 */
function waterfallModel(input: ModelInput, data: CategoryData): ChartModel {
  const [first, runs] = data.series;
  if (first === undefined || runs === undefined) {
    return emptyModel(input, "No values to show");
  }
  const steps = stepsOf(first, runs);
  const refused = refusal(data, { first, runs }, steps);
  return refused === null
    ? waterfallOf(input, data, { first, runs, steps })
    : emptyModel(input, refused);
}

export { waterfallModel };
