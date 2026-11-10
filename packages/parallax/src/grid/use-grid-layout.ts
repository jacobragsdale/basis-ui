/* A grid's layout, held by the app or by the grid: with `onLayoutChange`, every change goes to the app, which passes
 * the new layout back; without it, the grid keeps the user's changes itself until the app gives it another layout. A
 * layout is compared by value, as a chart's is, so a page that renders again with an equal layout keeps them. */

import { useState } from "react";

import type { Layout, LayoutInput } from "#layout/layout.ts";

/** A layout the grid changed, and the layout from the app it changed, as JSON. */
interface Edited {
  readonly from: string;
  readonly layout: Layout;
}

/** The layout a grid shows, and what it calls to change it. */
function useGridLayout(
  layout: LayoutInput,
  onLayoutChange: ((layout: Layout) => void) | undefined,
): readonly [LayoutInput, (next: Layout) => void] {
  const [edited, setEdited] = useState<Edited | null>(null);
  const given = JSON.stringify(layout);
  const shown = onLayoutChange === undefined && edited?.from === given ? edited.layout : layout;
  const change = (next: Layout): void => {
    if (onLayoutChange === undefined) {
      setEdited({ from: given, layout: next });
    } else {
      onLayoutChange(next);
    }
  };
  return [shown, change];
}

export { useGridLayout };
