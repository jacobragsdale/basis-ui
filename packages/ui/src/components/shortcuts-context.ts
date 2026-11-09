/* The shortcut registry the shell keeps: every keyboard shortcut a page or a part of the shell declares, which one
 * listener answers and the `?` overlay lists. A component file exports only components, so the context lives here. */

import { createContext, use, useEffect, useRef } from "react";

/** A shortcut as a component declares it. `keys` is a combination such as `mod+k` (Ctrl on Windows, Cmd on a Mac),
 * `shift+?` or `/`; `description` is what the `?` overlay says it does. */
interface Shortcut {
  readonly keys: string;
  readonly description: string;
  readonly run: () => void;
}

interface ShortcutRegistry {
  /** Adds a shortcut, and returns the function that removes it. */
  readonly register: (shortcut: Shortcut) => () => void;
  /** The shortcuts registered now, in the order they were. */
  readonly list: () => readonly Shortcut[];
}

const ShortcutContext = createContext<ShortcutRegistry | null>(null);

/** The roles whose element takes a plain key itself: a field typed into, a Select's trigger or a list that finds an
 * option by its first letter, and a dialog, which holds the page's focus while it is open, so a modal one stands in
 * front of the page's shortcuts. */
const keyTakingRoles = [
  "alertdialog",
  "combobox",
  "dialog",
  "listbox",
  "menu",
  "menubar",
  "option",
  "searchbox",
  "spinbutton",
  "textbox",
]
  .map((role) => `[role="${role}"]`)
  .join(",");

/** Whether a plain key, one without a modifier, belongs to what has focus rather than to the page's shortcuts: it was
 * typed into a field, or pressed on or inside a control or dialog that takes keys itself. */
function typedIntoField(event: KeyboardEvent): boolean {
  const { target } = event;
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) ||
      target.closest(keyTakingRoles) !== null)
  );
}

/** Whether the page runs on a Mac, where `mod` is Cmd rather than Ctrl. */
function onMac(): boolean {
  return /Mac|iPhone|iPad/u.test(navigator.userAgent);
}

/** Whether `event` is the combination `keys` names. */
function matchesKeys(keys: string, event: KeyboardEvent): boolean {
  const parts = keys.toLowerCase().split("+");
  const key = parts.at(-1) ?? "";
  const wants = new Set(parts.slice(0, -1));
  const mod = onMac() ? event.metaKey : event.ctrlKey;
  return (
    event.key.toLowerCase() === key &&
    mod === wants.has("mod") &&
    event.altKey === wants.has("alt") &&
    (key === "?" || event.shiftKey === wants.has("shift"))
  );
}

/** How the `?` overlay writes a combination: `Ctrl K`, or `⌘ K` on a Mac. */
function keyLabels(keys: string): readonly string[] {
  const names: Readonly<Record<string, string>> = {
    alt: "Alt",
    mod: onMac() ? "⌘" : "Ctrl",
    shift: "Shift",
  };
  return keys.split("+").map((part) => names[part.toLowerCase()] ?? part.toUpperCase());
}

/** Declares a keyboard shortcut while the component is shown: `useShortcut("mod+k", "Open the command palette",
 * open)`. Inside a `ShortcutProvider`, which `AppShell` holds; it does nothing outside one. */
function useShortcut(keys: string, description: string, run: () => void): void {
  const registry = use(ShortcutContext);
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  useEffect(
    () =>
      registry?.register({
        description,
        keys,
        run: () => {
          latest.current();
        },
      }),
    [registry, keys, description],
  );
}

export { ShortcutContext, keyLabels, matchesKeys, typedIntoField, useShortcut };
export type { Shortcut, ShortcutRegistry };
