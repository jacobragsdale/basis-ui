/* The sizes a grid draws with, in CSS pixels, from its theme's tokens, and how its colours decide what to draw. */

import type { Theme } from "#theme/read.ts";

/** The sizes a grid draws with. */
interface Metrics {
  readonly rowPx: number;
  readonly headerPx: number;
  /** Between a cell's edge and its text. */
  readonly padding: number;
  /** Each level of the group column's tree. */
  readonly indent: number;
  /** The header's icons: the funnel, the pin and a measure's chevron. */
  readonly iconPx: number;
  /** The room a header keeps at its right for the funnel that opens the column's menu. */
  readonly funnelPx: number;
  /** The room before a group's label for its expand marker. */
  readonly markerPx: number;
  /** A sort arrow. */
  readonly arrowPx: number;
}

// The tokens' own defaults, for a token that is not a length.
const fallbackIcon = 16;
const fallbackPadding = 6;
const fallbackRow = 24;
const fallbackIndent = 14;
/** The header draws its icons at seven eighths of the icon size, and a sort arrow at 85 % of that. */
const headerIconShare = 0.875;
const arrowShare = 0.85;
/** The marker's gap after the icon. */
const markerGap = 4;

/** The number a CSS value starts with, such as 24 for `24px` or 50 for `50%`; NaN for none. */
const leading = /^\s*(?<number>[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/iu;

function leadingNumber(value: string): number {
  const number = leading.exec(value)?.groups?.["number"];
  return number === undefined ? Number.NaN : Number(number);
}

/** A length token in pixels, or `otherwise` if it is not one. */
function pixels(value: string, otherwise: number): number {
  const parsed = leadingNumber(value);
  return Number.isFinite(parsed) ? parsed : otherwise;
}

/** The sizes `tokens` give. */
function metricsOf(tokens: Theme): Metrics {
  const iconPx = pixels(tokens.iconSize, fallbackIcon) * headerIconShare;
  const padding = pixels(tokens.cellPadding, fallbackPadding);
  return {
    arrowPx: Math.round(iconPx * arrowShare),
    funnelPx: iconPx + padding,
    headerPx: Math.max(1, Math.round(pixels(tokens.headerHeight, fallbackRow))),
    iconPx,
    indent: pixels(tokens.indent, fallbackIndent),
    markerPx: iconPx + markerGap,
    padding,
    rowPx: Math.max(1, Math.round(pixels(tokens.rowHeight, fallbackRow))),
  };
}

/** Whether a colour draws nothing, so the line it would draw can be skipped. */
function invisible(color: string): boolean {
  return color === "transparent" || color === "rgba(0, 0, 0, 0)";
}

const rgbaAlpha = /^rgba\((?:[^,]*,){3}\s*(?<alpha>[\d.]+%?)\s*\)$/u;
const slashAlpha = /\/\s*(?<alpha>[\d.]+%?)\s*\)$/u;
const whole = 100;

/**
 * Whether a colour lets what is under it show, as `rgba()` and `color(… / alpha)` with an alpha below 1 do. A cell
 * filled with one is filled with the background first, so that redrawing it never piles the colour up.
 */
function translucent(color: string): boolean {
  const alpha = (rgbaAlpha.exec(color) ?? slashAlpha.exec(color))?.groups?.["alpha"];
  if (invisible(color)) {
    return true;
  }
  if (alpha === undefined) {
    return false;
  }
  return alpha.endsWith("%") ? leadingNumber(alpha) < whole : Number(alpha) < 1;
}

export { invisible, metricsOf, translucent };
export type { Metrics };
