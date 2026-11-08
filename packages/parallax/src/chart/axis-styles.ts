/* Value axes labelled in the plotted column's style, where its format has one a desk reads its numbers in: a
 * percentage, such as a yield, basis points, a price in 32nds, or par amounts' M, MM and BN. The labels are
 * `@basis/ui`'s formatter's, the TypeScript port of the engine's, so the axis reads as the column's cells and tooltips
 * do. Other formats keep the axis's round numbers, which label the axis, not data. */

import { createFormatter, displayFormatMetadata, readDisplayFormat } from "@basis/ui";
import type { DisplayFormat } from "@basis/ui";
import { tableFromIPC } from "apache-arrow";

import { parseLayout } from "#layout/layout.ts";
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

/** A Treasury price's steps, as the API names them and as a layout does. */
const precisions = {
  "32nd": "thirty_seconds",
  eighth: "eighths",
  half: "halves",
  quarter: "quarters",
} as const;

/** The style fields of an API's display format: a percentage, basis points, or 32nds to its step. */
function declaredStyle(declared: DisplayFormat): Partial<LayoutFormat> {
  switch (declared.kind) {
    case "pct": {
      return { percent: true };
    }
    case "bps": {
      return { bps: true };
    }
    case "price32": {
      return { thirty_seconds: precisions[declared.step ?? "32nd"] };
    }
    case "number":
    case "money":
    case "price": {
      return {};
    }
    default: {
      return declared satisfies never;
    }
  }
}

/** The layout format an API's display format reads as, as parallax-protocol's display module reads it, for the
 * styles a value axis takes: a percentage, basis points or 32nds; other kinds give only their decimals. */
function layoutFormatOf(declared: DisplayFormat): LayoutFormat | undefined {
  const decimals = "decimals" in declared ? (declared.decimals ?? null) : null;
  return parseLayout({ formats: { column: { decimals, ...declaredStyle(declared) } } }).formats[
    "column"
  ];
}

/**
 * The display formats an API declares on its columns, under `basis.format` in the Arrow field metadata of the table a
 * view opened on, as layout formats by column: what the engine formats the column's text by unless the layout says
 * otherwise, which a value axis follows too.
 */
function declaredFormats(tableSchema: Uint8Array | null): Readonly<Record<string, LayoutFormat>> {
  if (tableSchema === null || tableSchema.length === 0) {
    return {};
  }
  const formats: Record<string, LayoutFormat> = {};
  for (const field of tableFromIPC(tableSchema).schema.fields) {
    const declared = readDisplayFormat(field.metadata.get(displayFormatMetadata));
    const format = declared === undefined ? undefined : layoutFormatOf(declared);
    if (format !== undefined) {
      formats[field.name] = format;
    }
  }
  return formats;
}

/**
 * The formats a chart's value axes are labelled in: by column, the layout's own over those its API declares, and the
 * first measure's, its own or its column's.
 */
function axisFormats(
  layout: Layout | null,
  declared: Readonly<Record<string, LayoutFormat>> = {},
): Pick<ModelInput, "formats" | "measureFormat"> {
  const formats = { ...declared, ...layout?.formats };
  const [measure] = layout?.measures ?? [];
  const column = measure?.column ?? null;
  const measureFormat = measure?.format ?? (column === null ? null : (formats[column] ?? null));
  return { formats, measureFormat };
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
/** A thousand, and par amounts' units, largest first, with the suffixes bond markets write them with. */
const thousand = 1000;
const million = thousand * thousand;
const billion = million * thousand;
const parUnits: readonly (readonly [number, string])[] = [
  [billion * thousand, "TN"],
  [billion, "BN"],
  [million, "MM"],
  [thousand, "M"],
];

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

/**
 * Round numbers in one par unit for the whole axis, the largest its step is at least one of, as a desk writes them:
 * steps of 200 million read 200MM, 400MM and so on to 1,000MM, not 0.2BN. Steps under a thousand keep the axis's own
 * labels.
 */
function parTicks(scale: Scale, count: number): readonly ValueTick[] {
  const step = roundStep(scale.domain[1] - scale.domain[0], count);
  const values = multiples(scale.domain, step);
  const unit = parUnits.find(([size]) => step >= size);
  if (unit === undefined) {
    const labels = tickLabels(values, step);
    return ticksAt(scale, values, (_value, i) => labels[i] ?? "");
  }
  const [size, suffix] = unit;
  const decimals = decimalsOf(step / size);
  const written = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
  return ticksAt(scale, values, (value) =>
    value === 0 ? "0" : `${written.format(value / size)}${suffix}`,
  );
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

export { axisFormats, declaredFormats, plain, styleOf, styledTicks };
export type { AxisStyle };
