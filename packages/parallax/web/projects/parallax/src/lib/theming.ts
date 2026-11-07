/**
 * How a component learns its theme and scheme, and when its tokens may have changed. The canvas reads tokens from
 * computed styles, which CSS cannot announce changing, so a shared watcher counts the page changes that usually mean
 * a new theme: an attribute of `<html>` or `<body>` changing, such as a dark class, the system's colour scheme
 * changing, and a web font arriving after the first paint. Anything else calls the component's `refreshTheme()`.
 */

import { DOCUMENT, DestroyRef, Injectable, computed, effect, inject, signal } from "@angular/core";
import type { Signal } from "@angular/core";

import { injectParallaxConfig } from "./client";
import { installTheme, installThemeStyles, standardTheme } from "./theme";
import type { ParallaxTheme, ResolvedScheme, Scheme } from "./theme";

/** Counts the page changes that may change any component's tokens. */
@Injectable({ providedIn: "root" })
export class ThemeWatcher {
  private readonly count = signal(0);
  private readonly dark = signal(false);
  /** Rises with each change to `<html>` or `<body>`'s attributes, the system's colour scheme, or the loaded fonts. */
  public readonly changes: Signal<number> = this.count.asReadonly();
  /** Whether the system asks for dark colours, which `scheme="auto"` follows. */
  public readonly prefersDark: Signal<boolean> = this.dark.asReadonly();

  constructor() {
    const document = inject(DOCUMENT);
    const destroyRef = inject(DestroyRef);
    const bump = (): void => {
      this.count.update((n) => n + 1);
    };
    const window = document.defaultView;
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, { attributes: true });
    observer.observe(document.body, { attributes: true });
    destroyRef.onDestroy(() => {
      observer.disconnect();
    });
    if (window !== null && typeof window.matchMedia === "function") {
      const query = window.matchMedia("(prefers-color-scheme: dark)");
      this.dark.set(query.matches);
      const changed = (): void => {
        this.dark.set(query.matches);
        bump();
      };
      query.addEventListener("change", changed);
      destroyRef.onDestroy(() => {
        query.removeEventListener("change", changed);
      });
    }
    // `document.fonts` is missing outside browsers, such as in jsdom, though its type says otherwise.
    if ("fonts" in document) {
      const fonts = document.fonts;
      fonts.addEventListener("loadingdone", bump);
      destroyRef.onDestroy(() => {
        fonts.removeEventListener("loadingdone", bump);
      });
    }
  }
}

/** A component's theme and scheme, resolved from its inputs and the application's defaults. */
export interface Themed {
  /** The theme in effect. */
  readonly theme: Signal<ParallaxTheme>;
  /** The scheme as given, `auto` included, for components inside this one. */
  readonly scheme: Signal<Scheme>;
  /** The scheme drawn. */
  readonly resolved: Signal<ResolvedScheme>;
  /** Rises whenever the tokens may have changed without an input changing. */
  readonly changes: Signal<number>;
  /** Asks the component to read its tokens again. */
  readonly refresh: () => void;
}

/**
 * Resolves a component's theme and scheme: its inputs, else those given to `provideParallax`, else the standard theme
 * in the light scheme. Installs the token stylesheet and the theme's. Call it in an injection context.
 */
export function themed(theme: Signal<ParallaxTheme | undefined>, scheme: Signal<Scheme | undefined>): Themed {
  const document = inject(DOCUMENT);
  const config = injectParallaxConfig();
  const watcher = inject(ThemeWatcher);
  const refreshes = signal(0);
  installThemeStyles(document);
  const current = computed(() => theme() ?? config?.theme ?? standardTheme);
  const given = computed(() => scheme() ?? config?.scheme ?? "light");
  const resolved = computed((): ResolvedScheme => {
    const value = given();
    return value === "auto" ? (watcher.prefersDark() ? "dark" : "light") : value;
  });
  effect(() => {
    installTheme(document, current());
  });
  return {
    theme: current,
    scheme: given,
    resolved,
    changes: computed(() => watcher.changes() + refreshes()),
    refresh: () => {
      refreshes.update((n) => n + 1);
    }
  };
}
