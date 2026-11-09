/* Maximizing a view: a grid, pivot or chart fills the window over the dimmed page, as a modal, and goes back to its
 * place on Escape, on its Restore button, on Alt+Enter again, or on a click on the page around it.
 *
 * The view's own element is what fills the window: it is fixed over the viewport rather than moved into a dialog, so
 * the view stays open and keeps its rows, scroll position, selection and the layout the user made, and only resizes,
 * which its canvas redraws for once. A placeholder of its size keeps its place, so the page behind neither reflows nor
 * scrolls. While it fills the window the rest of the page is inert, so the keyboard and screen readers stay inside
 * it, as in a dialog; the popups it opens, which Base UI adds at the end of the body, still work. An ancestor with a
 * transform, a filter or containment holds a fixed element to itself, so a view inside one fills that ancestor.
 *
 * Escape does one thing at a time: a view that has a selection, a search, a drawing or a brush to drop drops it and
 * says so by preventing the key's default, and only an Escape nothing took restores the view. */

import { createContext, use, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

/** Whether a view fills the window, and how to change it. */
interface Maximize {
  readonly maximized: boolean;
  readonly setMaximized: (maximized: boolean) => void;
}

/** The view that maximizes, for the parts inside it: a pivot's grid maximizes the pivot. */
const MaximizeContext = createContext<Maximize | null>(null);

/** The slot of a view's Maximize button, which focus goes back to when nothing inside the view holds it. */
const buttonSlot = "maximize-button";
/** The slot of the dimmed page behind a maximized view, which a click restores the view from. */
const backdropSlot = "maximize-backdrop";

/** The size a view had in the page, which its placeholder keeps while it fills the window. */
interface Size {
  readonly width: number;
  readonly height: number;
}

/** What a view that can fill the window gives its element and the parts inside it. */
interface Maximizing {
  /** The state its parts' Maximize buttons read and change: its own, or the view's that holds it. */
  readonly state: Maximize;
  /** The element's attributes and keyboard: `data-maximized` while it fills the window, a dialog's role then, and
   * Alt+Enter and Escape. Nothing for a view held by another, whose element is the other's. */
  readonly props: {
    readonly "data-maximized"?: "";
    readonly role?: "dialog";
    readonly "aria-modal"?: true;
    readonly "aria-label"?: string;
    readonly onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  };
  /** The size the view had in the page while its own element fills the window, which `MaximizeBefore` keeps; null
   * while it is in its place. */
  readonly size: Size | null;
}

/** Makes everything but `element` and its ancestors inert, and returns what undoes it: each sibling of the element
 * and of each ancestor up to the body, but the backdrop and what was inert already. */
function inertAround(element: HTMLElement): () => void {
  const made: HTMLElement[] = [];
  for (let node = element; node !== document.body && node.parentElement !== null;) {
    const parent: HTMLElement = node.parentElement;
    for (const sibling of parent.children) {
      const skip = sibling === node || !(sibling instanceof HTMLElement) || sibling.inert;
      if (!skip && sibling.dataset["slot"] !== backdropSlot) {
        sibling.inert = true;
        made.push(sibling);
      }
    }
    node = parent;
  }
  return () => {
    for (const sibling of made) {
      sibling.inert = false;
    }
  };
}

/** Makes the page around a maximized view inert and brings focus into it; returns what undoes it, which brings focus
 * back to the view's button when a click on the page around took it to the body. */
function trap(root: HTMLElement): () => void {
  const restore = inertAround(root);
  const button = (): HTMLElement | null => root.querySelector(`[data-slot="${buttonSlot}"]`);
  if (!root.contains(document.activeElement)) {
    button()?.focus();
  }
  return () => {
    restore();
    if (document.activeElement === null || document.activeElement === document.body) {
      button()?.focus();
    }
  };
}

/** Keeps the keyboard inside a maximized view. It runs when the view fills the window and when it goes back, and never
 * in between, so a popup the view opens keeps its focus. */
function useModal(element: () => HTMLElement | null, on: boolean): void {
  const latest = useRef(element);
  useEffect(() => {
    latest.current = element;
  });
  useEffect(() => {
    const root = latest.current();
    return on && root !== null ? trap(root) : undefined;
  }, [on]);
}

/** Whether a key event is the view's own: from its element, rather than a popup it opened, which React's events reach
 * through the portal. */
function fromInside(event: KeyboardEvent<HTMLElement>): boolean {
  return event.target instanceof Node && event.currentTarget.contains(event.target);
}

/** Alt+Enter maximizes and restores the view, and an Escape that nothing inside it took restores it. */
function keysFor(
  maximized: boolean,
  change: (next: boolean, at?: HTMLElement) => void,
): (event: KeyboardEvent<HTMLElement>) => void {
  return (event) => {
    if (event.defaultPrevented || !fromInside(event)) {
      return;
    }
    if (event.key === "Enter" && event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      change(!maximized, event.currentTarget);
    } else if (event.key === "Escape" && maximized) {
      event.preventDefault();
      change(false);
    }
  };
}

/**
 * Lets a view fill the window. `element` finds the view's element, which takes `props`, with `MaximizeBefore` rendered
 * just before it, and whose classes make it fixed over the viewport under `data-maximized`. A view inside another
 * that can, such as a pivot's grid, takes the outer one's state and leaves its own element where it is.
 */
function useMaximize(element: () => HTMLElement | null, label: string): Maximizing {
  const outer = use(MaximizeContext);
  const [size, setSize] = useState<Size | null>(null);
  const owned = outer === null;
  const maximized = size !== null;
  useModal(element, owned && maximized);
  if (!owned) {
    return { props: {}, size: null, state: outer };
  }
  // Measured as it leaves its place, so the placeholder keeps the size it had.
  const change = (next: boolean, at: HTMLElement | null = element()): void => {
    const box = next ? (at?.getBoundingClientRect() ?? null) : null;
    setSize(box === null ? null : { height: box.height, width: box.width });
  };
  const onKeyDown = keysFor(maximized, change);
  return {
    props: maximized
      ? { "aria-label": label, "aria-modal": true, "data-maximized": "", onKeyDown, role: "dialog" }
      : { onKeyDown },
    size,
    state: {
      maximized,
      setMaximized: (next) => {
        change(next);
      },
    },
  };
}

export { MaximizeContext, backdropSlot, buttonSlot, useMaximize };
export type { Maximize, Maximizing };
