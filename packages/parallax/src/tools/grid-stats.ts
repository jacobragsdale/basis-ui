/* The grids on the page, for the performance overlay: each grid registers its drawing counters while it is attached,
 * under its element's accessible name, its label or its dataset's, and the overlay reads them once a second. */

import type { DrawStats } from "#grid/paint/stats.ts";

/** One grid's drawing counters, and the name the overlay shows them under. */
interface GridStats {
  readonly name: string;
  readonly stats: DrawStats;
}

/** The grids on the page, each its name and a reader of its counters. */
const grids = new Map<Element, () => DrawStats>();

/** Registers the counters of the grid whose element is `element` until the returned function is called. */
function trackGrid(element: Element, read: () => DrawStats): () => void {
  grids.set(element, read);
  return () => {
    grids.delete(element);
  };
}

/** Each grid's counters now, in the order the grids arrived. */
function gridStats(): readonly GridStats[] {
  return [...grids].map(([element, read]) => ({
    name: element.getAttribute("aria-label") ?? "grid",
    stats: read(),
  }));
}

export { gridStats, trackGrid };
export type { GridStats };
