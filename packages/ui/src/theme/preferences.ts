/* The user's mode, density and motion. They live in one cookie, on the parent domain the firm's apps share when the
 * app names it, so every app follows one choice and a page left open follows a change made in another app. */

type ModePreference = "system" | "light" | "dark";
type Density = "comfortable" | "compact";
/** `full` moves as the operating system allows; `reduced` stops every transition and animation as
 * `prefers-reduced-motion` does, for a desktop whose Windows setting is not the user's to change. */
type Motion = "full" | "reduced";
type ResolvedMode = "light" | "dark";

interface Preferences {
  readonly mode: ModePreference;
  readonly density: Density;
  readonly motion: Motion;
}

interface CookieOptions {
  /** The parent domain the firm's apps share, such as `apps.example.com`. Without it, the choice is this app's alone. */
  readonly domain?: string;
}

/** The parts of the page's root element that the preferences set. An `HTMLElement` has them all; its document's
 * window, when there is one, lets a change hold transitions off until it is drawn. */
interface PreferencesRoot {
  readonly classList: Pick<DOMTokenList, "toggle">;
  readonly style: Pick<CSSStyleDeclaration, "colorScheme">;
  readonly dataset: DOMStringMap;
  readonly ownerDocument?:
    | { readonly defaultView: Pick<Window, "requestAnimationFrame"> | null }
    | undefined;
}

/** Compact is the default density, the maintainer's choice on 2026-11-07. The stylesheet's base is the comfortable
 * spacing, which `data-density="compact"` shrinks, so a page shows the default once the head script or
 * `followPreferences` has run; a component rendered without either, as in a test, is comfortable. */
const defaultPreferences: Preferences = { density: "compact", mode: "system", motion: "full" };

/** The cookie's name. Its value is the mode, the density and the motion joined by dots, such as `dark.compact.full`; a
 * value of two, written before the motion was, reads as `full`. */
const preferencesCookie = "basis-ui-preferences";

const darkQuery = "(prefers-color-scheme: dark)";
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

