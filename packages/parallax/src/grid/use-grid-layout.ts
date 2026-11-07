/* A grid's layout, held by the app or by the grid: with `onLayoutChange`, every change goes to the app, which passes
 * the new layout back; without it, the grid keeps the user's changes itself until the app gives it another layout. */

import { useState } from "react";

import type { Layout, LayoutInput } from "#layout/layout.ts";

/** A layout the grid changed, and the layout from the app it changed. */
interface Edited {
  readonly from: LayoutInput;
  readonly layout: Layout;
}

/** The layout a grid shows, and what it calls to change it. */
function useGridLayout(
  layout: LayoutInput,
  onLayoutChange: ((layout: Layout) => void) | undefined,
): readonly [LayoutInput, (next: Layout) => void] {
  const [edited, setEdited] = useState<Edited | null>(null);
  const shown = onLayoutChange === undefined && edited?.from === layout ? edited.layout : layout;
  const change = (next: Layout): void => {
    if (onLayoutChange === undefined) {
      setEdited({ from: layout, layout: next });
    } else {
      onLayoutChange(next);
    }
  };
  return [shown, change];
}

export { useGridLayout };
