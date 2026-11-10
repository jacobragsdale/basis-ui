/* What a draw of the grid's canvas must draw again: everything, when what a full redraw depends on changed; the rows
 * the selection and the pointer moved over; and, after a scroll that moved the pixels, nothing it remembers of the
 * cells that left the view. */

import type { FrameData } from "#frame/frame.ts";
import type { CellRange, CellRef } from "#grid/selection.ts";

import type { Area, Scene } from "./scene.ts";

/** Everything a full redraw depends on, as one comparable string. Where the view is scrolled to is not: a scroll moves
 * the pixels it can and paints what it exposed. */
function shapeOf(scene: Scene, at: Area, ratio: number): string {
  const { frame, layout, geometry } = scene;
  const versions =
    frame === null
      ? null
      : [
          frame.configVersion.toString(),
          frame.loadVersion.toString(),
          frame.totalRows,
          frame.totals === null,
        ];
  const decor =
    layout === null
      ? null
      : [
          layout.column_widths,
          layout.sort,
          layout.group_sort,
          layout.filters,
          layout.pinned,
          scene.hoverHeader,
          scene.menuColumn,
          scene.drag,
          // The header's checkbox is drawn with the header, so a change to it draws everything again.
          scene.rowSelection?.header ?? null,
        ];
  const columns = [geometry.selectPx, geometry.treePx, geometry.contentWidth];
  return JSON.stringify([[at.width, at.height, ratio], versions, columns, decor]);
}

/** Whether a row is in a range. */
function covered(range: CellRange | null, row: number): boolean {
  return range !== null && row >= range.top && row <= range.bottom;
}

/** What the canvas showed when it was last drawn: its selection, focus and highlighted row. */
interface Shown {
  readonly range: CellRange | null;
  readonly focus: CellRef | null;
  readonly hover: number | null;
}

const nothingShown: Shown = { focus: null, hover: null, range: null };

/** The visible rows the selection covered or now covers, which must be drawn again even if their text is the same. */
function selectionRows(
  now: Shown,
  was: Shown,
  rows: { readonly first: number; readonly count: number },
): number[] {
  const stale: number[] = [];
  for (let row = rows.first; row < rows.first + rows.count; row += 1) {
    const focused = row === now.focus?.row || row === was.focus?.row;
    if (covered(now.range, row) || covered(was.range, row) || focused) {
      stale.push(row);
    }
  }
  return stale;
}

/** The rows the pointer left and entered. */
function hoverRows(now: Shown, was: Shown): number[] {
  if (now.hover === was.hover) {
    return [];
  }
  return [now.hover, was.hover].filter((row) => row !== null);
}

/** Whether the selection moved since the canvas was drawn. */
function moved(now: Shown, was: Shown): boolean {
  return JSON.stringify([now.range, now.focus]) !== JSON.stringify([was.range, was.focus]);
}

/** The rows and data columns in view, as a scroll leaves them: the view rows from `first`, `count` of them, and the
 * columns, -2 for the checkboxes and -1 for the group column. */
interface InView {
  readonly first: number;
  readonly count: number;
  readonly columns: ReadonlySet<number>;
}

/** Whether the cell of key `key`, `row:column`, is in view. */
function keyInView(key: string, view: InView): boolean {
  const colon = key.indexOf(":");
  const [row, column] = [Number(key.slice(0, colon)), Number(key.slice(colon + 1))];
  return row >= view.first && row < view.first + view.count && view.columns.has(column);
}

/** What the painter remembers of what it drew: each cell's text, by cell key, its tooltip, the rows drawn, each
 * header's title, and the totals the totals row showed. A full redraw forgets it all; a scroll that moves the pixels
 * forgets what it took out of view, so that what is remembered stays the size of the view however far it scrolls, and a
 * cell that comes back is painted with what the scroll exposes. */
class Memory {
  public readonly drawn = new Map<string, string>();
  public readonly notes = new Map<string, string>();
  public readonly drawnRows = new Set<number>();
  public readonly titles = new Map<number, string>();
  /** The totals the totals row was drawn with, or undefined until it is drawn. */
  public totals: FrameData["totals"] | undefined = undefined;

  /** Forgets everything, for a full redraw. */
  public clear(): void {
    this.drawn.clear();
    this.notes.clear();
    this.drawnRows.clear();
    this.titles.clear();
    this.totals = undefined;
  }

  /** Forgets the cells, rows and headers out of `view`. */
  public keepOnly(view: InView): void {
    for (const map of [this.drawn, this.notes]) {
      for (const key of map.keys()) {
        if (!keyInView(key, view)) {
          map.delete(key);
        }
      }
    }
    for (const row of this.drawnRows) {
      if (row < view.first || row >= view.first + view.count) {
        this.drawnRows.delete(row);
      }
    }
    for (const column of this.titles.keys()) {
      if (!view.columns.has(column)) {
        this.titles.delete(column);
      }
    }
  }
}

export { Memory, hoverRows, moved, nothingShown, selectionRows, shapeOf };
export type { InView, Shown };
