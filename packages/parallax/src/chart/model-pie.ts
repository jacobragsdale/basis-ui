/* The draw model of a pie or donut of the grouped view's first measure. Its slices take their angles from the
 * measure's numbers, and its labels, tooltip and centre total from the engine's text. A selected group's slice stays
 * bright while the others dim. */

import type {
  CategoryData,
  CategorySeries,
  ChartModel,
  LegendEntry,
  Mark,
  ModelInput,
} from "./model-types.ts";
import { dimmed, emptyModel, hidden, padOf, seriesColor } from "./model-shared.ts";

/** A donut's hole, as a share of its radius. */
const hole = 0.6;
/** How far the slice under the pointer moves out, in pixels. */
const pop = 5;

/** A slice's colour: the categorical colours in the groups' order, and "Other" muted, as series past the eighth are. */
function sliceColor(input: ModelInput, data: CategoryData, index: number): string {
  return data.others[index] === true ? input.muted : seriesColor(input, index);
}

/**
 * What a pie notes beside each slice: its share of the whole when the view has one and every slice is shown, or else
 * its value. With a slice hidden, the rest fill the ring, so a share of the whole would misread them; a second
 * measure of another kind is never a slice's note.
 */
function notedSeries(input: ModelInput, data: CategoryData): CategorySeries | undefined {
  const whole = !data.categories.some((category) => hidden(input, category));
  const share = data.share === undefined ? undefined : data.series[data.share];
  return whole && share !== undefined ? share : data.series[0];
}

/** A pie's legend: every group, with its share or its value, as `notedSeries` says. */
function pieLegend(input: ModelInput, data: CategoryData): readonly LegendEntry[] {
  const noted = notedSeries(input, data);
  return data.categories.map((label, i) => ({
    color: sliceColor(input, data, i),
    hidden: hidden(input, label),
    label,
    note: noted?.texts[i] ?? "",
    shape: "rect",
  }));
}

/** Where a pie is drawn, and how far a slice moves out from its centre. */
interface PieGeometry {
  readonly cx: number;
  readonly cy: number;
  readonly outer: number;
  readonly inner: number;
  readonly out: number;
}

/** A slice's group, by its label and index, and the angles it spans. */
interface SliceAt {
  readonly label: string;
  readonly i: number;
  readonly start: number;
  readonly end: number;
}

/** The slice of group `i`, labelled with what the legend notes beside it: its share when the view has one. */
function sliceMark(
  input: ModelInput,
  { data, at }: { readonly data: CategoryData; readonly at: SliceAt },
  geometry: PieGeometry,
): Mark {
  const { label, i, start, end } = at;
  const hit = {
    rows: data.series.map((series) => ({ label: series.label, value: series.texts[i] ?? "" })),
    title: label,
  };
  const middle = (start + end) / 2;
  const text = notedSeries(input, data)?.texts[i] ?? "";
  return {
    category: data.others[i] === true ? null : i,
    color: sliceColor(input, data, i),
    cx: geometry.cx + Math.cos(middle) * geometry.out,
    cy: geometry.cy + Math.sin(middle) * geometry.out,
    dim: dimmed(input, label),
    end,
    hit,
    inner: geometry.inner,
    kind: "slice",
    outer: geometry.outer,
    start,
    ...(input.chart.labels && text !== "" ? { label: text } : {}),
  };
}

/** What a donut's hole says: the slice under the pointer, or else the total while every group is shown. */
function pieCentre(
  input: ModelInput,
  { data, first }: { readonly data: CategoryData; readonly first: CategorySeries },
  pointed: { readonly label: string; readonly i: number } | undefined,
): { readonly value: string; readonly label: string } | null {
  if (pointed !== undefined) {
    return { label: pointed.label, value: first.texts[pointed.i] ?? "" };
  }
  const whole = !data.categories.some((category) => hidden(input, category));
  return whole && first.total !== null ? { label: "Total", value: first.total } : null;
}

/** A group shown as a slice: its label, index and value. */
interface Slice {
  readonly label: string;
  readonly i: number;
  readonly amount: number;
}

/** The slices, clockwise from twelve o'clock in the view's order, the one under the pointer moved out. */
function sliceMarks(
  input: ModelInput,
  { data, shown }: { readonly data: CategoryData; readonly shown: readonly Slice[] },
  geometry: Omit<PieGeometry, "out">,
): Mark[] {
  let sum = 0;
  for (const { amount } of shown) {
    sum += amount;
  }
  const hovered = input.hovered ?? null;
  let angle = -Math.PI / 2;
  return shown.map(({ label, i, amount }) => {
    const start = angle;
    angle += (amount / sum) * 2 * Math.PI;
    // The slice under the pointer moves out from the centre, along its middle.
    const out = i === hovered && shown.length > 1 ? pop : 0;
    return sliceMark(input, { at: { end: angle, i, label, start }, data }, { ...geometry, out });
  });
}

/** The model of a pie whose first measure is `first`. */
function pieOf(input: ModelInput, data: CategoryData, first: CategorySeries): ChartModel {
  const padding = padOf(input);
  const plot = {
    height: Math.max(1, input.height - 2 * padding),
    width: Math.max(1, input.width - 2 * padding),
    x: padding,
    y: padding,
  };
  const [cx, cy] = [plot.x + plot.width / 2, plot.y + plot.height / 2];
  // Room for the slice under the pointer to move out without leaving the plot.
  const outer = Math.max(1, Math.min(plot.width, plot.height) / 2 - pop);
  const inner = input.chart.donut ? outer * hole : 0;
  const shown = data.categories
    .map((label, i) => ({ amount: first.values[i] ?? Number.NaN, i, label }))
    .filter(({ label, amount }) => Number.isFinite(amount) && amount > 0 && !hidden(input, label));
  const marks = sliceMarks(input, { data, shown }, { cx, cy, inner, outer });
  const hovered = input.hovered ?? null;
  return {
    centre:
      input.chart.donut && marks.length > 0
        ? pieCentre(
            input,
            { data, first },
            hovered === null ? undefined : shown.find(({ i }) => i === hovered),
          )
        : null,
    empty: marks.length === 0 ? "No values to show" : null,
    events: [],
    height: input.height,
    indicators: [],
    legend: pieLegend(input, data),
    marks,
    panes: [],
    plot,
    width: input.width,
    x: null,
    xTicks: [],
    yAxes: [],
    yLabels: [],
  };
}

/**
 * A pie or donut of the grouped view's first measure: a slice per group, sized by its number, clockwise from twelve
 * o'clock in the view's order. The engine's text labels everything, and a donut shows the total in its hole while every
 * group is shown. A share of a whole has no negative parts, so negative values are refused rather than drawn.
 */
function pieModel(input: ModelInput, data: CategoryData): ChartModel {
  const [first] = data.series;
  const negative = first?.values.findIndex((value) => value < 0) ?? -1;
  if (first === undefined) {
    return emptyModel(input, "No values to show");
  }
  if (negative !== -1) {
    const group = data.categories[negative] ?? "";
    return emptyModel(
      input,
      `A pie can't show negative values: ${group} is ${first.texts[negative] ?? ""}`,
    );
  }
  return pieOf(input, data, first);
}

export { pieModel };
