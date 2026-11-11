/* The looks the harness draws in: `basis`, the theme every app has, and `angular`, parallax's standard theme with the
 * Angular layer's chart colours, so that the React chart's canvas can be compared pixel for pixel with the Angular
 * demo's screenshots wherever the renderer is the same. */

import { basisTheme, defineTheme } from "#index.ts";
import type { ParallaxTheme } from "#index.ts";

import { standardTheme } from "#theme/looks.ts";

/** The Angular layer's chart colours, `CHART_COLORS` in web/projects/parallax/src/lib/theme.ts. Its ramps have seven
 * steps where the React layer's have nine and five, so densities and heatmaps cannot match. */
const angularTheme: ParallaxTheme = defineTheme({
  dark: {
    down: "#e66767",
    middle: "#383835",
    series: [
      "#3987e5",
      "#d95926",
      "#199e70",
      "#c98500",
      "#d55181",
      "#008300",
      "#9085e9",
      "#e66767",
    ],
    up: "#199e70",
  },
  extends: standardTheme,
  light: {
    down: "#e34948",
    middle: "#f0efec",
    series: [
      "#2a78d6",
      "#eb6834",
      "#1baf7a",
      "#eda100",
      "#e87ba4",
      "#008300",
      "#6250d6",
      "#e34948",
    ],
    up: "#1baf7a",
  },
  name: "angular",
});

/** The look a page asks for in its `look` parameter: `basis` unless it says `angular`. */
function lookOf(search: URLSearchParams): ParallaxTheme {
  return search.get("look") === "angular" ? angularTheme : basisTheme;
}

export { lookOf };
