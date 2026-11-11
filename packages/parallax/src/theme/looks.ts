/* Two looks of parallax's own, which ship in no app and which `src/index.ts` does not export: the tests draw in them to show that a theme made with
 * `defineTheme` reaches every canvas, beside the `basis` theme every app draws in. */

import { defineTheme, token } from "./define.ts";
import type { ParallaxTheme } from "./define.ts";

/** Parallax's own defaults, unchanged: dense, with faint column lines and stripes. */
const standardTheme: ParallaxTheme = defineTheme({ name: "standard" });

/** A roomier look: taller rows and header, wider padding, no lines between columns and a hairline between rows in
 * place of stripes, and a header on the grid's own background. */
const airyTheme: ParallaxTheme = defineTheme({
  name: "airy",
  params: {
    cellPadding: 12,
    columnBorder: "transparent",
    groupBackground: `color-mix(in srgb, ${token("accent")} 5%, ${token("background")})`,
    headerBackground: token("background"),
    headerHeight: 38,
    rowBorder: `color-mix(in srgb, ${token("foreground")} 8%, ${token("background")})`,
    rowHeight: 30,
    spacing: 5,
    stripe: "transparent",
    totalBackground: token("background"),
  },
});

export { airyTheme, standardTheme };
