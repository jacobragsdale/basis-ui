/* The gallery takes its mode and density from the page's query when the query names them, so a screenshot can ask for
 * one combination, as in `?mode=dark&density=compact`, without touching the stored choice. Without them the page
 * follows the stored preferences, as an app does. */

import type { Density, Preferences, ResolvedMode } from "@basis/ui";

function isMode(value: string | null): value is ResolvedMode {
  return value === "light" || value === "dark";
}

function isDensity(value: string | null): value is Density {
  return value === "comfortable" || value === "compact";
}

/** The preferences a query asks for, each one it leaves out taken from `stored`; `null` when it names neither. */
function queryPreferences(search: string, stored: Preferences): Preferences | null {
  const query = new URLSearchParams(search);
  const mode = query.get("mode");
  const density = query.get("density");
  if (!isMode(mode) && !isDensity(density)) {
    return null;
  }
  return {
    density: isDensity(density) ? density : stored.density,
    mode: isMode(mode) ? mode : stored.mode,
    motion: stored.motion,
  };
}

export { queryPreferences };
