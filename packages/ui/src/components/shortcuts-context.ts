/* The shortcut registry the shell keeps: every keyboard shortcut a page or a part of the shell declares, which one
 * listener answers and the `?` overlay lists. A component file exports only components, so the contexts live here.
 *
 * Each shortcut belongs to a scope: the innermost `ShortcutScope` around the component that declares it, such as the
 * one AppShell holds round the page shown, or the whole app outside any. A key runs the shortcut of the innermost scope that takes it,
 * so a page may take a key the app uses elsewhere. Two shortcuts that take the same keys at the same depth are a
 * conflict: the first declared runs, and the second is logged as an `ERROR` line with its fix. */

import { createContext, use, useEffect, useRef } from "react";

import { inDevelopment } from "./development.ts";
import { comboText, isPlain, matchesCombo, parseKeys } from "./shortcut-keys.ts";

/** A shortcut as a component declares it. `keys` is a combination such as `mod+k` (Ctrl on Windows, Cmd on a Mac),
 * `shift+?` or `/`, by the grammar shortcut-keys.ts states; `description` is what the `?` overlay says it does. */
interface Shortcut {
  readonly keys: string;
  readonly description: string;
  readonly run: () => void;
}

/** A part of the app whose shortcuts take precedence over those outside it: its name, which the `?` overlay heads
 * them with, and how many scopes deep it sits, 1 for one inside none. */
interface ShortcutScopeValue {
  readonly name: string;
  readonly depth: number;
}

/** A shortcut as the registry holds it: with its scope, or `null` for the whole app's. */
interface ScopedShortcut extends Shortcut {
  readonly scope: ShortcutScopeValue | null;
}

interface ShortcutRegistry {
  /** Adds a shortcut, and returns the function that removes it. */
  readonly register: (shortcut: ScopedShortcut) => () => void;
  /** The shortcuts registered now, in the order they were. */
  readonly list: () => readonly ScopedShortcut[];
}

const ShortcutContext = createContext<ShortcutRegistry | null>(null);

/** The scope a shortcut declared here belongs to; `null` outside every `ShortcutScope`. */
const ShortcutScopeContext = createContext<ShortcutScopeValue | null>(null);

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

/** An open dialog, which stands in front of the page before its focus arrives too: Base UI moves the focus into a
 * popup a frame after it opens, and a key pressed in that frame, such as a fast typist's first letter after `mod+k`
 * opens the command palette, lands on the page's body. A toast is a dialog that is not modal, and stands in front of
 * nothing. */
const openDialog = ["alertdialog", "dialog"]
  .map((role) => `[role="${role}"][data-open]:not([aria-modal="false"])`)
  .join(",");

/** Whether a plain key, one without a modifier, belongs to what has focus rather than to the page's shortcuts: it was
 * typed into a field, or pressed on or inside a control or dialog that takes keys itself, or while a dialog is open. */
function typedIntoField(event: KeyboardEvent): boolean {
  const { target } = event;
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) ||
      target.closest(keyTakingRoles) !== null ||
      target.ownerDocument.querySelector(openDialog) !== null)
  );
}

/** Whether a modal dialog is open, which stands in front of the page's shortcuts, with or without a modifier: the
 * page's `mod+s` must not save behind a dialog the user is working in. */
function behindModal(event: KeyboardEvent): boolean {
  const { target } = event;
  const owner = target instanceof Node ? (target.ownerDocument ?? document) : document;
  return owner.querySelector(openDialog) !== null;
}

/** Whether the page runs on a Mac, where `mod` is Cmd rather than Ctrl. */
function onMac(): boolean {
  return /Mac|iPhone|iPad/u.test(navigator.userAgent);
}

/** Whether `event` is the combination `keys` names; never, for keys the grammar refuses. */
function matchesKeys(keys: string, event: KeyboardEvent): boolean {
  const reading = parseKeys(keys);
  return reading.ok && matchesCombo(reading.combo, event, onMac());
}

/** A combination written one way, so that `Mod+K`, `ctrl+k` and `mod+k`, or `shift+?` and `?`, are the same keys. */
function normalKeys(keys: string): string {
  const reading = parseKeys(keys);
  return reading.ok ? comboText(reading.combo) : keys.toLowerCase();
}

