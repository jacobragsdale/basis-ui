/* The user's mode, density, motion and theme on the page. They live in one cookie (preferences-cookie.ts), on the
 * parent domain the firm's apps share when the app names it, so every app follows one choice and a page left open
 * follows a change made in another app. */

import {
  cookieDomain,
  hostOnlyMark,
  hostOnlyRemoval,
  parsePreferences,
  preferencesCookie,
  serializePreferences,
} from "./preferences-cookie.ts";
import type {
  CookieOptions,
  Density,
  ModePreference,
  Preferences,
  ThemeName,
} from "./preferences-cookie.ts";
import { themeNames } from "./theme-names.ts";

type ResolvedMode = "light" | "dark";

/** The parts of the page's root element that the preferences set. An `HTMLElement` has them all; its document's
 * window, when there is one, lets a change hold transitions off until it is drawn. */
interface PreferencesRoot {
  readonly classList: Pick<DOMTokenList, "toggle">;
  readonly style: Pick<CSSStyleDeclaration, "colorScheme">;
  readonly dataset: DOMStringMap;
  /** Announces a change, as `themeChangeEvent`; an element has it, and a stand-in may leave it out. */
  readonly dispatchEvent?: (event: Event) => boolean;
  readonly ownerDocument?:
    | { readonly defaultView: Pick<Window, "requestAnimationFrame"> | null }
    | undefined;
}

const darkQuery = "(prefers-color-scheme: dark)";

/** The event `applyPreferences` dispatches on the root element, bubbling to the document, once it has changed the
 * mode, density, motion or theme shown: whatever draws from the theme's tokens outside CSS, such as parallax's
 * canvases, reads them again. Code that changes the tokens in a way no attribute shows, such as by swapping a
 * stylesheet, dispatches it on the document. */
const themeChangeEvent = "basis:themechange";

/** Whether the page has the cookie, of this app's or the shared domain's. */
function hasCookie(): boolean {
  return document.cookie.includes(`${preferencesCookie}=`);
}

/** Moves the choice onto the shared domain, when the page is on it: the cookie this app kept for itself is removed,
 * and its value, when it was the only one, stored on the shared domain in its place. */
function shareCookie(options: CookieOptions): void {
  const domain = cookieDomain(options.domain, location.hostname);
  if (domain === undefined) {
    return;
  }
  const had = parsePreferences(document.cookie);
  const hadAny = hasCookie();
  // oxlint-disable-next-line unicorn/no-document-cookie -- the cookie is what carries the choice between apps.
  document.cookie = hostOnlyRemoval;
  if (hadAny && !hasCookie()) {
    // oxlint-disable-next-line unicorn/no-document-cookie -- as above.
    document.cookie = serializePreferences(had, { domain });
  }
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
  readonly density: Density;
  readonly motion: "reduced" | undefined;
  readonly theme: ThemeName;
}

/** Whether the root element shows something other than `shown`. */
function differs(root: PreferencesRoot, shown: Shown): boolean {
  return (
    root.style.colorScheme !== shown.mode ||
    root.dataset["density"] !== shown.density ||
    root.dataset["motion"] !== shown.motion ||
    root.dataset["theme"] !== shown.theme
  );
}

/** Puts `shown` on the root element. */
function show(root: PreferencesRoot, { mode, density, motion, theme }: Shown): void {
  root.classList.toggle("dark", mode === "dark");
  root.style.colorScheme = mode;
  root.dataset["density"] = density;
  root.dataset["theme"] = theme;
  if (motion === undefined) {
    delete root.dataset["motion"];
  } else {
    root.dataset["motion"] = motion;
  }
}

/** Puts the preferences on the page's root element: the `dark` class, `color-scheme`, `data-density`, `data-motion`
 * and `data-theme`. `data-density` and `data-theme` always name the density and the theme, so that whatever reads them,
 * such as parallax's canvases, need not know the stylesheet's base; the default theme's rules sit at `:root` and hold
 * whatever `data-theme` says, and every other theme's under its `[data-theme="NAME"]`. A change to any of them holds every transition off until it is drawn, so the page changes in one
 * frame, as its canvases do, where some sixty controls' colours would otherwise cross-fade and a density change lay
 * the page out frame by frame, and then dispatches `themeChangeEvent` on the root element. */
function applyPreferences(
  root: PreferencesRoot,
  preferences: Preferences,
  systemDark: boolean,
): void {
  const shown: Shown = {
    density: preferences.density,
    mode: resolveMode(preferences.mode, systemDark),
    motion: preferences.motion === "reduced" ? "reduced" : undefined,
    theme: preferences.theme,
  };
  const view = root.ownerDocument?.defaultView ?? null;
  const changed = differs(root, shown);
  if (view !== null && changed) {
    holdTransitions(root, view);
  }
  show(root, shown);
  if (changed) {
    root.dispatchEvent?.(new Event(themeChangeEvent, { bubbles: true }));
  }
}

