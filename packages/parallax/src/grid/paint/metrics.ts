/* The sizes a grid draws with, in CSS pixels, from its theme's tokens, and how its colours decide what to draw. */

import { leadingNumber, pixels } from "#theme/lengths.ts";
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
  /** The focused cell's ring: its width and its corners' radius. */
  readonly ring: { readonly width: number; readonly radius: number };
}

// The tokens' own defaults, for a token that is not a length.
const fallbackIcon = 14;
const fallbackPadding = 8;
const fallbackRow = 24;
const fallbackIndent = 14;
const fallbackRing = 2;
/** A sort arrow is drawn at 85 % of the header's icons. */
const arrowShare = 0.85;
/** The marker's gap after the icon. */
const markerGap = 4;

/** The sizes `tokens` give. */
function metricsOf(tokens: Theme): Metrics {
  const iconPx = pixels(tokens.iconSize, fallbackIcon);
  const padding = pixels(tokens.cellPadding, fallbackPadding);
  return {
    arrowPx: Math.round(iconPx * arrowShare),
    funnelPx: iconPx + padding,
    headerPx: Math.max(1, Math.round(pixels(tokens.headerHeight, fallbackRow))),
    iconPx,
    indent: pixels(tokens.indent, fallbackIndent),
    markerPx: iconPx + markerGap,
    padding,
    ring: {
      radius: pixels(tokens.selectionRadius, fallbackRing),
      width: pixels(tokens.selectionWidth, fallbackRing),
    },
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
