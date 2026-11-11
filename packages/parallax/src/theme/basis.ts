/* The `basis` theme: parallax drawn in `@basis/ui`'s theme, the one every app has. Each value names one of
 * `@basis/ui`'s tokens, so it switches with the page's mode as every component does, and the canvas reads it resolved
 * to a concrete colour or length. Tokens it leaves out keep parallax's own defaults, most of which derive from these.
 *
 * Text takes `--font-num`, the theme's face with tabular figures on, since a canvas cannot ask for them, so a column
 * of numbers lines up. It draws at the sizes of the DOM's text: `text-sm`, a table's, for cells and headers, and
 * `text-xs`, the chart's readouts', for axes and labels, whose lines are `text-xs`'s line height apart.
 *
 * A grid's sizes are the theme's control lengths, which follow the page's density: a row is as tall as a control of
 * the medium size, the size whose text is `text-sm` as a cell's is, so a control fits in a row, its text sits as far
 * from a cell's edge as from a control's, and its header's icons are that size's; the header is as tall as a large
 * control. The focused cell's ring is the focus ring's width, and a bar's rounded end the small radius.
 *
 * Charts take `chart-1` to `chart-8` in order, gains and losses for candles, the sequential scale for a heatmap's
 * positive values, and for its negative ones the red arm of the diverging scale, out from its neutral midpoint. */

import { defineTheme } from "./define.ts";
import type { ParallaxTheme } from "./define.ts";

const chartSlots = 8;
const sequentialSteps = 9;
const firstRedStep = 7;
const divergingSteps = 11;

/** `var(--name-1)` to `var(--name-last)`. */
function steps(name: string, first: number, last: number): readonly string[] {
  return Array.from(
    { length: last - first + 1 },
    (_entry, index) => `var(--${name}-${String(first + index)})`,
  );
}

/** Parallax in `@basis/ui`'s theme; `ParallaxProvider`'s default. */
const basisTheme: ParallaxTheme = defineTheme({
  // Labels on a bar or a slice take the card's colour or its text's, whichever reads; which is light is the mode's.
  dark: { darkInk: "var(--card)", lightInk: "var(--card-foreground)" },
  light: { darkInk: "var(--card-foreground)", lightInk: "var(--card)" },
  name: "basis",
  params: {
    accent: "var(--primary)",
    background: "var(--card)",
    barRadius: "var(--radius-sm)",
    borderColor: "var(--border)",
    cellPadding: "var(--control-md-inset)",
    chromeBackground: "var(--muted)",
    controlBorder: "var(--input)",
    down: "var(--loss)",
    fontFamily: "var(--font-num)",
    fontSize: "var(--text-sm)",
    fontSizeSmall: "var(--text-xs)",
    foreground: "var(--card-foreground)",
    headerHeight: "var(--control-lg-height)",
    highlight: "var(--highlight)",
    info: "var(--info)",
    infoSubtle: "var(--info-subtle)",
    iconSize: "var(--control-md-icon)",
    lineHeightSmall: "calc(var(--text-xs) * var(--text-xs--line-height))",
    middle: "var(--div-6)",
    muted: "var(--muted-foreground)",
    negative: "var(--loss)",
    negativeSubtle: "var(--destructive-subtle)",
    negativeRamp: steps("div", firstRedStep, divergingSteps),
    onAccent: "var(--primary-foreground)",
    positive: "var(--gain)",
    positiveSubtle: "var(--success-subtle)",
    ramp: steps("seq", 1, sequentialSteps),
    rowHeight: "var(--control-md-height)",
    selectionBackground: "var(--selection)",
    selectionWidth: "var(--focus-width)",
    series: steps("chart", 1, chartSlots),
    spacing: "var(--spacing)",
    up: "var(--gain)",
    warning: "var(--warning)",
    warningSubtle: "var(--warning-subtle)",
  },
});

export { basisTheme };