/** The preferences stored in this page's cookies. */
function readPreferences(): Preferences {
  return parsePreferences(document.cookie);
}

/** Stores the preferences, on the shared domain when `options` names one and the page is on it, and applies them to
 * this page at once. Other pages follow through `followPreferences`. */
function writePreferences(preferences: Preferences, options: CookieOptions = {}): void {
  const domain = cookieDomain(options.domain, location.hostname);
  if (domain !== undefined) {
    // oxlint-disable-next-line unicorn/no-document-cookie -- the cookie is what carries the choice between apps.
    document.cookie = hostOnlyRemoval;
  }
  // oxlint-disable-next-line unicorn/no-document-cookie -- as above.
  document.cookie = serializePreferences(preferences, { domain });
  applyPreferences(document.documentElement, preferences, matchMedia(darkQuery).matches);
}

/* No event tells a page that another app, on another origin, changed a cookie they share: `storage` and
 * `BroadcastChannel` reach only the same origin. The cookie store's change event does, in Chromium, for every cookie the
 * page would be sent, a sibling subdomain's on the parent domain included, and it reaches a window left open in view,
 * which gets no other event. But the cookie store exists only on a secure page, so a page served over plain HTTP, or in
 * a browser without one, reads the cookie again whenever the user comes back to it, on focus or on being shown. Returns
 * a function that stops following it. */
function followCookie(apply: () => void): () => void {
  const store = (globalThis as { cookieStore?: EventTarget }).cookieStore;
  const shownAgain = (): void => {
    if (document.visibilityState === "visible") {
      apply();
    }
  };
  store?.addEventListener("change", apply);
  globalThis.addEventListener("focus", apply);
  document.addEventListener("visibilitychange", shownAgain);
  return () => {
    store?.removeEventListener("change", apply);
    globalThis.removeEventListener("focus", apply);
    document.removeEventListener("visibilitychange", shownAgain);
  };
}

/** Applies the stored preferences now, and again whenever the cookie or the operating system's mode changes, the
 * cookie changed by this app or by another on the shared domain. Given `options.domain`, it first moves a choice this
 * app kept for itself onto the shared domain. Given `shown`, it applies those in place of the stored ones and follows
 * only the operating system's mode, which a `system` mode reads: for a page told its preferences another way, as the
 * gallery is by its query. Returns a function that stops following them. */
function followPreferences(shown?: Preferences, options: CookieOptions = {}): () => void {
  shareCookie(options);
  const media = matchMedia(darkQuery);
  const apply = (): void => {
    applyPreferences(document.documentElement, shown ?? readPreferences(), media.matches);
  };
  apply();
  media.addEventListener("change", apply);
  const stopCookie = shown === undefined ? followCookie(apply) : undefined;
  return () => {
    media.removeEventListener("change", apply);
    stopCookie?.();
  };
}

/** A script for the page's `<head>` that applies the stored preferences before the first paint, so the page never
 * flashes the wrong mode. It repeats `parsePreferences` and `applyPreferences` in plain JavaScript; a test holds the
 * two to the same answers. */
const headScript = `(() => {
  try {
    const themes = ${JSON.stringify(themeNames)};
    const values = document.cookie.split(";").flatMap((part) => {
      const separator = part.indexOf("=");
      return separator !== -1 && part.slice(0, separator).trim() === "${preferencesCookie}"
        ? [part.slice(separator + 1).trim().split(".")]
        : [];
    });
    const [stored, density, motion, theme] =
      values.find((parts) => parts[4] === "${hostOnlyMark}") ?? values[0] ?? [];
    const mode = stored === "light" || stored === "dark" ? stored : matchMedia("${darkQuery}").matches ? "dark" : "light";
    const root = document.documentElement;
    root.classList.toggle("dark", mode === "dark");
    root.style.colorScheme = mode;
    root.dataset.density = density === "comfortable" ? "comfortable" : "compact";
    if (motion === "reduced") {
      root.dataset.motion = "reduced";
    }
    root.dataset.theme = themes.includes(theme) ? theme : themes[0];
  } catch {
    // Without cookies or matchMedia the page keeps the stylesheet's light, compact base, the default theme's.
  }
})();`;

export {
  applyPreferences,
  followPreferences,
  headScript,
  readPreferences,
  resolveMode,
  themeChangeEvent,
  writePreferences,
};
export type { PreferencesRoot, ResolvedMode };
export {
  cookieDomain,
  defaultPreferences,
  parsePreferences,
  preferencesCookie,
  serializePreferences,
} from "./preferences-cookie.ts";
export type {
  CookieOptions,
  Density,
  ModePreference,
  Motion,
  Preferences,
  ThemeName,
} from "./preferences-cookie.ts";