/** Reads the preferences from a `document.cookie` string. Anything missing or unknown falls back to the default. */
function parsePreferences(cookies: string): Preferences {
  for (const part of cookies.split(";")) {
    const separator = part.indexOf("=");
    if (separator !== -1 && part.slice(0, separator).trim() === preferencesCookie) {
      const [mode, density, motion] = part
        .slice(separator + 1)
        .trim()
        .split(".");
      return {
        density: isDensity(density) ? density : defaultPreferences.density,
        mode: isMode(mode) ? mode : defaultPreferences.mode,
        motion: isMotion(motion) ? motion : defaultPreferences.motion,
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
  const value = `${preferences.mode}.${preferences.density}.${preferences.motion}`;
  return `${preferencesCookie}=${value}; ${attributes.join("; ")}`;
}

/** The mode a page shows, given the preference and whether the operating system is in dark mode. */
function resolveMode(mode: ModePreference, systemDark: boolean): ResolvedMode {
  if (mode === "system") {
    return systemDark ? "dark" : "light";
  }
  return mode;
}

/** Holds every transition off until the frame after next, through the theme's `data-switching` rule. The next frame
 * computes the changed styles with transitions off, so none starts, and draws the change; the one after puts them back
 * on, with nothing left to transition to. A transition already running ends where it is. Each hold counts itself in
 * the attribute, so a change made while an earlier one is held is held its own two frames. */
function holdTransitions(root: PreferencesRoot, view: Pick<Window, "requestAnimationFrame">): void {
  const hold = String(Number(root.dataset["switching"] ?? "0") + 1);
  root.dataset["switching"] = hold;
  view.requestAnimationFrame(() => {
    view.requestAnimationFrame(() => {
      if (root.dataset["switching"] === hold) {
        delete root.dataset["switching"];
      }
    });
  });
}

/** What the preferences put on the page's root element. */
interface Shown {
  readonly mode: ResolvedMode;
  readonly density: "compact" | undefined;
  readonly motion: "reduced" | undefined;
}

/** Whether the root element shows something other than `shown`. */
function differs(root: PreferencesRoot, shown: Shown): boolean {
  return (
    root.style.colorScheme !== shown.mode ||
    root.dataset["density"] !== shown.density ||
    root.dataset["motion"] !== shown.motion
  );
}

/** Puts `shown` on the root element. */
function show(root: PreferencesRoot, { mode, density, motion }: Shown): void {
  root.classList.toggle("dark", mode === "dark");
  root.style.colorScheme = mode;
  if (density === undefined) {
    delete root.dataset["density"];
  } else {
    root.dataset["density"] = density;
  }
  if (motion === undefined) {
    delete root.dataset["motion"];
  } else {
    root.dataset["motion"] = motion;
  }
}

/** Puts the preferences on the page's root element: the `dark` class, `color-scheme`, `data-density` and
 * `data-motion`. A change to any of them holds every transition off until it is drawn, so the page changes in one
 * frame, as its canvases do, where some sixty controls' colours would otherwise cross-fade and a density change lay
 * the page out frame by frame. */
function applyPreferences(
  root: PreferencesRoot,
  preferences: Preferences,
  systemDark: boolean,
): void {
  const shown: Shown = {
    density: preferences.density === "compact" ? "compact" : undefined,
    mode: resolveMode(preferences.mode, systemDark),
    motion: preferences.motion === "reduced" ? "reduced" : undefined,
  };
  const view = root.ownerDocument?.defaultView ?? null;
  if (view !== null && differs(root, shown)) {
    holdTransitions(root, view);
  }
  show(root, shown);
}

/** The preferences stored in this page's cookies. */
function readPreferences(): Preferences {
  return parsePreferences(document.cookie);
}

/** Stores the preferences and applies them to this page at once. Other pages follow through `followPreferences`. */
function writePreferences(preferences: Preferences, options: CookieOptions = {}): void {
  // oxlint-disable-next-line unicorn/no-document-cookie -- the cookie is what carries the choice between apps.
  document.cookie = serializePreferences(preferences, options);
  applyPreferences(document.documentElement, preferences, matchMedia(darkQuery).matches);
}

/** Applies the stored preferences now, and again whenever the cookie or the operating system's mode changes. Given
 * `shown`, it applies those in place of the stored ones and follows only the operating system's mode, which a
 * `system` mode reads: for a page told its preferences another way, as the gallery is by its query. Returns a
 * function that stops following them. */
function followPreferences(shown?: Preferences): () => void {
  const media = matchMedia(darkQuery);
  const apply = (): void => {
    applyPreferences(document.documentElement, shown ?? readPreferences(), media.matches);
  };
  apply();
  media.addEventListener("change", apply);
  /* A window left open in view gets no focus or visibility event when another app changes the cookie; only the
   * cookie store's change event reaches it. Browsers without a cookie store pick the change up on the next load. */
  const store =
    shown === undefined ? (globalThis as { cookieStore?: EventTarget }).cookieStore : undefined;
  store?.addEventListener("change", apply);
  return () => {
    media.removeEventListener("change", apply);
    store?.removeEventListener("change", apply);
  };
}

/** A script for the page's `<head>` that applies the stored preferences before the first paint, so the page never
 * flashes the wrong mode. It repeats `parsePreferences` and `applyPreferences` in plain JavaScript; a test holds the
 * two to the same answers. */
const headScript = `(() => {
  try {
    const match = /(?:^|;\\s*)${preferencesCookie}=([a-z]+)\\.([a-z]+)(?:\\.([a-z]+))?/.exec(document.cookie);
    const stored = match === null ? "system" : match[1];
    const mode = stored === "light" || stored === "dark" ? stored : matchMedia("${darkQuery}").matches ? "dark" : "light";
    const root = document.documentElement;
    root.classList.toggle("dark", mode === "dark");
    root.style.colorScheme = mode;
    if (match === null || match[2] !== "comfortable") {
      root.dataset.density = "compact";
    }
    if (match !== null && match[3] === "reduced") {
      root.dataset.motion = "reduced";
    }
  } catch {
    // Without cookies or matchMedia the page keeps the stylesheet's light, comfortable base.
  }
})();`;

export {
  applyPreferences,
  defaultPreferences,
  followPreferences,
  headScript,
  parsePreferences,
  preferencesCookie,
  readPreferences,
  resolveMode,
  serializePreferences,
  writePreferences,
};
export type {
  CookieOptions,
  Density,
  ModePreference,
  Motion,
  Preferences,
  PreferencesRoot,
  ResolvedMode,
};
