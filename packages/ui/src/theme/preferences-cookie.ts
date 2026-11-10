/* The cookie that holds the user's mode, density, motion and theme: its name, its value and the domain it takes. */

import { themeNames } from "./theme-names.ts";

type ModePreference = "system" | "light" | "dark";
type Density = "comfortable" | "compact";
/** `full` moves as the operating system allows; `reduced` stops every transition and animation as
 * `prefers-reduced-motion` does, for a desktop whose Windows setting is not the user's to change. */
type Motion = "full" | "reduced";
/** A theme `@basis/ui` ships, by its name: `default`, until more ship. */
type ThemeName = (typeof themeNames)[number];

interface Preferences {
  readonly mode: ModePreference;
  readonly density: Density;
  readonly motion: Motion;
  /** The theme, by its name, which the page's root carries as `data-theme`. */
  readonly theme: ThemeName;
}

interface CookieOptions {
  /** The parent domain the firm's apps share, such as `apps.example.com`. Without it, the choice is this app's alone.
   * A page whose host is neither the domain nor under it, such as `localhost` in development, stores the choice for
   * itself alone, since a browser refuses a cookie for another domain. */
  readonly domain?: string | undefined;
}

/** Compact is the default density, the maintainer's choice on 2026-11-07. The stylesheet's base is compact too, and
 * `data-density="comfortable"` widens it, so a page shows the default before the head script or `followPreferences`
 * has run, and without either, as in a test. */
const defaultPreferences: Preferences = {
  density: "compact",
  mode: "system",
  motion: "full",
  theme: themeNames[0],
};

/** The cookie's name. Its value is the mode, the density, the motion and the theme joined by dots, such as
 * `dark.compact.full.default`. A value written before the motion or the theme was reads them as the default's, and so
 * does a theme no longer shipped, since a user's cookie can outlive a theme. */
const preferencesCookie = "basis-ui-preferences";

const secondsPerDay = 86_400;
const daysPerYear = 365;
const oneYear = secondsPerDay * daysPerYear;

function isMode(value: string | undefined): value is ModePreference {
  return value === "system" || value === "light" || value === "dark";
}

function isDensity(value: string | undefined): value is Density {
  return value === "comfortable" || value === "compact";
}

function isMotion(value: string | undefined): value is Motion {
  return value === "full" || value === "reduced";
}

function isTheme(value: string | undefined): value is ThemeName {
  return themeNames.some((name) => name === value);
}

/** Reads the preferences from a `document.cookie` string. Anything missing or unknown falls back to the default. */
function parsePreferences(cookies: string): Preferences {
  for (const part of cookies.split(";")) {
    const separator = part.indexOf("=");
    if (separator !== -1 && part.slice(0, separator).trim() === preferencesCookie) {
      const [mode, density, motion, theme] = part
        .slice(separator + 1)
        .trim()
        .split(".");
      return {
        density: isDensity(density) ? density : defaultPreferences.density,
        mode: isMode(mode) ? mode : defaultPreferences.mode,
        motion: isMotion(motion) ? motion : defaultPreferences.motion,
        theme: isTheme(theme) ? theme : defaultPreferences.theme,
      };
    }
  }
  return defaultPreferences;
}

/** The `document.cookie` assignment that stores the preferences for a year. */
function serializePreferences(preferences: Preferences, options: CookieOptions = {}): string {
  const attributes = [`Path=/`, `Max-Age=${String(oneYear)}`, "SameSite=Lax"];
  if (options.domain !== undefined) {
    attributes.push(`Domain=${options.domain}`);
  }
  const value = [preferences.mode, preferences.density, preferences.motion, preferences.theme].join(
    ".",
  );
  return `${preferencesCookie}=${value}; ${attributes.join("; ")}`;
}

/** The domain the cookie takes on a page at `host`: `domain` when `host` is it or under it, as
 * `positions.apps.example.com` is under `apps.example.com`, and none otherwise, as on `localhost`, where a browser would
 * refuse a cookie for the shared domain. */
function cookieDomain(domain: string | undefined, host: string): string | undefined {
  const shared = domain?.replace(/^\./u, "").toLowerCase();
  if (shared === undefined || shared === "") {
    return undefined;
  }
  const page = host.toLowerCase();
  return page === shared || page.endsWith(`.${shared}`) ? shared : undefined;
}

/** The assignment that removes the cookie this app keeps for itself alone, which a browser would list before the shared
 * one, so that a choice made before the app named its domain cannot hide the shared one. */
const hostOnlyRemoval = `${preferencesCookie}=; Path=/; Max-Age=0; SameSite=Lax`;

export {
  cookieDomain,
  defaultPreferences,
  hostOnlyRemoval,
  parsePreferences,
  preferencesCookie,
  serializePreferences,
};
export type { CookieOptions, Density, ModePreference, Motion, Preferences, ThemeName };