/** Whether a combination is a plain key, which waits while the user types into a field. */
function plainKeys(keys: string): boolean {
  const reading = parseKeys(keys);
  return !reading.ok || isPlain(reading.combo);
}

/** How deep a shortcut's scope sits: 0 for the whole app's. */
function depthOf(shortcut: ScopedShortcut): number {
  return shortcut.scope?.depth ?? 0;
}

/** The shortcut a key press runs, of those whose keys it matches: the innermost scope's, and of two as deep, the
 * first declared. */
function winner(matching: readonly ScopedShortcut[]): ScopedShortcut | undefined {
  const deepest = Math.max(...matching.map((shortcut) => depthOf(shortcut)));
  return matching.find((shortcut) => depthOf(shortcut) === deepest);
}

/** The shortcut already declared that `shortcut` conflicts with: one that takes the same keys at the same depth. */
function conflictOf(
  held: readonly ScopedShortcut[],
  shortcut: ScopedShortcut,
): ScopedShortcut | undefined {
  const keys = normalKeys(shortcut.keys);
  return held.find(
    (other) => normalKeys(other.keys) === keys && depthOf(other) === depthOf(shortcut),
  );
}

/** The line a conflict logs: the keys, where, the two shortcuts, which one runs, and the fix. */
function conflictLine(first: ScopedShortcut, second: ScopedShortcut): string {
  const where = second.scope === null ? "everywhere" : `on ${second.scope.name}`;
  return `ERROR two shortcuts take ${second.keys} ${where}: "${first.description}" runs and "${second.description}" never does. Give one of them other keys.`;
}

/** How the `?` overlay writes a key: a character in capitals, and a name as a word, such as `Enter`. */
function keyLabel(key: string): string {
  const names: Readonly<Record<string, string>> = {
    " ": "Space",
    arrowdown: "↓",
    arrowleft: "←",
    arrowright: "→",
    arrowup: "↑",
    escape: "Esc",
    pagedown: "PgDn",
    pageup: "PgUp",
  };
  return (
    names[key] ??
    (key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1))
  );
}

/** How the `?` overlay writes a combination: `Ctrl K`, or `⌘ K` on a Mac. */
function keyLabels(keys: string): readonly string[] {
  const reading = parseKeys(keys);
  if (!reading.ok) {
    return [keys];
  }
  const { mod, alt, shift, key } = reading.combo;
  return [
    ...(mod ? [onMac() ? "⌘" : "Ctrl"] : []),
    ...(alt ? ["Alt"] : []),
    ...(shift ? ["Shift"] : []),
    keyLabel(key),
  ];
}

/** Refuses keys the grammar does not take: thrown in development, so the developer sees it at once, and logged as
 * an `ERROR` line in production, where the shortcut is left out rather than bound to the bare key. Returns whether
 * the keys are taken. */
function checkKeys(keys: string): boolean {
  const reading = parseKeys(keys);
  if (reading.ok) {
    return true;
  }
  const line = `ERROR the shortcut ${reading.reason}`;
  if (inDevelopment()) {
    throw new Error(line);
  }
  // oxlint-disable-next-line eslint/no-console -- in production the mistake is logged, as a conflict is, never thrown.
  console.error(line);
  return false;
}

/** Declares a keyboard shortcut while the component is shown: `useShortcut("mod+k", "Open the command palette",
 * open)`. Inside a `ShortcutProvider`, which `AppShell` holds; it does nothing outside one. Inside a `ShortcutScope`,
 * such as the one AppShell holds round the page shown, it belongs to that scope, and wins over a shortcut outside it
 * that takes the same keys, so a page's shortcuts are its own. */
function useShortcut(keys: string, description: string, run: () => void): void {
  const registry = use(ShortcutContext);
  const scope = use(ShortcutScopeContext);
  const taken = checkKeys(keys);
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  useEffect(
    () =>
      taken
        ? registry?.register({
            description,
            keys,
            run: () => {
              latest.current();
            },
            scope,
          })
        : undefined,
    [registry, keys, description, scope, taken],
  );
}

export {
  ShortcutContext,
  ShortcutScopeContext,
  behindModal,
  conflictLine,
  conflictOf,
  keyLabels,
  matchesKeys,
  normalKeys,
  plainKeys,
  typedIntoField,
  useShortcut,
  winner,
};
export type { ScopedShortcut, Shortcut, ShortcutRegistry, ShortcutScopeValue };
