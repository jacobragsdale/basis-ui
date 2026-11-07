/* The grids on the page, for the performance overlay: each page's grids give their handle to `trackGrid` through
 * their `ref`, and the overlay reads every grid's drawing counters once a second. */

import type { DrawStats, GridHandle } from "@basis/parallax";

/** One grid's drawing counters, and the name the overlay shows them under. */
interface GridStats {
  readonly name: string;
  readonly stats: DrawStats;
}

/** The grids on the page, by name. */
const grids = new Map<string, GridHandle>();

/** A `ref` for the grid named `name`, which the overlay then reads until the grid goes. */
function trackGrid(name: string): (handle: GridHandle | null) => () => void {
  return (handle) => {
    if (handle !== null) {
      grids.set(name, handle);
    }
    return () => {
      grids.delete(name);
    };
  };
}

/** Each grid's counters now, in the order the grids arrived. */
function gridStats(): readonly GridStats[] {
  return [...grids].map(([name, grid]) => ({ name, stats: grid.drawStats() }));
}

export { gridStats, trackGrid };
export type { GridStats };
