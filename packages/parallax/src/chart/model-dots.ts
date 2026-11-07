/* The draw model's type for a scatter's dots, beside the other marks' in `model-types.ts`. */

import type { PointSeries } from "#frame/chart-data.ts";

/** The columns a scatter's tooltip names, in its rows' order. */
interface DotColumns {
  readonly x: string;
  readonly y: string;
  readonly size: string | null;
  readonly fit: string | null;
  readonly tooltip: readonly string[];
}

/** A scatter's dots of one series: their centres and radii in pixels, and the series' data, which their tooltips
 * read. Clicking a dot selects it by its id. */
interface DotsMark {
  readonly kind: "dots";
  readonly color: string;
  readonly points: PointSeries;
  readonly columns: DotColumns;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly radius: Float64Array;
  /** The dot whose id is selected, by index, or -1: it is drawn ringed, and every other dot faint. */
  readonly selected: number;
  /** Drawn faint, because a dot of another series is selected. */
  readonly dim: boolean;
}

export type { DotColumns, DotsMark };
