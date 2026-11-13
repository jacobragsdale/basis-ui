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
 * `dark.compact.full.default`, and `.host` after them in the cookie an app keeps for itself. A value written before the motion or the theme was reads them as the default's, and so
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

/** The last part of the value of the cookie an app keeps for itself, `dark.compact.full.default.host`. A page may be
 * sent two cookies of the name, its own and the one apps on the shared domain write, and a browser lists cookies of one
 * path oldest first (RFC 6265, 5.4), keeping a cookie's first creation time when it is written again, so their order
 * says nothing of which is the app's: the mark does. */
const hostOnlyMark = "host";

/** Where the mark sits: after the mode, the density, the motion and the theme. */
const markPart = 4;

/** The values of every cookie of the name in a `document.cookie` string, each split into its parts. */
function cookieValues(cookies: string): string[][] {
  return cookies.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    return separator !== -1 && part.slice(0, separator).trim() === preferencesCookie
      ? [
          part
            .slice(separator + 1)
            .trim()
            .split("."),
        ]
      : [];
  });
}

/** Reads the preferences from a `document.cookie` string: the cookie the app keeps for itself when there is one, which
 * a choice made in this app wrote, and otherwise the first. Anything missing or unknown falls back to the default. */
function parsePreferences(cookies: string): Preferences {
  const values = cookieValues(cookies);
  const chosen = values.find((parts) => parts.at(markPart) === hostOnlyMark) ?? values[0];
  if (chosen === undefined) {
    return defaultPreferences;
  }
  const [mode, density, motion, theme] = chosen;
  return {
    density: isDensity(density) ? density : defaultPreferences.density,
    mode: isMode(mode) ? mode : defaultPreferences.mode,
    motion: isMotion(motion) ? motion : defaultPreferences.motion,
    theme: isTheme(theme) ? theme : defaultPreferences.theme,
  };
}

/** The `document.cookie` assignment that stores the preferences for a year: on `options.domain` when it names one, and
 * otherwise for this app alone, its value marked as such. */
function serializePreferences(preferences: Preferences, options: CookieOptions = {}): string {
  const attributes = [`Path=/`, `Max-Age=${String(oneYear)}`, "SameSite=Lax"];
  const parts: string[] = [
    preferences.mode,
    preferences.density,
    preferences.motion,
    preferences.theme,
  ];
  if (options.domain === undefined) {
    parts.push(hostOnlyMark);
  } else {
    attributes.push(`Domain=${options.domain}`);
  }
  return `${preferencesCookie}=${parts.join(".")}; ${attributes.join("; ")}`;
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
  hostOnlyMark,
  hostOnlyRemoval,
  parsePreferences,
  preferencesCookie,
  serializePreferences,
};
export type { CookieOptions, Density, ModePreference, Motion, Preferences, ThemeName };
