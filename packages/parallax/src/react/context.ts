/* What `ParallaxProvider` gives the components and hooks inside it: the page's engine, and the theme they draw in. */

import type { Density } from "@basis/ui";
import { createContext, use } from "react";

import type { ParallaxClient } from "#engine/client.ts";
import type { ParallaxTheme } from "#theme/define.ts";
import type { ResolvedScheme } from "#theme/kinds.ts";

/** The theme a parallax component draws in, as `ParallaxProvider` resolves it from its props and the page. */
interface ParallaxThemeState {
  readonly theme: ParallaxTheme;
  /** The scheme drawn: by default the page's mode, which `@basis/ui`'s preferences set. */
  readonly scheme: ResolvedScheme;
  /** The page's density. */
  readonly density: Density;
  /** Rises whenever the tokens may have changed without a prop changing: the mode, the density, the system's colour
   * scheme or the fonts. A canvas reads its tokens again, and repaints, when it does. */
  readonly changes: number;
}

const ParallaxClientContext = createContext<ParallaxClient | null>(null);
const ParallaxThemeContext = createContext<ParallaxThemeState | null>(null);

const missingProvider =
  "Parallax's hooks and components need a ParallaxProvider above them; wrap the app, or the part that shows parallax, in <ParallaxProvider worker={...}>.";

/** The page's engine, from the nearest `ParallaxProvider`. Throws without one. */
function useParallaxClient(): ParallaxClient {
  const client = use(ParallaxClientContext);
  if (client === null) {
    throw new Error(missingProvider);
  }
  return client;
}

/** The theme state from the nearest `ParallaxProvider`. Throws without one. */
function useThemeState(): ParallaxThemeState {
  const state = use(ParallaxThemeContext);
  if (state === null) {
    throw new Error(missingProvider);
  }
  return state;
}

export { ParallaxClientContext, ParallaxThemeContext, useParallaxClient, useThemeState };
export type { ParallaxThemeState };
