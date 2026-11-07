/* Scales and value-axis ticks for charts.
 *
 * The engine places and labels the x axis. The y axis spans values the browser already holds, so its round-number
 * ticks are made here. They label the axis, not data: every data value a reader sees comes as the engine's text. */

import type { Scale, ValueTick } from "./model-types.ts";

const ten = 10;
const five = 5;
/** The multiples of a power of ten a round step takes. */
const roundSteps = [1, 2, five, ten] as const;
/** Values this close to a whole number of steps count as on it. */
const epsilon = 1e-9;
/** The most decimals an axis label shows. */
const maxDecimals = 12;
/** From this largest value on, an axis's labels are compact: K, M, B and T. */
const compactFrom = 1e4;
const thousand = 1e3;
const million = 1e6;
const billion = 1e9;
const trillion = 1e12;
const suffixes: readonly (readonly [number, string])[] = [
  [trillion, "T"],
  [billion, "B"],
  [million, "M"],
  [thousand, "K"],
];

/**
 * `value` in pixels on `scale`. Every caller places values through this rather than `scale.map(value)`, which the
 * lint reads as an array's `map` handed a function reference.
 */
function pixel(scale: Scale, value: number): number {
  const { map } = scale;
  return map(value);
}

/** A linear scale from `domain` onto `range`. */
function linearScale(domain: readonly [number, number], range: readonly [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 === 0 ? 1 : d1 - d0;
  return {
    domain,
    invert: (px) => d0 + ((px - r0) / (r1 - r0 === 0 ? 1 : r1 - r0)) * span,
    log: false,
    map: (value) => r0 + ((value - d0) / span) * (r1 - r0),
    range,
  };
}

/** A base-10 logarithmic scale from a positive `domain` onto `range`. Values at or below zero map to the range's
 * start. */
function logScale(domain: readonly [number, number], range: readonly [number, number]): Scale {
  const [l0, l1] = [Math.log10(domain[0]), Math.log10(domain[1])];
  const inner = linearScale([l0, l1], range);
  return {
    domain,
    invert: (px) => ten ** inner.invert(px),
    log: true,
    map: (value) => (value > 0 ? inner.map(Math.log10(value)) : range[0]),
    range,
  };
}

/** A round step of 1, 2 or 5 times a power of ten near `span / count`. */
function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const power = ten ** Math.floor(Math.log10(raw));
  return roundSteps.map((multiple) => multiple * power).find((step) => step >= raw) ?? ten * power;
}

/** How a domain is rounded: about `count` steps, and whether it reaches zero. */
interface NiceOptions {
  readonly count: number;
  readonly zero: boolean;
}

/**
 * A domain that covers `min..max` and ends on round steps, about `count` of them. With `zero`, the domain also
 * reaches zero, as bars and areas, which grow from a baseline, need.
 */
function niceDomain(
  min: number,
  max: number,
  { count, zero }: NiceOptions,
): readonly [number, number] {
  let [low, high] = [zero ? Math.min(0, min) : min, zero ? Math.max(0, max) : max];
  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    return [0, 1];
  }
  if (low === high) {
    [low, high] = low === 0 ? [0, 1] : [low - Math.abs(low) / 2, high + Math.abs(high) / 2];
  }
  const step = niceStep(high - low, count);
  return [Math.floor(low / step) * step, Math.ceil(high / step) * step];
}

/** A positive domain for a log scale covering `min..max`, widened to whole powers of ten. */
function logDomain(min: number, max: number): readonly [number, number] {
  if (!(min > 0) || !(max > 0)) {
    return [1, ten];
  }
  const low = ten ** Math.floor(Math.log10(min));
  const high = ten ** Math.ceil(Math.log10(max));
  return [low, high === low ? low * ten : high];
}

/** The decimals that show every multiple of `scaled` exactly. */
function decimalsOf(scaled: number): number {
  let decimals = 0;
  while (
    decimals < maxDecimals &&
    Math.abs(Math.round(scaled * ten ** decimals) - scaled * ten ** decimals) >
      epsilon * ten ** decimals
  ) {
    decimals += 1;
  }
  return decimals;
}

/**
 * Labels for an axis's tick values, one style per axis: in full while the axis stays under 10,000, compact (K, M,
 * B, T) once it reaches it; with as many decimals as the step needs.
 */
function tickLabels(values: readonly number[], step: number): readonly string[] {
  const largest = Math.max(0, ...values.map((value) => Math.abs(value)));
  const [divisor, suffix] =
    largest >= compactFrom ? (suffixes.find(([size]) => largest >= size) ?? [1, ""]) : [1, ""];
  // Ticks are multiples of the step, so the step's own decimals show each exactly.
  const decimals = decimalsOf(step / divisor);
  const format = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
  return values.map((value) => (value === 0 ? "0" : `${format.format(value / divisor)}${suffix}`));
}

/** The ticks of a log scale: its powers of ten. */
function logTicks(scale: Scale): readonly ValueTick[] {
  const [low, high] = scale.domain;
  const values: number[] = [];
  for (
    let power = Math.ceil(Math.log10(low) - epsilon);
    power <= Math.floor(Math.log10(high) + epsilon);
    power += 1
  ) {
    values.push(ten ** power);
  }
  // One style for the axis: compact throughout once it reaches 10,000, where every power from 1,000 takes a suffix.
  const compact = (values.at(-1) ?? 0) >= compactFrom;
  const labels = values.map((value) =>
    compact && value >= thousand
      ? (tickLabels([value, compactFrom], value)[0] ?? "")
      : (tickLabels([value], value)[0] ?? ""),
  );
  return values.map((value, i) => ({ label: labels[i] ?? "", px: pixel(scale, value), value }));
}

/** About `count` round ticks across a scale's domain: steps of 1, 2 or 5 on a linear scale, powers of ten on a log
 * one. */
function valueTicks(scale: Scale, count: number): readonly ValueTick[] {
  if (scale.log) {
    return logTicks(scale);
  }
  const [low, high] = scale.domain;
  const step = niceStep(high - low, count);
  const values: number[] = [];
  for (let i = Math.ceil(low / step - epsilon); i <= Math.floor(high / step + epsilon); i += 1) {
    values.push(Math.abs(i * step) < step * epsilon ? 0 : i * step);
  }
  const labels = tickLabels(values, step);
  return values.map((value, i) => ({ label: labels[i] ?? "", px: pixel(scale, value), value }));
}

export { linearScale, logDomain, logScale, niceDomain, pixel, tickLabels, valueTicks };
export type { NiceOptions };
