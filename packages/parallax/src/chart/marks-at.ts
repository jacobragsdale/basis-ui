/* The mark under the pointer, worked out without the DOM so that tests can check it: what its tooltip reads, and the
 * group a click on a bar or slice selects. */

import type { Reading, TipRow } from "./interaction.ts";
import type { ChartModel, Hit, Mark, SliceMark } from "./model-types.ts";

/** How far outside a mark, in pixels, the pointer still reads it. */
const markSlack = 4;

/** Where the pointer is over the plot, in pixels. */
interface At {
  readonly px: number;
  readonly py: number;
}

function rowsOf(hit: Hit, color: string | null): readonly TipRow[] {
  return hit.rows.map((row) => ({ color, label: row.label, value: row.value }));
}

/** Whether the pointer is on a slice: within its ring, give or take a few pixels, and between its angles. */
function onSlice(mark: SliceMark, { px, py }: At): boolean {
  const radius = Math.hypot(px - mark.cx, py - mark.cy);
  if (radius > mark.outer + markSlack || radius < mark.inner - markSlack) {
    return false;
  }
  // The pointer's angle, moved by whole turns to at or after the slice's start.
  const turn = 2 * Math.PI;
  const angle = Math.atan2(py - mark.cy, px - mark.cx);
  return angle - turn * Math.floor((angle - mark.start) / turn) <= mark.end;
}

/** How far the pointer is from a bar or cell's middle, or null outside its rectangle and a few pixels more. */
function toRect(mark: Extract<Mark, { kind: "rect" | "cell" }>, { px, py }: At): number | null {
  const { rect } = mark;
  const inside =
    px >= rect.x - markSlack &&
    px <= rect.x + rect.width + markSlack &&
    py >= rect.y - markSlack &&
    py <= rect.y + rect.height + markSlack;
  return inside
    ? Math.hypot(px - (rect.x + rect.width / 2), py - (rect.y + rect.height / 2))
    : null;
}

/** How far the pointer is from a mark, or null if it is outside the mark's hit area, a few pixels larger than the mark. */
function distanceTo(mark: Mark, at: At): number | null {
  switch (mark.kind) {
    case "slice": {
      return onSlice(mark, at) ? 0 : null;
    }
    case "candle": {
      const distance = Math.abs(mark.x - at.px);
      return distance <= mark.width / 2 + markSlack ? distance : null;
    }
    case "rect":
    case "cell": {
      return toRect(mark, at);
    }
    case "line":
    case "band":
    case "columns": {
      return null;
    }
    default: {
      return mark satisfies never;
    }
  }
}

/** What a mark's tooltip reads. */
function readMark(mark: Mark): Reading | null {
  switch (mark.kind) {
    case "candle": {
      return { crosshair: mark.x, rows: rowsOf(mark.hit, null), title: mark.hit.title };
    }
    case "rect":
    case "slice": {
      return { crosshair: null, rows: rowsOf(mark.hit, mark.color), title: mark.hit.title };
    }
    case "cell": {
      return mark.hit === null
        ? null
        : { crosshair: null, rows: rowsOf(mark.hit, mark.color), title: mark.hit.title };
    }
    case "line":
    case "band":
    case "columns": {
      return null;
    }
    default: {
      return mark satisfies never;
    }
  }
}

/** The nearest mark whose hit area holds the pointer, of those `keep` accepts. */
function nearestMark(model: ChartModel, at: At, keep: (mark: Mark) => boolean): Mark | null {
  let best: { readonly mark: Mark; readonly distance: number } | null = null;
  for (const mark of model.marks) {
    const distance = keep(mark) ? distanceTo(mark, at) : null;
    if (distance !== null && (best === null || distance < best.distance)) {
      best = { distance, mark };
    }
  }
  return best?.mark ?? null;
}

/** The group a mark stands for, which clicking it selects: a bar's or a slice's, but not "Other"'s. */
function groupOf(mark: Mark): number | null {
  switch (mark.kind) {
    case "slice": {
      return mark.category;
    }
    case "rect": {
      return mark.category ?? null;
    }
    case "line":
    case "band":
    case "columns":
    case "cell":
    case "candle": {
      return null;
    }
    default: {
      return mark satisfies never;
    }
  }
}

/** The group of the bar or slice under the pointer, which clicking it selects; null where there is none, or for "Other". */
function categoryAt(model: ChartModel, px: number, py: number): number | null {
  const mark = nearestMark(model, { px, py }, (candidate) => groupOf(candidate) !== null);
  return mark === null ? null : groupOf(mark);
}

/** The mark nearest the pointer whose hit area holds it, and what it reads. */
function markAt(model: ChartModel, px: number, py: number): Reading | null {
  // A density's cells read nothing of their own.
  const mark = nearestMark(
    model,
    { px, py },
    (candidate) => !(candidate.kind === "cell" && candidate.hit === null),
  );
  return mark === null ? null : readMark(mark);
}

export { categoryAt, markAt };
