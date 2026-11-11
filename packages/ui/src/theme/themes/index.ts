// The themes `@basis/ui` ships, which `vp run @basis/ui#theme` writes into `src/styles/theme.css`. The default comes
// first and sits at `:root`; each other theme sits under `[data-theme="name"]`. `vp run @basis/ui#theme new NAME`
// starts a theme's inputs file, which is added here.

import type { ThemeInputs } from "#theme/inputs.ts";

import { theme as defaultTheme } from "./default.ts";
import { theme as desk } from "./desk.ts";
import { theme as highContrast } from "./high-contrast.ts";

/** Every shipped theme, the default first. */
const themes: readonly [ThemeInputs, ...ThemeInputs[]] = [defaultTheme, desk, highContrast];

export { themes };
export { theme as defaultTheme } from "./default.ts";
