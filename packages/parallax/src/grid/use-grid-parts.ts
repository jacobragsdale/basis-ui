/* The elements a grid's controller drives: refs for React to render them with, the controller attached to them once
 * they are in the page, until the grid unmounts, and the canvas's tokens read again whenever they may have changed. */

import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

import { useParallaxTheme } from "#react/use-theme.ts";

import type { GridController } from "./controller.ts";
import type { GridParts } from "./dom.ts";

/** Refs to the elements a grid's controller drives. */
type GridRefs = { readonly [TPart in keyof GridParts]: RefObject<GridParts[TPart] | null> };

/** The value of a ref React has set, or an error that names it. */
function present<TElement>(ref: RefObject<TElement | null>, name: string): TElement {
  const element = ref.current;
  if (element === null) {
    throw new Error(`The grid's ${name} did not render.`);
  }
  return element;
}

/** The elements, once React has rendered them. */
function partsOf(refs: GridRefs): GridParts {
  return {
    body: present(refs.body, "body"),
    canvas: present(refs.canvas, "canvas"),
    menuAnchor: present(refs.menuAnchor, "menu anchor"),
    pinnedEdge: present(refs.pinnedEdge, "pinned columns' edge"),
    scroll: present(refs.scroll, "scroll"),
    spacer: present(refs.spacer, "spacer"),
    tooltip: present(refs.tooltip, "tooltip"),
  };
}

/** Reads the canvas's tokens for the controller, and again whenever they may have changed. */
function useTokens(controller: GridController, canvas: RefObject<HTMLCanvasElement | null>): void {
  const { read } = useParallaxTheme();
  useEffect(() => {
    const { theme, colors } = read(present(canvas, "canvas"));
    controller.setTokens({ ...theme, colors });
  }, [canvas, controller, read]);
}

/** Refs for a grid's elements, with `controller` driving them while the grid is mounted, and reading the canvas's
 * tokens. `groupPanel` is the strip a dragged header can drop on. */
function useGridParts(
  controller: GridController,
  groupPanel: RefObject<HTMLElement | null>,
): GridRefs {
  const body = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const menuAnchor = useRef<HTMLSpanElement>(null);
  const pinnedEdge = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const spacer = useRef<HTMLDivElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  // Before the browser paints, so the canvas is sized in the grid's first frame. The refs never change, so the
  // controller attaches once.
  useLayoutEffect(
    () =>
      controller.attach(
        partsOf({ body, canvas, menuAnchor, pinnedEdge, scroll, spacer, tooltip }),
        () => groupPanel.current,
      ),
    [body, canvas, controller, groupPanel, menuAnchor, pinnedEdge, scroll, spacer, tooltip],
  );
  useTokens(controller, canvas);
  return { body, canvas, menuAnchor, pinnedEdge, scroll, spacer, tooltip };
}

export { useGridParts };
export type { GridRefs };
