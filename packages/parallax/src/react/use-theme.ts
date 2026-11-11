/* `useParallaxTheme()`: the theme a parallax component draws in, and the attributes that make its element a host of
 * the theme's tokens. */

import type { ChartColors } from "#theme/charts.ts";
import { readChartColors, readTheme } from "#theme/read.ts";
import type { Theme } from "#theme/read.ts";

import type { ParallaxThemeState } from "./context.ts";
import { useThemeState } from "./context.ts";

/** The attributes a component's element carries to draw in the theme: its scheme and theme. */
interface ParallaxThemeAttributes {
  readonly "data-px-scheme": ParallaxThemeState["scheme"];
  readonly "data-px-theme": string;
}

/** The tokens in effect for an element, as a canvas draws with them, and the theme state they were read in. */
interface ParallaxTokens {
  readonly theme: Theme;
  readonly colors: ChartColors;
  /** The name of the theme they were read in. */
  readonly themeName: string;
  readonly scheme: ParallaxThemeState["scheme"];
  readonly density: ParallaxThemeState["density"];
  readonly changes: number;
}

/** The theme state, with the host attributes and the reader of an element's tokens. */
interface ParallaxThemeInfo extends ParallaxThemeState {
  readonly attributes: ParallaxThemeAttributes;
  /** Reads the tokens in effect for an element. A new function whenever the tokens may have changed, so an effect
   * that depends on it reads them again, and repaints. */
  readonly read: (element: Element) => ParallaxTokens;
}

/**
 * The theme a component inside `ParallaxProvider` draws in. Spread `attributes` on the component's element, and read
 * its tokens with `read(element)` in an effect that depends on `read`, which changes whenever they may have:
 *
 *   const { attributes, read } = useParallaxTheme();
 *   useEffect(() => { paint(canvas, read(canvas)); }, [read]);
 */
function useParallaxTheme(): ParallaxThemeInfo {
  const state = useThemeState();
  const { changes, density, scheme } = state;
  const themeName = state.theme.name;
  return {
    ...state,
    attributes: {
      "data-px-scheme": scheme,
      "data-px-theme": themeName,
    },
    read: (element) => ({
      changes,
      colors: readChartColors(element),
      density,
      scheme,
      theme: readTheme(element),
      themeName,
    }),
  };
}

export { useParallaxTheme };
export type { ParallaxThemeAttributes, ParallaxThemeInfo, ParallaxTokens };
