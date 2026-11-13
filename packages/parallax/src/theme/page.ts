/* The page's mode and density, as `@basis/ui`'s preferences put them on the root element, and the page changes that
 * may change any canvas's tokens. A canvas reads its tokens from computed styles, which CSS cannot announce changing,
 * so the watcher counts the changes that usually mean new tokens: an attribute of `<html>` or `<body>` changing, as the
 * `dark` class and `data-density` do; `data-theme`, `data-density` or a `dark` class set on any element, such as a
 * wrapper that shows another theme; a stylesheet added to or taken from the head; `@basis/ui`'s `themeChangeEvent`,
 * which `applyPreferences` dispatches and which code that changes the tokens some other way, such as a variable set on
 * a wrapper, dispatches on the document; the system's colour scheme changing; and a web font arriving after the first
 * paint. Its snapshot suits React's `useSyncExternalStore`. */

import { themeChangeEvent } from "@basis/ui";
import type { Density, ResolvedMode } from "@basis/ui";

/** The page's mode and density, and a count of the changes that may have changed any token. */
interface PageState {
  /** The mode `@basis/ui` shows: dark when the root element has the `dark` class. */
  readonly mode: ResolvedMode;
  readonly density: Density;
  /** Whether the system asks for dark colours, which a scheme of `auto` follows. */
  readonly systemDark: boolean;
  readonly changes: number;
}

const darkQuery = "(prefers-color-scheme: dark)";

function systemDark(document: Document): boolean {
  return document.defaultView?.matchMedia(darkQuery).matches ?? false;
}

function readPage(document: Document, changes: number): PageState {
  const root = document.documentElement;
  return {
    changes,
    // Compact is @basis/ui's default, and its stylesheet's base: a page no script has touched shows it.
    density: root.dataset["density"] === "comfortable" ? "comfortable" : "compact",
    mode: root.classList.contains("dark") ? "dark" : "light",
    systemDark: systemDark(document),
  };
}

/** Whether a change of an attribute below the root may change a canvas's tokens: any change of a theme or a density,
 * and a class that gains or loses `dark`. */
function themed(record: MutationRecord): boolean {
  if (record.attributeName !== "class") {
    return true;
  }
  const was = (record.oldValue ?? "").split(/\s+/u).includes("dark");
  const { target } = record;
  return target instanceof Element && was !== target.classList.contains("dark");
}

/** Calls `changed` when a theme, a density or a mode is shown on an element below the body. An app changes classes
 * all the time, so a class counts only when it gains or loses `dark`. */
function observeBelow(document: Document, changed: () => void): MutationObserver {
  const below = new MutationObserver((records) => {
    if (records.some((record) => themed(record))) {
      changed();
    }
  });
  below.observe(document.body, {
    attributeFilter: ["class", "data-density", "data-theme"],
    attributeOldValue: true,
    subtree: true,
  });
  return below;
}

/** Calls `changed` when a web font arrives, until the returned function is called. A Node DOM, as a test's, has no
 * fonts to load. */
function watchFonts(document: Document, changed: () => void): () => void {
  if (!("fonts" in document)) {
    return (): void => undefined;
  }
  const { fonts } = document;
  fonts.addEventListener("loadingdone", changed);
  return () => {
    fonts.removeEventListener("loadingdone", changed);
  };
}

/** Calls `changed` on every change that may change the page's tokens, until the returned function is called. */
function observe(document: Document, changed: () => void): () => void {
  const observer = new MutationObserver(changed);
  observer.observe(document.documentElement, { attributes: true });
  observer.observe(document.body, { attributes: true });
  // A stylesheet swapped in or out.
  observer.observe(document.head, { childList: true });
  const below = observeBelow(document, changed);
  const media = document.defaultView?.matchMedia(darkQuery);
  media?.addEventListener("change", changed);
  const unwatchFonts = watchFonts(document, changed);
  document.addEventListener(themeChangeEvent, changed);
  return () => {
    observer.disconnect();
    below.disconnect();
    media?.removeEventListener("change", changed);
    unwatchFonts();
    document.removeEventListener(themeChangeEvent, changed);
  };
}

/** One document's page state, observed while anything subscribes. */
class PageWatcher {
  readonly #document: Document;
  readonly #listeners = new Set<() => void>();
  #state: PageState;
  #stop: (() => void) | null = null;

  public constructor(document: Document) {
    this.#document = document;
    this.#state = readPage(document, 0);
  }

  /** Calls `listener` on each change, observing the page while anything listens. Returns a function that stops. */
  public readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    this.#stop ??= observe(this.#document, () => {
      this.#changed();
    });
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) {
        this.#stop?.();
        this.#stop = null;
      }
    };
  };

  /** The page's state now, the same object until it changes. While nothing listens the page is not observed, so it
   * is read again. */
  public readonly getSnapshot = (): PageState => {
    if (this.#stop === null) {
      this.#refresh();
    }
    return this.#state;
  };

  #changed(): void {
    this.#state = readPage(this.#document, this.#state.changes + 1);
    for (const listener of this.#listeners) {
      listener();
    }
  }

  /** Reads the page again, counting a change only if it made one. */
  #refresh(): void {
    const now = readPage(this.#document, this.#state.changes);
    const was = this.#state;
    if (now.mode !== was.mode || now.density !== was.density || now.systemDark !== was.systemDark) {
      this.#state = { ...now, changes: was.changes + 1 };
    }
  }
}

const watchers = new WeakMap<Document, PageWatcher>();

/** The watcher of a document's page state, one a document. */
function pageWatcher(document: Document): PageWatcher {
  const known = watchers.get(document);
  if (known !== undefined) {
    return known;
  }
  const watcher = new PageWatcher(document);
  watchers.set(document, watcher);
  return watcher;
}

export { pageWatcher };
export type { PageState, PageWatcher };
