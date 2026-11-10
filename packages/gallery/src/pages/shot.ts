/* A page shows one section alone when its query names one, as in `?page=overlays-and-menus&section=dialog`: that is
 * the page a screenshot of the section is taken of, so a diff names the component and no other section's height moves
 * it. Shown alone, a section pictures its open state too: its menus, dialogs, popovers, tooltips and toasts open. */

import { createContext, useContext } from "react";

/** The section the page shows alone, by its `data-shot` id, or `null` when it shows every section. */
const ShownSection = createContext<string | null>(null);

/** The id a section's title gives it: its `data-shot` hook, its heading's id and its anchor. */
function sectionId(title: string): string {
  return title.toLowerCase().replaceAll(" ", "-");
}

/** Whether the page shows one section alone, so its overlays should start open. */
function usePictured(): boolean {
  return useContext(ShownSection) !== null;
}

/* States a pointer or the keyboard would bring, pictured on an example without either: the screenshots force each
 * pseudo-class a `data-pictured` value names through Chromium's DevTools protocol, so one screenshot shows them all.
 * Spread one onto a component, as in `<Button {...hovered}>`. On the page itself they show at rest. */
const hovered = { "data-pictured": "hover" } as const;
/** Focused as the keyboard focuses, which draws the focus ring. */
const focused = { "data-pictured": "focus focus-visible" } as const;
/** Held down under the pointer. */
const pressed = { "data-pictured": "hover active" } as const;
/** An example whose open state no prop sets, such as a date picker's, or that opens where it is asked, as a context
 * menu does: the screenshots open it by keyboard, pressing `key` on the first button inside, Enter unless set. Put it
 * on an element around the component. */
function openedByKeyboard(key = "Enter"): Readonly<Record<string, string>> {
  return { "data-pictured": "open", "data-pictured-key": key };
}

export { ShownSection, focused, hovered, openedByKeyboard, pressed, sectionId, usePictured };
