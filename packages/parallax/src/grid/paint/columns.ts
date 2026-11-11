/* The data columns a pass draws: the scrolling ones, clipped to the area they scroll in, then the pinned ones over
 * them, clipped beside the group column. A pass that paints the strip a scroll exposed draws only the columns that meet
 * it, and the pass beside it leaves those wholly within it. Each area is clipped once for a band, such as the header,
 * the totals row or the body's rows, and its columns are drawn for every row in the band under that one clip. */

import { screenX, scrolledColumns } from "#grid/geometry.ts";

import { fillRect, withClip } from "./canvas.ts";
import { drawsSpan, spanOf } from "./damage.ts";
import type { Pass } from "./scene.ts";

/** A band of the canvas, such as the header or a row: its top and height. */
interface Band {
  readonly top: number;
  readonly height: number;
}

/** The columns of `columns` that the pass draws, as far as they show between the band's `left` and `right`. */
function drawnOf(
  pass: Pass,
  band: { readonly left: number; readonly right: number },
  columns: readonly number[],
): readonly number[] {
  const { geometry, ratio } = pass;
  const within = [Math.round(band.left * ratio), Math.round(band.right * ratio)] as const;
  return columns.filter((column) => {
    const at = [screenX(geometry, column, pass.scrollLeft), geometry.width(column)] as const;
    return drawsSpan(pass, "columns", spanOf(at, { ratio, within }));
  });
}

/** Draws the columns of an area. Given the columns the pass draws there, in order, it returns the bands, such as
 * rows, in which it drew anything. */
type PaintArea = (columns: readonly number[]) => readonly Band[];

/** Runs `paint` on those of `columns` the pass draws, under one clip to the band between `left` and `right`. */
function clipped(
  pass: Pass,
  band: Band & { readonly left: number; readonly right: number },
  { columns, paint }: { readonly columns: readonly number[]; readonly paint: PaintArea },
): readonly Band[] {
  const drawn = drawnOf(pass, band, columns);
  if (drawn.length === 0) {
    return [];
  }
  const rect = [band.left, band.top, Math.max(0, band.right - band.left), band.height] as const;
  return withClip(pass, rect, () => paint(drawn));
}

/**
 * Runs `paint` on the data columns in view, within `band`: first the scrolling ones, clipped to the area they scroll
 * in, then the pinned ones over them, clipped beside the group column, with a line on their edge once anything is
 * scrolled, drawn again in each band where a pinned column's cell was.
 */
function columnsInView(pass: Pass, band: Band, paint: PaintArea): void {
  const { geometry, theme } = pass;
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
  const drew = clipped(
    pass,
    { ...band, left: geometry.selectPx + geometry.treePx, right: geometry.frozenPx },
    { columns: pinned, paint },
  );
  if (pass.scrollLeft > 0) {
    // A line at the edge; the shadow beside it is an element over the canvas, so redrawn cells never darken it.
    for (const { top, height } of drew) {
      fillRect(pass, theme.borderColor, [geometry.frozenPx - 1, top, 1, height]);
    }
  }
}

export { columnsInView };
export type { Band, PaintArea };
