/* Value axes labelled in the plotted column's style, where its format has one a desk reads its numbers in: a
 * percentage, such as a yield, basis points, a price in 32nds, or par amounts' M, MM and BN. The labels are
 * `@basis/ui`'s formatter's, the TypeScript port of the engine's, so the axis reads as the column's cells and tooltips
 * do. Other formats keep the axis's round numbers, which label the axis, not data. */

import { createFormatter } from "@basis/ui";

import type { Layout, LayoutFormat } from "#layout/layout.ts";

import type { ModelInput, Scale, ValueTick } from "./model-types.ts";
import { pixel, tickLabels } from "./scale.ts";

/** A price's finest steps, as parts of a point. */
type Precision = "thirty-seconds" | "halves" | "quarters" | "eighths";

/** How a value axis writes its labels. */
type AxisStyle =
  | { readonly kind: "plain" }
  | { readonly kind: "percent" }
  | { readonly kind: "bps" }
  | { readonly kind: "thirty-seconds"; readonly precision: Precision }
  | { readonly kind: "par" };

const plain: AxisStyle = { kind: "plain" };

/** The style a column's format gives its axis. */
function styleOf(format: LayoutFormat | null | undefined): AxisStyle {
  if (format?.thirty_seconds !== undefined) {
    const precision =
      format.thirty_seconds === "thirty_seconds" ? "thirty-seconds" : format.thirty_seconds;
    return { kind: "thirty-seconds", precision };
  }
  if (format?.bps === true) {
    return { kind: "bps" };
  }
  if (format?.percent === true) {
    return { kind: "percent" };
  }
  return format?.suffixes === "par" ? { kind: "par" } : plain;
}

/** The formats a chart's value axes are labelled in: by column, and the first measure's, its own or its column's. */
function axisFormats(layout: Layout | null): Pick<ModelInput, "formats" | "measureFormat"> {
  const [measure] = layout?.measures ?? [];
  const column = measure?.column ?? null;
  const measureFormat =
    measure?.format ?? (column === null ? null : (layout?.formats[column] ?? null));
  return { formats: layout?.formats ?? {}, measureFormat };
}

const ten = 10;
const five = 5;
/** Values this close to a whole number of steps count as on it. */
const epsilon = 1e-9;
/** A basis point's and a percent's share of the whole. */
const bpsPerWhole = 10_000;
const percentPerWhole = 100;
/** The finest step each precision shows, as parts of a point. A 32nds axis steps by halvings of a point down to it. */
const partsOfAPoint: Readonly<Record<Precision, number>> = {
  eighths: 256,
  halves: 64,
  quarters: 128,
  "thirty-seconds": 32,
};
/** Par amounts' suffixes for the compact ones an axis would write. */
const parSuffixes: ReadonlyMap<string, string> = new Map([
  ["K", "M"],
  ["M", "MM"],
  ["B", "BN"],
  ["T", "TN"],
]);

/** The multiples of `step` across a domain. */
function multiples([low, high]: readonly [number, number], step: number): number[] {
  const values: number[] = [];
  for (let i = Math.ceil(low / step - epsilon); i <= Math.floor(high / step + epsilon); i += 1) {
    values.push(Math.abs(i * step) < step * epsilon ? 0 : i * step);
  }
  return values;
}

/** A round step of 1, 2 or 5 times a power of ten near `span / count`. */
function roundStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const power = ten ** Math.floor(Math.log10(raw));
  return (
    [1, 2, five, ten].map((multiple) => multiple * power).find((step) => step >= raw) ?? ten * power
  );
}

/** A step of a halving of a point no finer than the precision shows, or whole points and round numbers of them. */
function thirtySecondsStep(span: number, count: number, precision: Precision): number {
  const raw = span / Math.max(1, count);
  for (let parts = partsOfAPoint[precision]; parts >= 2; parts /= 2) {
    if (1 / parts >= raw) {
      return 1 / parts;
    }
  }
  return Math.max(1, roundStep(span, count));
}

/** The decimals that show every multiple of `step` exactly. */
function decimalsOf(step: number): number {
  let decimals = 0;
  while (
    decimals < ten &&
    Math.abs(Math.round(step * ten ** decimals) - step * ten ** decimals) > epsilon
  ) {
    decimals += 1;
  }
  return decimals;
}

/** Ticks at `values`, labelled by `label`. */
function ticksAt(
  scale: Scale,
  values: readonly number[],
  label: (value: number, i: number) => string,
): readonly ValueTick[] {
  return values.map((value, i) => ({ label: label(value, i), px: pixel(scale, value), value }));
}

function thirtySecondsTicks(
  scale: Scale,
  count: number,
  precision: Precision,
): readonly ValueTick[] {
  const step = thirtySecondsStep(scale.domain[1] - scale.domain[0], count, precision);
  const formatter = createFormatter({ thirtySeconds: precision });
  return ticksAt(scale, multiples(scale.domain, step), (value) => formatter.float(value));
}

function bpsTicks(scale: Scale, count: number): readonly ValueTick[] {
  const step = roundStep(scale.domain[1] - scale.domain[0], count);
  const formatter = createFormatter({ bps: true, decimals: decimalsOf(step * bpsPerWhole) });
  return ticksAt(scale, multiples(scale.domain, step), (value) => formatter.float(value));
}

function percentTicks(scale: Scale, count: number): readonly ValueTick[] {
  const step = roundStep(scale.domain[1] - scale.domain[0], count);
  const formatter = createFormatter({
    decimals: decimalsOf(step * percentPerWhole),
    percent: true,
  });
  return ticksAt(scale, multiples(scale.domain, step), (value) => formatter.float(value));
}

/** Round numbers, compact as the axis's own are past 10,000, with par amounts' suffixes. */
function parTicks(scale: Scale, count: number): readonly ValueTick[] {
  const step = roundStep(scale.domain[1] - scale.domain[0], count);
  const values = multiples(scale.domain, step);
  const labels = tickLabels(values, step).map((label) =>
    label.replace(/[BKMT]$/u, (suffix) => parSuffixes.get(suffix) ?? suffix),
  );
  return ticksAt(scale, values, (_value, i) => labels[i] ?? "");
}

/** About `count` ticks across a linear scale, labelled in `style`; none for a plain axis, whose ticks are the scale's
 * own. */
function styledTicks(scale: Scale, count: number, style: AxisStyle): readonly ValueTick[] {
  switch (style.kind) {
    case "thirty-seconds": {
      return thirtySecondsTicks(scale, count, style.precision);
    }
    case "bps": {
      return bpsTicks(scale, count);
    }
    case "percent": {
      return percentTicks(scale, count);
    }
    case "par": {
      return parTicks(scale, count);
    }
    case "plain": {
      return [];
    }
    default: {
      return style satisfies never;
    }
  }
}

export { axisFormats, plain, styleOf, styledTicks };
export type { AxisStyle };
