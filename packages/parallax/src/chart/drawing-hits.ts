/* Finding the drawing under the pointer, and the handle of a selected one, within a few pixels of its lines. */

import type { Shape, TwoPointShape } from "./drawings.ts";
import type { Point, Rect } from "./model-types.ts";

/** How far from a drawing, in pixels, the pointer still picks it. */
const slack = 6;

/** The distance from `point` to the segment from `start` to `end`. */
function toSegment(point: Point, start: Point, end: Point): number {
  const [dx, dy] = [end.x - start.x, end.y - start.y];
  const length = dx * dx + dy * dy;
  const along =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length));
  return Math.hypot(point.x - (start.x + along * dx), point.y - (start.y + along * dy));
}

function inside(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function edges(rect: Rect): readonly (readonly [Point, Point])[] {
  const [topLeft, topRight, bottomRight, bottomLeft] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  return [
    [topLeft, topRight],
    [topRight, bottomRight],
    [bottomRight, bottomLeft],
    [bottomLeft, topLeft],
  ];
}

/** How far `point` is from a rectangle: 0 inside it, else from its nearest edge. */
function toRectangle(shape: TwoPointShape, point: Point): number {
  const box = {
    height: Math.abs(shape.end.y - shape.start.y),
    width: Math.abs(shape.end.x - shape.start.x),
    x: Math.min(shape.start.x, shape.end.x),
    y: Math.min(shape.start.y, shape.end.y),
  };
  return inside(point, box)
    ? 0
    : Math.min(...edges(box).map(([from, to]) => toSegment(point, from, to)));
}

/** How far `point` is from a drawing: its lines, or a rectangle's or note's inside. */
function distance(shape: Shape, point: Point): number {
  switch (shape.kind) {
    case "trend": {
      return toSegment(point, shape.start, shape.end);
    }
    case "horizontal": {
      return point.x >= shape.left && point.x <= shape.right
        ? Math.abs(point.y - shape.y)
        : Number.POSITIVE_INFINITY;
    }
    case "fibonacci": {
      return Math.min(
        ...shape.levels.map((level) =>
          toSegment(point, { x: shape.start.x, y: level.y }, { x: shape.end.x, y: level.y }),
        ),
      );
    }
    case "rectangle": {
      return toRectangle(shape, point);
    }
    case "note": {
      return inside(point, shape.box) ? 0 : Math.hypot(point.x - shape.at.x, point.y - shape.at.y);
    }
    default: {
      return shape satisfies never;
    }
  }
}

/** The drawing nearest `point` within a few pixels, by its place among the layout's drawings, or null. */
function drawingAt(shapes: readonly Shape[], point: Point): number | null {
  let best: { readonly index: number; readonly distance: number } | null = null;
  for (const shape of shapes) {
    const away = distance(shape, point);
    if (away <= slack && (best === null || away < best.distance)) {
      best = { distance: away, index: shape.index };
    }
  }
  return best?.index ?? null;
}

/** A drawing's handles: the points its anchors are drawn at. A horizontal line's is where the pointer meets it. */
function handles(shape: Shape): readonly Point[] {
  switch (shape.kind) {
    case "trend":
    case "rectangle":
    case "fibonacci": {
      return [shape.start, shape.end];
    }
    case "horizontal": {
      return [];
    }
    case "note": {
      return [shape.at];
    }
    default: {
      return shape satisfies never;
    }
  }
}

/** The handle of a drawing under `point`, by its anchor's place, or null. */
function handleAt(shape: Shape, point: Point): number | null {
  const i = handles(shape).findIndex(
    (handle) => Math.hypot(handle.x - point.x, handle.y - point.y) <= slack,
  );
  return i === -1 ? null : i;
}

export { drawingAt, handleAt, handles, slack };
