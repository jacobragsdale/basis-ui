/* The data columns a pass draws: the scrolling ones, clipped to the area they scroll in, then the pinned ones over
 * them, clipped beside the group column. */

import { scrolledColumns } from "#grid/geometry.ts";

import type { Pass } from "./scene.ts";

/** A band of the canvas, such as the header or a row: its top and height. */
interface Band {
  readonly top: number;
  readonly height: number;
}

/** Runs `paint` for each of `columns`, clipped to the band between `left` and `right`. */
function clipped(
  pass: Pass,
  band: Band & { readonly left: number; readonly right: number },
  {
    columns,
    paint,
  }: { readonly columns: readonly number[]; readonly paint: (column: number) => void },
): void {
  const { context } = pass;
  context.save();
  context.beginPath();
  context.rect(band.left, band.top, Math.max(0, band.right - band.left), band.height);
  context.clip();
  for (const column of columns) {
    paint(column);
  }
  context.restore();
}

/**
 * Runs `paint` for each data column in view: first the scrolling ones, clipped to the area they scroll in, then the
 * pinned ones over them, clipped beside the group column, with a line on their edge once anything is scrolled.
 */
function columnsInView(pass: Pass, band: Band, paint: (column: number) => void): void {
  const { geometry, context, theme } = pass;
  const scrolled = scrolledColumns(geometry, pass.scrollLeft, pass.width);
  clipped(
    pass,
    { ...band, left: geometry.frozenPx, right: pass.width },
    { columns: scrolled, paint },
  );
  if (geometry.pinned === 0) {
    return;
  }
  const pinned = Array.from({ length: geometry.pinned }, (_entry, index) => index);
  clipped(
    pass,
    { ...band, left: geometry.selectPx + geometry.treePx, right: geometry.frozenPx },
    { columns: pinned, paint },
  );
  if (pass.scrollLeft > 0) {
    // A line at the edge; the shadow beside it is an element over the canvas, so redrawn cells never darken it.
    context.fillStyle = theme.borderColor;
    context.fillRect(geometry.frozenPx - 1, band.top, 1, band.height);
  }
}

export { columnsInView };
export type { Band };
