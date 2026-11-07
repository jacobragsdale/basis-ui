/* The icons a grid's canvas draws, as SVG path data on a 16-unit square, and how it draws them. */

/** The funnel that opens a column's menu. */
const funnelPath = "M2.5 3h11L9.25 8.25v4.75l-2.5-1.25V8.25z";
/** A pinned column's pin. */
const pinPath = "M5.5 2.5h5M6.5 2.5v4l-2 2.5h7l-2-2.5v-4M8 9v5";
/** The mark of a pivot measure's menu, where a column has its funnel: a measure is not filtered from its header. */
const chevronPath = "M4 6l4 4 4-4";
/** A group's expand marker: open, and closed. */
const openPath = "M4.5 6.5l3.5 3.5 3.5-3.5";
const closedPath = "M6.5 4.5l3.5 3.5-3.5 3.5";
/** A column's sort, ascending and descending. */
const upPath = "M8 12.5v-9M4.5 7L8 3.5 11.5 7";
const downPath = "M8 3.5v9M4.5 9L8 12.5 11.5 9";

/** The square the paths are drawn on. */
const viewBox = 16;
const strokeWidth = 1.5;

/** An icon to draw: its path, its top left, its size, its colour, whether it is filled, and how strongly it draws. */
interface IconSpec {
  readonly path: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly color: string;
  readonly filled?: boolean;
  readonly alpha?: number;
}

/** The icon's shape, from its path. */
function shapeOf(path: string): Path2D {
  return new Path2D(path);
}

/** Draws an icon's path, `size` pixels square, with its top left at `x`, `y`, at `alpha` strength. */
function drawIcon(context: CanvasRenderingContext2D, icon: IconSpec): void {
  context.save();
  Object.assign(context, {
    globalAlpha: icon.alpha ?? 1,
    lineCap: "round",
    lineJoin: "round",
    lineWidth: strokeWidth,
    strokeStyle: icon.color,
  });
  context.translate(icon.x, icon.y);
  context.scale(icon.size / viewBox, icon.size / viewBox);
  const shape = shapeOf(icon.path);
  if (icon.filled === true) {
    Object.assign(context, { fillStyle: icon.color });
    context.fill(shape);
  }
  context.stroke(shape);
  context.restore();
}

export { chevronPath, closedPath, downPath, drawIcon, funnelPath, openPath, pinPath, upPath };
export type { IconSpec };
