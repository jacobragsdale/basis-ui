/* The drawing editor's steps that need none of its state: the drawings as drawn while one is made or moved, the
 * handle a press grabs, and the drawing a sketch or a move makes. */

import type { Measurement } from "#engine/view-types.ts";
import type { LayoutDrawing } from "#layout/chart.ts";

import { drawingFrom, moved, shapesOf } from "./drawings.ts";
import type { Shape } from "./drawings.ts";
import { drawingAt } from "./drawing-hits.ts";
import {
  choiceAt,
  grab,
  keyOf,
  pointOf,
  selectedOf,
  seriesUnder,
  smallest,
  snapAt,
  valueAt,
} from "./editor-state.ts";
import type { Choice, DrawingHost, Move, Sketch } from "./editor-state.ts";
import type { Measuring } from "./measure.ts";
import type { Point } from "./model-types.ts";

/** The drawings as drawn now: a drawing being made or moved included. */
function shownDrawings(
  saved: readonly LayoutDrawing[],
  { sketch, moving }: { readonly sketch: Sketch | null; readonly moving: Move | null },
): readonly LayoutDrawing[] {
  const drawings = [...saved];
  const to = moving?.to ?? null;
  const target = moving === null ? undefined : drawings[moving.index];
  if (moving !== null && to !== null && target !== undefined) {
    drawings[moving.index] = moved(target, moving.anchor, to);
  }
  if (sketch !== null) {
    drawings.push(drawingFrom(sketch.tool, { from: sketch.from, to: sketch.to }));
  }
  return drawings;
}

/** Where a press is, the drawings as drawn, and the selected one's place. */
interface Press {
  readonly at: Point;
  readonly shapes: readonly Shape[];
  readonly index: number | null;
}

/** The selected drawing's anchor a press grabs by its handle, or null if it grabs none. */
function grabbedHandle(host: DrawingHost, { at, shapes, index }: Press): Move | null {
  const selected = shapes.find((shape) => shape.index === index);
  const handle = selected === undefined ? null : grab(selected, at);
  const grabbed = selected === undefined ? undefined : host.drawings()[selected.index];
  return selected === undefined || handle === null || grabbed === undefined
    ? null
    : { anchor: handle, index: selected.index, key: keyOf(grabbed), to: null };
}

/** What a press without a tool does: grabs the selected drawing's handle under it, or selects the drawing under it. */
function pressDrawings(
  host: DrawingHost,
  {
    at,
    choice,
    shapes,
  }: { readonly at: Point; readonly choice: Choice | null; readonly shapes: readonly Shape[] },
): { readonly moving: Move | null; readonly choice: Choice | null } {
  const moving = grabbedHandle(host, { at, index: selectedOf(host, choice), shapes });
  return moving === null
    ? { choice: choiceAt(host, drawingAt(shapes, at)), moving }
    : { choice, moving };
}

/** A measurement with its band's end moved to the data at `at`, or null where there is none to snap to. */
function dragged(host: DrawingHost, measuring: Measuring, at: Point): Measuring | null {
  const to = snapAt(host, at);
  const value = to === null ? null : valueAt(host, to.point);
  return value === null ? null : { ...measuring, to: value };
}

/** The drawing a sketch makes, or null if its anchors are too close: a press without a drag makes nothing. */
function sketchDrawing({ tool, from, to }: Sketch): LayoutDrawing | null {
  return Math.hypot(to.point.x - from.point.x, to.point.y - from.point.y) >= smallest
    ? drawingFrom(tool, { from, to })
    : null;
}

/** The drawings with a moved anchor, or null if the layout no longer holds the drawing grabbed, where it was. */
function movedDrawings(
  drawings: readonly LayoutDrawing[],
  move: Move,
): readonly LayoutDrawing[] | null {
  const { to } = move;
  const target = drawings[move.index];
  if (to === null || target === undefined || keyOf(target) !== move.key) {
    return null;
  }
  const changed = moved(target, move.anchor, to);
  return drawings.map((drawing, index) => (index === move.index ? changed : drawing));
}

/** The drawings in pixels, on the host's model and frame now. */
function shapesNow(host: DrawingHost, shown: readonly LayoutDrawing[]): readonly Shape[] {
  const [model, frame] = [host.model(), host.frame()];
  return model === null || frame === null
    ? []
    : shapesOf(shown, { frame, measure: host.measure, model });
}

/** A measurement once the engine answers: what it measured, or that there was nothing to measure. */
function answered(asking: Measuring, measurement: Measurement | null): Measuring {
  return { ...asking, measurement, state: measurement === null ? "nothing" : "measured" };
}

/** Asks the engine what changed across a measurement's band, of the series under its start, and settles it with the answer. */
function askMeasure(host: DrawingHost, asking: Measuring, settle: (next: Measuring) => void): void {
  // On a chart of one series, the engine measures it: its first y column, or an OHLC chart's close.
  const series = seriesUnder(host, pointOf(host, asking.from)) ?? { column: "", key: "" };
  host
    .measureChart(asking.from.x, asking.to.x, series)
    .then((measurement) => {
      settle(answered(asking, measurement));
      return measurement;
    })
    .catch(() => {
      settle({ ...asking, state: "failed" });
    });
}

export {
  askMeasure,
  dragged,
  grabbedHandle,
  movedDrawings,
  pressDrawings,
  shapesNow,
  shownDrawings,
  sketchDrawing,
};
