/* The colours charts draw data with, beside the tokens they share with the grid. Their defaults are `@basis/ui`'s
 * data colours, `chart-1` to `chart-8`, the sequential scale and the red arm of the diverging scale, which the
 * `basis` theme reads live from the page; these are what a canvas draws before the stylesheet applies. */

import type { ResolvedScheme, TokenSpec } from "./kinds.ts";

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
    down: "oklch(0.75 0.1505 25)",
    middle: "oklch(0.348 0.0056 255)",
    negativeRamp: [
      "oklch(0.42 0.1703 25)",
      "oklch(0.52 0.2 25)",
      "oklch(0.62 0.2 25)",
      "oklch(0.72 0.1742 25)",
      "oklch(0.82 0.1008 25)",
    ],
    ramp: [
      "oklch(0.27 0.0679 245)",
      "oklch(0.34 0.0855 245)",
      "oklch(0.41 0.1032 245)",
      "oklch(0.48 0.1208 245)",
      "oklch(0.55 0.1384 245)",
      "oklch(0.62 0.1561 245)",
      "oklch(0.69 0.16 245)",
      "oklch(0.76 0.1319 245)",
      "oklch(0.83 0.091 245)",
    ],
    series: [
      "#3c7dde",
      "#d54f00",
      "#2fa172",
      "#c68610",
      "#008300",
      "#d04782",
      "#9188eb",
      "#e96865",
    ],
    up: "oklch(0.86 0.16 150)",
  },
  light: {
    down: "oklch(0.36 0.1459 25)",
    middle: "oklch(0.935 0.0034 255)",
    negativeRamp: [
      "oklch(0.82 0.1008 25)",
      "oklch(0.72 0.1742 25)",
      "oklch(0.62 0.2 25)",
      "oklch(0.52 0.2 25)",
      "oklch(0.42 0.1703 25)",
    ],
    ramp: [
      "oklch(0.93 0.0361 245)",
      "oklch(0.86 0.0741 245)",
      "oklch(0.79 0.1141 245)",
      "oklch(0.72 0.1562 245)",
      "oklch(0.65 0.16 245)",
      "oklch(0.58 0.146 245)",
      "oklch(0.51 0.1284 245)",
      "oklch(0.44 0.1107 245)",
      "oklch(0.37 0.0931 245)",
    ],
    series: [
      "#2a78d6",
      "#f06350",
      "#1ea471",
      "#c88100",
      "#018200",
      "#cc74a4",
      "#5d44d4",
      "#db4848",
    ],
    up: "oklch(0.46 0.1267 150)",
  },
};

/** The lists of chart colours, by the property each colour's number follows: `series-1`, `ramp-1` and so on. */
const chartLists = [
  ["series", "series"],
  ["ramp", "ramp"],
  ["negative-ramp", "negativeRamp"],
] as const;

/** The single chart colours, by property. */
const chartSingles = ["up", "down", "middle"] as const;

/** Every chart colour's property and defaults, as a token: `series-1` to `series-8`, `up`, `ramp-1`, and so on. */
function chartEntries(): readonly TokenSpec[] {
  const { light, dark } = chartColors;
  const lists = chartLists.flatMap(([property, key]) =>
    light[key].map((value, index): TokenSpec => ({
      dark: dark[key][index] ?? value,
      light: value,
      property: `${property}-${String(index + 1)}`,
      syntax: "color",
    })),
  );
  const singles = chartSingles.map((key): TokenSpec => ({
    dark: dark[key],
    light: light[key],
    property: key,
    syntax: "color",
  }));
  return [...lists, ...singles];
}

export { chartColors, chartEntries, chartLists, chartSingles };
export type { ChartColors };
