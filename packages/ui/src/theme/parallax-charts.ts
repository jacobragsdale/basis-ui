// Parallax's chart colours, from a theme: the module `vp run @basis/ui#theme` writes to
// `packages/parallax/src/theme/charts.ts`. Parallax's `basis` theme reads these tokens live from the page; the module
// holds the values a canvas draws with before the stylesheet applies, so that they are the theme's and not a copy kept
// by hand. A test in this package fails when the committed module differs from what this produces. `@basis/ui` never
// depends on parallax: this writes a file, and imports nothing of it.

import { tokenValue } from "./colours.ts";
import type { Mode, ThemeInputs } from "./inputs.ts";

/** The tokens each of parallax's chart colours takes, by its name in parallax's `ChartColors`: the categorical slots,
 * gain and loss for candles that close up and down, the sequential scale, and the diverging scale's neutral midpoint
 * and its arm above it, the red one, from the midpoint out. */
const sources = {
  down: "loss",
  middle: "div-6",
  negativeRamp: ["div-7", "div-8", "div-9", "div-10", "div-11"],
  ramp: ["seq-1", "seq-2", "seq-3", "seq-4", "seq-5", "seq-6", "seq-7", "seq-8", "seq-9"],
  series: ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6", "chart-7", "chart-8"],
  up: "gain",
} as const;

const indent = "  ";

/** One mode's colours as the lines of an object literal, its keys in order, at `depth` levels of indent. */
function modeLines(theme: ThemeInputs, inMode: Mode, depth: number): readonly string[] {
  const pad = indent.repeat(depth);
  return Object.entries(sources).flatMap(([key, source]) => {
    if (typeof source === "string") {
      return [`${pad}${key}: ${JSON.stringify(tokenValue(theme, source, inMode))},`];
    }
    const items = source.map(
      (name) => `${pad}${indent}${JSON.stringify(tokenValue(theme, name, inMode))},`,
    );
    return [`${pad}${key}: [`, items.join("\n"), `${pad}],`];
  });
}

/** The module of parallax's chart colours in `theme`, in both modes. */
function parallaxChartsModule(theme: ThemeInputs): string {
  return `// Written by \`vp run @basis/ui#theme\` from @basis/ui's ${theme.name} theme; do not edit it by hand. The colours charts
// draw data with, beside the tokens they share with the grid: the theme's \`chart-1\` to \`chart-8\`, \`gain\` and
// \`loss\`, the sequential scale, and the diverging scale's midpoint and red arm. The \`basis\` theme reads those tokens
// live from the page; these are what a canvas draws before the stylesheet applies.

import type { ResolvedScheme } from "./kinds.ts";

/** The colours charts draw data with. */
interface ChartColors {
  /** Categorical slots, assigned to series in this order and never cycled. */
  readonly series: readonly string[];
  /** Candles that close above their open, drawn hollow. */
  readonly up: string;
  /** Candles that close below their open, drawn filled. */
  readonly down: string;
  /** A sequential ramp from near zero to the most, for densities and heatmaps. */
  readonly ramp: readonly string[];
  /** The neutral midpoint, and the negative arm from it, when a heatmap's values take both signs. */
  readonly middle: string;
  readonly negativeRamp: readonly string[];
}

/** Chart colours by scheme: a categorical order checked for colour-vision deficiency on each scheme's surface. */
const chartColors: Readonly<Record<ResolvedScheme, ChartColors>> = {
  dark: {
${modeLines(theme, "dark", 2).join("\n")}
  },
  light: {
${modeLines(theme, "light", 2).join("\n")}
  },
};

export { chartColors };
export type { ChartColors };
`;
}

export { parallaxChartsModule };
