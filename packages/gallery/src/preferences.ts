/* The gallery takes its mode, density and theme from the page's query when the query names them, so a screenshot can
 * ask for one combination, as in `?mode=dark&density=compact&theme=desk`, without touching the stored choice. Without them the page
 * follows the stored preferences, as an app does. */

import { themeNames } from "@basis/ui";
import type { Density, Preferences, ResolvedMode, ThemeName } from "@basis/ui";

function isMode(value: string | null): value is ResolvedMode {
  return value === "light" || value === "dark";
}

function isDensity(value: string | null): value is Density {
  return value === "comfortable" || value === "compact";
}

function isTheme(value: string | null): value is ThemeName {
  return themeNames.some((name) => name === value);
}

/** The preferences a query asks for, each one it leaves out taken from `stored`; `null` when it names none. */
function queryPreferences(search: string, stored: Preferences): Preferences | null {
  const query = new URLSearchParams(search);
  const mode = query.get("mode");
  const density = query.get("density");
  const theme = query.get("theme");
  if (!isMode(mode) && !isDensity(density) && !isTheme(theme)) {
    return null;
  }
  return {
    density: isDensity(density) ? density : stored.density,
    mode: isMode(mode) ? mode : stored.mode,
    motion: stored.motion,
    theme: isTheme(theme) ? theme : stored.theme,
  };
}

export { queryPreferences };
