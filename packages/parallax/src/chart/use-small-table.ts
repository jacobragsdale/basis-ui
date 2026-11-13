/* The small-data form's table and group order, kept by each chart for as long as its rows' plotted columns hold the
 * same values, so that a page that builds its rows afresh each render loads them once and repaints nothing. */

import { useMemo } from "react";

import type { LayoutChart } from "#layout/chart.ts";

import type { CategoryData } from "./model-types.ts";
import { reorderedKinds, rowOrder } from "./small-data.ts";
import { smallTable } from "./small-table.ts";
import type { ChartValue, SmallTable } from "./small-table.ts";

/** The table `content`, as `tableContent` writes the rows, makes: made again only when the content changes. */
function useSmallTable(content: string): SmallTable {
  return useMemo(() => smallTable(content), [content]);
}

/** The order a chart of `kind` puts its groups in, the rows' order of `xValues`, or null for a kind that keeps the
 * engine's: the same function while the values are the same. */
function useRowOrder(
  kind: LayoutChart["kind"],
  xValues: readonly ChartValue[],
): ((data: CategoryData) => CategoryData) | null {
  return useMemo(() => (reorderedKinds.has(kind) ? rowOrder(xValues) : null), [kind, xValues]);
}

export { useRowOrder, useSmallTable };
