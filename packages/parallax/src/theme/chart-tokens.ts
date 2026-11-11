/* The charts' colours as tokens: `--px-series-1` to `--px-series-8`, `--px-up`, `--px-ramp-1` and so on, each with
 * the defaults that `charts.ts` holds, which `@basis/ui`'s generator writes from its default theme. */

import { chartColors } from "./charts.ts";
import type { TokenSpec } from "./kinds.ts";

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

export { chartEntries, chartLists, chartSingles };
