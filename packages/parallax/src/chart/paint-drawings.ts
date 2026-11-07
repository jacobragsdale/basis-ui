/* Painting drawings in the price plot: in the text colour, the selected one in the selection colour with its handles. */

import { handles } from "./drawing-hits.ts";
import type {
  FibonacciShape,
  HorizontalShape,
  NoteShape,
  Shape,
  TwoPointShape,
} from "./drawings.ts";
import type { ChartModel, Point } from "./model-types.ts";
import { half, strokeLine, style } from "./paint-canvas.ts";
import type { Painting } from "./paint-canvas.ts";

/** Drawings over the price, and which is selected. */
interface DrawingLayer {
  readonly shapes: readonly Shape[];
  readonly selected: number | null;
}

/** A drawing's line width, and the selected one's. */
const drawnWidth = 1.5;
const selectedWidth = 2;
/** The dashes of a Fibonacci retracement's move: as long as their gaps. */
const moveDash = 3;
const moveDashes = [moveDash, moveDash];
/** How faint a rectangle's fill is. */
const rectangleFill = 0.08;
/** A note's dot, and how far its text is in from its box's edge. */
const noteDot = 3;
const noteInset = 6;
/** A handle's square: its side, and half of it. */
const handleSide = 7;
const handleHalf = 3.5;

function segment({ ctx }: Painting, start: Point, end: Point): void {
  strokeLine(ctx, [start.x, start.y], [end.x, end.y]);
}

function fibonacciShape(painting: Painting, shape: FibonacciShape): void {
  const { ctx } = painting;
  const [left, right] = [
    Math.min(shape.start.x, shape.end.x),
    Math.max(shape.start.x, shape.end.x),
  ];
  ctx.setLineDash(moveDashes);
  segment(painting, shape.start, shape.end);
  ctx.setLineDash([]);
  style(ctx, { textAlign: "left", textBaseline: "bottom" });
  for (const level of shape.levels) {
    segment(painting, { x: left, y: level.y }, { x: right, y: level.y });
    ctx.fillText(level.label, left + 2, level.y - 1);
  }
}

function rectangleShape({ ctx }: Painting, start: Point, end: Point): void {
  const [x, y, width, height] = [
    Math.min(start.x, end.x),
    Math.min(start.y, end.y),
    Math.abs(end.x - start.x),
    Math.abs(end.y - start.y),
  ];
  ctx.globalAlpha = rectangleFill;
  ctx.fillRect(x, y, width, height);
  ctx.globalAlpha = 1;
  ctx.strokeRect(x, y, width, height);
}

function noteShape({ ctx, theme }: Painting, shape: NoteShape, color: string): void {
  const { box } = shape;
  ctx.beginPath();
  ctx.arc(shape.at.x, shape.at.y, noteDot, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = theme.background;
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.strokeRect(box.x + half, box.y + half, box.width - 1, box.height - 1);
  style(ctx, { fillStyle: theme.foreground, textAlign: "left", textBaseline: "middle" });
  ctx.fillText(shape.text, box.x + noteInset, box.y + box.height / 2);
  ctx.fillStyle = color;
}

/** A trend line's ends, or a horizontal line's across the plot. */
function lineEnds(shape: TwoPointShape | HorizontalShape): readonly [Point, Point] {
  return shape.kind === "horizontal"
    ? [
        { x: shape.left, y: shape.y },
        { x: shape.right, y: shape.y },
      ]
    : [shape.start, shape.end];
}

/** A drawing's lines, in `color`. */
function paintShape(painting: Painting, shape: Shape, color: string): void {
  style(painting.ctx, { strokeStyle: color, fillStyle: color });
  if (shape.kind === "fibonacci") {
    fibonacciShape(painting, shape);
  } else if (shape.kind === "rectangle") {
    rectangleShape(painting, shape.start, shape.end);
  } else if (shape.kind === "note") {
    noteShape(painting, shape, color);
  } else {
    const [start, end] = lineEnds(shape);
    segment(painting, start, end);
  }
}

function paintHandles({ ctx, theme }: Painting, shape: Shape): void {
  for (const handle of handles(shape)) {
    ctx.fillStyle = theme.background;
    ctx.fillRect(handle.x - handleHalf, handle.y - handleHalf, handleSide, handleSide);
    ctx.strokeRect(handle.x - handleHalf, handle.y - handleHalf, handleSide, handleSide);
  }
}

/** One drawing: in the text colour, or the selected one in the selection colour, thicker, with its handles. */
function paintDrawing(painting: Painting, shape: Shape, selected: boolean): void {
  const { ctx, theme } = painting;
  const color = selected ? theme.selectionBorder : theme.foreground;
  ctx.lineWidth = selected ? selectedWidth : drawnWidth;
  paintShape(painting, shape, color);
  if (selected) {
    style(ctx, { strokeStyle: color, lineWidth: 1 });
    paintHandles(painting, shape);
  }
}

/** Paints drawings in the price plot: in the text colour, the selected one in the selection colour with its handles. */
function paintDrawings(painting: Painting, model: ChartModel, layer: DrawingLayer): void {
  const { ctx, theme } = painting;
  ctx.save();
  ctx.beginPath();
  ctx.rect(model.plot.x, model.plot.y, model.plot.width, model.plot.height);
  ctx.clip();
  style(ctx, { font: theme.font, lineWidth: drawnWidth });
  for (const shape of layer.shapes) {
    paintDrawing(painting, shape, shape.index === layer.selected);
  }
  ctx.restore();
}

export { paintDrawings };
export type { DrawingLayer };
