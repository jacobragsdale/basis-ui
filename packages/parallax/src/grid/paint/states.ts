/* What the grid's body shows when it has no rows to draw: a skeleton of rows while the first frame loads, drawn once
 * and still, since a moving shimmer would repaint a remote desktop each frame; and, once a view holds no rows, a line
 * that says so, and whether the filters or the search left none. */

import { fillRect } from "./canvas.ts";
import type { Pass } from "./scene.ts";

/** A skeleton bar's share of its column's width, and its height and corner radius, in CSS pixels. */
const barShare = 0.6;
const barHeight = 8;
const fallbackWidth = 160;

/** The columns a skeleton draws in: the view's, or a few of a default width before the view has its columns. */
function skeletonColumns(pass: Pass): readonly (readonly [x: number, width: number])[] {
  const { geometry, width } = pass;
  if (geometry.count === 0) {
    return Array.from(
      { length: Math.ceil(width / fallbackWidth) },
      (_entry, index) => [index * fallbackWidth, fallbackWidth] as const,
    );
  }
  return Array.from(
    { length: geometry.count },
    (_entry, column) => [geometry.x(column) - pass.scrollLeft, geometry.width(column)] as const,
  );
}

/** Draws a skeleton of rows under the header while the first rows load: a bar in each column of each row in view. */
function drawSkeleton(pass: Pass, height: number): void {
  const { metrics, theme } = pass;
  const rows = Math.ceil((height - metrics.headerPx) / metrics.rowPx);
  const columns = skeletonColumns(pass);
  for (let row = 0; row < rows; row += 1) {
    const y = metrics.headerPx + row * metrics.rowPx + (metrics.rowPx - barHeight) / 2;
    for (const [x, width] of columns) {
      fillRect(pass, theme.chromeBackground, [
        x + metrics.padding,
        y,
        Math.max(0, (width - 2 * metrics.padding) * barShare),
        barHeight,
      ]);
    }
  }
}

/** Says, in the middle of the body, that the view holds no rows: none match the filters or the search, or none at all. */
function drawEmpty(pass: Pass, height: number): void {
  const { context, metrics, theme, scene } = pass;
  const narrowed = (scene.layout?.filters.length ?? 0) > 0 || pass.search !== "";
  const text = narrowed ? "No rows match the filters or the search" : "No rows";
  Object.assign(context, { fillStyle: theme.muted, textAlign: "center" });
  context.fillText(
    text,
    pass.width / 2,
    metrics.headerPx + Math.min(2 * metrics.rowPx, (height - metrics.headerPx) / 2),
  );
  Object.assign(context, { textAlign: "start" });
}

/** Draws the body's state when it has no rows: a skeleton while loading, a line once the view is empty. */
function drawState(pass: Pass, height: number): void {
  const { frame } = pass.scene;
  if (frame === null) {
    drawSkeleton(pass, height);
  } else if (frame.totalRows === 0) {
    drawEmpty(pass, height);
  }
}

export { drawState };
