/* Category labels along a grouped chart's axes: level, broken onto two lines, or turned 45° and cut, and thinned only
 * where they would touch. Bar charts and heatmaps share them. */

import type { AxisTick, ModelInput } from "./model-types.ts";
import { lineHeight, maxLabel, pad, xAxisHeight } from "./model-shared.ts";
import { wrapText } from "./text.ts";

/** The most lines a level label breaks onto. */
const mostLines = 2;
/** The share of the chart's height a turned label may take, and a compact chart's. */
const turnedShare = 0.4;
const compactTurnedShare = 0.25;
/** The room under a turned label's end, in pixels. */
const turnedMargin = 6;

/** How category labels fit along the bottom of a plot, and the height of the axis they need. */
interface CategoryAxis {
  readonly height: number;
  /** Every how many categories a label is drawn. */
  readonly every: number;
  readonly rotated: boolean;
  /** Each label's lines, when labels break between their words. */
  readonly lines: readonly (readonly string[])[] | null;
  /** The longest a turned label is drawn. */
  readonly room: number;
}

/** Category labels down the side, thinned so that they do not overlap: each needs a line. */
function sideTicks(
  categories: readonly string[],
  position: (i: number) => number,
  length: number,
): readonly AxisTick[] {
  const every = Math.max(1, Math.ceil((lineHeight * categories.length) / Math.max(1, length)));
  return categories.flatMap((label, i) => (i % every === 0 ? [{ label, px: position(i) }] : []));
}

/** Turned 45°, a label's line takes its height times √2 along the axis; closer than that, labels would touch. */
function turnedAxis(input: ModelInput, band: number, widest: number): CategoryAxis {
  const every = Math.max(1, Math.ceil((lineHeight * Math.SQRT2) / Math.max(1, band)));
  const share = input.compact === true ? compactTurnedShare : turnedShare;
  const room = Math.max(
    0,
    Math.min(widest, maxLabel, input.height * share * Math.SQRT2 - lineHeight),
  );
  return {
    every,
    height: Math.max(xAxisHeight, Math.ceil(turnedMargin + (room + lineHeight) / Math.SQRT2)),
    lines: null,
    room,
    rotated: true,
  };
}

/**
 * Lays out category labels along a plot `length` pixels wide: level if each fits its share of the width; else on two
 * lines, broken between words, if each then fits; else turned 45° and cut to a share of the chart's height. Only
 * labels that would touch even turned are thinned out.
 */
function categoryAxis(
  input: ModelInput,
  categories: readonly string[],
  length: number,
): CategoryAxis {
  const band = length / Math.max(1, categories.length);
  const widest = Math.max(0, ...categories.map((category) => input.measure(category)));
  if (widest + pad <= band) {
    return { every: 1, height: xAxisHeight, lines: null, room: widest, rotated: false };
  }
  // Lines may come closer than level labels: they read as blocks.
  const wrapped = categories.map((category) => wrapText(category, band - pad / 2, input.measure));
  if (
    wrapped.every(
      (lines) =>
        lines.length <= mostLines && lines.every((line) => input.measure(line) + pad / 2 <= band),
    )
  ) {
    return {
      every: 1,
      height: xAxisHeight + lineHeight,
      lines: wrapped,
      room: band - pad / 2,
      rotated: false,
    };
  }
  return turnedAxis(input, band, widest);
}

/** The ticks of `axis`'s labels, at `position`. */
function categoryLabels(
  categories: readonly string[],
  position: (i: number) => number,
  axis: CategoryAxis,
): readonly AxisTick[] {
  return categories.flatMap((label, i) => {
    if (i % axis.every !== 0) {
      return [];
    }
    const lines = axis.lines?.[i];
    return [
      {
        label,
        px: position(i),
        ...(axis.rotated ? { rotated: true } : {}),
        ...(lines === undefined ? {} : { lines }),
      },
    ];
  });
}

export { categoryAxis, categoryLabels, sideTicks };
export type { CategoryAxis };
