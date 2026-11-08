/* Saved views: a page's search parameters stored under a name, in this browser, for each page's path. The browser's
 * storage may be missing or full, so every read and write survives its failure and says nothing. */

import type { SearchState } from "./search-state.ts";

interface SavedView {
  readonly name: string;
  readonly search: SearchState;
}

const prefix = "basis-ui-saved-views:";

function isSavedView(value: unknown): value is SavedView {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "search" in value &&
    typeof value.search === "object" &&
    value.search !== null
  );
}

/** The views saved for the page at `path`, in the order they were saved. */
function readViews(path: string): readonly SavedView[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(prefix + path) ?? "[]");
    return Array.isArray(stored) ? stored.filter((view) => isSavedView(view)) : [];
  } catch {
    return [];
  }
}

/** Stores the views for the page at `path`. */
function writeViews(path: string, views: readonly SavedView[]): void {
  try {
    localStorage.setItem(prefix + path, JSON.stringify(views));
  } catch {
    // Storage that is missing or full keeps nothing; the views last until the page is left.
  }
}

export { readViews, writeViews };
export type { SavedView };
