// The user's mode and density. Both live in one cookie, on the parent domain the firm's apps share when the app names
// it, so every app follows one choice and a page left open follows a change made in another app.

export type ModePreference = "system" | "light" | "dark";
export type Density = "comfortable" | "compact";
export type ResolvedMode = "light" | "dark";

export interface Preferences {
  readonly mode: ModePreference;
  readonly density: Density;
}

export interface CookieOptions {
  /** The parent domain the firm's apps share, such as `apps.example.com`. Without it, the choice is this app's alone. */
  readonly domain?: string;
}

export const defaultPreferences: Preferences = { mode: "system", density: "comfortable" };

/** The cookie's name. Its value is the mode and the density joined by a dot, such as `dark.compact`. */
export const preferencesCookie = "basis-ui-preferences";

const darkQuery = "(prefers-color-scheme: dark)";
const oneYear = 60 * 60 * 24 * 365;

function isMode(value: string | undefined): value is ModePreference {
  return value === "system" || value === "light" || value === "dark";
}

function isDensity(value: string | undefined): value is Density {
  return value === "comfortable" || value === "compact";
}

/** Reads the preferences from a `document.cookie` string. Anything missing or unknown falls back to the default. */
export function parsePreferences(cookies: string): Preferences {
  for (const part of cookies.split(";")) {
    const separator = part.indexOf("=");
    if (separator !== -1 && part.slice(0, separator).trim() === preferencesCookie) {
      const [mode, density] = part
        .slice(separator + 1)
        .trim()
        .split(".");
      return {
        mode: isMode(mode) ? mode : defaultPreferences.mode,
        density: isDensity(density) ? density : defaultPreferences.density,
      };
    }
  }
  return defaultPreferences;
}

/** The `document.cookie` assignment that stores the preferences for a year. */
export function serializePreferences(
  preferences: Preferences,
  options: CookieOptions = {},
): string {
  const attributes = [`Path=/`, `Max-Age=${String(oneYear)}`, "SameSite=Lax"];
  if (options.domain !== undefined) {
    attributes.push(`Domain=${options.domain}`);
  }
  return `${preferencesCookie}=${preferences.mode}.${preferences.density}; ${attributes.join("; ")}`;
}

/** The mode a page shows, given the preference and whether the operating system is in dark mode. */
export function resolveMode(mode: ModePreference, systemDark: boolean): ResolvedMode {
  if (mode === "system") {
    return systemDark ? "dark" : "light";
  }
  return mode;
}

/** Puts the preferences on the page's root element: the `dark` class, `color-scheme`, and `data-density`. */
export function applyPreferences(
  root: HTMLElement,
  preferences: Preferences,
  systemDark: boolean,
): void {
  const mode = resolveMode(preferences.mode, systemDark);
  root.classList.toggle("dark", mode === "dark");
  root.style.colorScheme = mode;
  if (preferences.density === "compact") {
    root.dataset["density"] = "compact";
  } else {
    delete root.dataset["density"];
  }
}

/** The preferences stored in this page's cookies. */
export function readPreferences(): Preferences {
  return parsePreferences(document.cookie);
}

/** Stores the preferences and applies them to this page at once. Other pages follow through `followPreferences`. */
export function writePreferences(preferences: Preferences, options: CookieOptions = {}): void {
  // oxlint-disable-next-line unicorn/no-document-cookie -- the cookie is what carries the choice between apps.
  document.cookie = serializePreferences(preferences, options);
  applyPreferences(document.documentElement, preferences, matchMedia(darkQuery).matches);
}

/** Applies the preferences now, and again whenever the cookie or the operating system's mode changes. Returns a
 * function that stops following them. */
export function followPreferences(): () => void {
  const media = matchMedia(darkQuery);
  const apply = (): void => {
    applyPreferences(document.documentElement, readPreferences(), media.matches);
  };
  apply();
  media.addEventListener("change", apply);
  // A window left open in view gets no focus or visibility event when another app changes the cookie; only the
  // cookie store's change event reaches it. Browsers without a cookie store pick the change up on the next load.
  const store = (globalThis as { cookieStore?: EventTarget }).cookieStore;
  store?.addEventListener("change", apply);
  return () => {
    media.removeEventListener("change", apply);
    store?.removeEventListener("change", apply);
  };
}

/** A script for the page's `<head>` that applies the stored preferences before the first paint, so the page never
 * flashes the wrong mode. It repeats `parsePreferences` and `applyPreferences` in plain JavaScript; a test holds the
 * two to the same answers. */
export const headScript = `(() => {
  try {
    const match = /(?:^|;\\s*)${preferencesCookie}=([a-z]+)\\.([a-z]+)/.exec(document.cookie);
    const stored = match === null ? "system" : match[1];
    const mode = stored === "light" || stored === "dark" ? stored : matchMedia("${darkQuery}").matches ? "dark" : "light";
    const root = document.documentElement;
    root.classList.toggle("dark", mode === "dark");
    root.style.colorScheme = mode;
    if (match !== null && match[2] === "compact") {
      root.dataset.density = "compact";
    }
  } catch {
    // Without cookies or matchMedia the page keeps the light, comfortable default.
  }
})();`;
