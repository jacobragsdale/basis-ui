/* The `basis` theme: parallax drawn in `@basis/ui`'s theme, the one every app has. Each value names one of
 * `@basis/ui`'s tokens, so it switches with the page's mode as every component does, and the canvas reads it resolved
 * to a concrete colour or length. Tokens it leaves out keep parallax's own defaults, most of which derive from these.
 *
 * Charts take `chart-1` to `chart-8` in order, gains and losses for candles, the sequential scale for a heatmap's
 * positive values, and for its negative ones the red arm of the diverging scale, out from its neutral midpoint. */

import { defineTheme } from "./define.ts";
import type { ParallaxTheme } from "./define.ts";

const chartSlots = 8;
const sequentialSteps = 9;
const firstRedStep = 7;
const divergingSteps = 11;
// Cards' corners: the theme's `rounded-xl`.
const cardRadius = "calc(var(--radius) * 1.4)";

/** `var(--name-1)` to `var(--name-last)`. */
function steps(name: string, first: number, last: number): readonly string[] {
  return Array.from(
    { length: last - first + 1 },
    (_entry, index) => `var(--${name}-${String(first + index)})`,
  );
}

/** Parallax in `@basis/ui`'s theme; `ParallaxProvider`'s default. */
const basisTheme: ParallaxTheme = defineTheme({
  name: "basis",
  params: {
    accent: "var(--primary)",
    background: "var(--card)",
    borderColor: "var(--border)",
    chromeBackground: "var(--muted)",
    controlBorder: "var(--input)",
    danger: "var(--destructive)",
    down: "var(--loss)",
    focus: "var(--ring)",
    fontFamily: "var(--font-sans)",
    foreground: "var(--card-foreground)",
    highlight: "var(--highlight)",
    middle: "var(--div-6)",
    muted: "var(--muted-foreground)",
    negative: "var(--loss)",
    negativeRamp: steps("div", firstRedStep, divergingSteps),
    onAccent: "var(--primary-foreground)",
    radius: "var(--radius)",
    ramp: steps("seq", 1, sequentialSteps),
    selectionBackground: "var(--selection)",
    series: steps("chart", 1, chartSlots),
    spacing: "var(--spacing)",
    up: "var(--gain)",
    warning: "var(--warning)",
    wrapperRadius: cardRadius,
  },
});

export { basisTheme };
