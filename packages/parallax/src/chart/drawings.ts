/* Drawings on a chart: trend lines, horizontal lines, Fibonacci retracements, rectangles and notes, anchored to data.
 * An anchor holds an x value of the x column, exactly as the frame's points carry it, and a value on the price's axis,
 * so a drawing stays with the data however the chart is zoomed. The engine says where each anchored x value sits on
 * the axis, as only it can on trading time; an anchor placed since the last frame is found among the frame's points,
 * which it was snapped to.
 *
 * Everything here is worked out without the DOM, so that tests can check it. Snapping a pointer to the data is in
 * `snap.ts`, and finding the drawing under it in `drawing-hits.ts`. */

import type { ChartContent, ChartFrameData, SeriesData } from "#frame/chart-data.ts";
import { canonicalJson } from "#frame/chart-frame.ts";
import type { LayoutAnchor, LayoutDrawing } from "#layout/chart.ts";

import type { ChartModel, Point, Rect, Scale } from "./model-types.ts";
import { pixel } from "./scale.ts";

/** A kind of drawing, as a tool that makes one. */
type DrawingTool = LayoutDrawing["kind"];

/** A tool in hand: one that makes a drawing, or the measure, which only asks. */
type Tool = DrawingTool | "measure";

/** The levels of a Fibonacci retracement, as shares of the move from its end back to its start, and their labels. */
const shallowLevel = 0.236;
const lowerGolden = 0.382;
const halfway = 0.5;
const golden = 0.618;
const deepLevel = 0.786;
const fibonacci: readonly (readonly [number, string])[] = [
  [0, "0%"],
  [shallowLevel, "23.6%"],
  [lowerGolden, "38.2%"],
  [halfway, "50%"],
  [golden, "61.8%"],
  [deepLevel, "78.6%"],
  [1, "100%"],
];

/** A line between two points: a trend line or a rectangle's corners. */
interface TwoPointShape {
  readonly kind: "trend" | "rectangle";
  readonly index: number;
  readonly start: Point;
  readonly end: Point;
}

/** A horizontal line across the plot. */
interface HorizontalShape {
  readonly kind: "horizontal";
  readonly index: number;
  readonly y: number;
  readonly left: number;
  readonly right: number;
}

/** A Fibonacci retracement: its move, and a line per level. */
interface FibonacciShape {
  readonly kind: "fibonacci";
  readonly index: number;
  readonly start: Point;
  readonly end: Point;
  readonly levels: readonly { readonly y: number; readonly label: string }[];
}

/** A note: its point, and the box its text is written in. */
interface NoteShape {
  readonly kind: "note";
  readonly index: number;
  readonly at: Point;
  readonly text: string;
  readonly box: Rect;
}

/** A drawing as drawn, by its place among the layout's drawings. */
type Shape = TwoPointShape | HorizontalShape | FibonacciShape | NoteShape;

/** An anchor snapped to the data, and where it is drawn. */
interface Snap {
  readonly anchor: LayoutAnchor;
  readonly point: Point;
}

/** A note's box: its height, and the room around its text and from its point. */
const noteHeight = 20;
const notePadding = 12;
const noteOffset = 8;

/** The price's scale: the left axis of the plot. */
function priceScale(model: ChartModel): Scale | null {
  return model.yAxes.find((axis) => axis.side === "left")?.scale ?? null;
}

/** Where the first of `series` with a point at an x value, as `same` matches it, has that point, or null. */
function positionInSeries(
  series: readonly SeriesData[],
  same: (text: string | null) => boolean,
): number | null {
  for (const line of series) {
    const i = line.xJson.findIndex((text) => same(text));
    if (i !== -1) {
      return line.x[i] ?? null;
    }
  }
  return null;
}

/** Where an x value, as JSON, is among a frame's points or candles, or null if it is at none of them. */
function positionAmong(content: ChartContent, json: string): number | null {
  // The frame writes numbers as the engine does, `2.0` where JavaScript writes `2`: compare them as values.
  const same = (text: string | null): boolean =>
    text !== null && (text === json || canonicalJson(text) === json);
  if (content.kind === "candles") {
    const i = content.candles.xJson.findIndex((text) => same(text));
    return i === -1 ? null : (content.candles.from[i] ?? null);
  }
  return content.kind === "series" ? positionInSeries(content.series, same) : null;
}

/** Where an anchored x value sits on the axis: from the engine, or among the frame's points for one just placed. */
function anchorPosition(frame: ChartFrameData, x: LayoutAnchor["x"]): number | null {
  const json = JSON.stringify(x);
  const placed = frame.anchors.get(json);
  if (placed !== undefined) {
    return Number.isFinite(placed) ? placed : null;
  }
  return positionAmong(frame.content, json);
}

/** The scales a drawing is placed with, and the frame that places its anchors' x values. */
interface Placing {
  readonly frame: ChartFrameData;
  readonly x: Scale;
  readonly y: Scale;
  readonly plot: Rect;
  readonly measure: (text: string) => number;
}

/** An anchor in pixels, or null if the axis cannot place it or the scale cannot, as for a price at or below zero on a log scale. */
function pointOf(placing: Placing, anchor: LayoutAnchor): Point | null {
  const position = anchorPosition(placing.frame, anchor.x);
  if (position === null || (placing.y.log && anchor.y <= 0)) {
    return null;
  }
  return { x: pixel(placing.x, position), y: pixel(placing.y, anchor.y) };
}

/** A note's box: to the right of its point, or to the left near the plot's right edge. */
function noteBox(at: Point, text: string, placing: Placing): Rect {
  const { plot } = placing;
  const width = Math.ceil(placing.measure(text)) + notePadding;
  const height = noteHeight;
  const left =
    at.x + noteOffset + width > plot.x + plot.width ? at.x - noteOffset - width : at.x + noteOffset;
  return { height, width, x: left, y: at.y - height / 2 };
}

/** A note as drawn, or null if its anchor cannot be placed. */
function noteShape(
  drawing: Extract<LayoutDrawing, { kind: "note" }>,
  index: number,
  placing: Placing,
): Shape | null {
  const at = pointOf(placing, drawing.at);
  return at === null
    ? null
    : { at, box: noteBox(at, drawing.text, placing), index, kind: "note", text: drawing.text };
}

/** A drawing of two anchors as drawn, or null if either cannot be placed. */
function twoPointShape(
  drawing: Extract<LayoutDrawing, { kind: "trend" | "fibonacci" | "rectangle" }>,
  index: number,
  placing: Placing,
): Shape | null {
  const [start, end] = [pointOf(placing, drawing.from), pointOf(placing, drawing.to)];
  if (start === null || end === null) {
    return null;
  }
  if (drawing.kind === "fibonacci") {
    // Level 0 sits at the move's end and 100% back at its start.
    const levels = fibonacci.map(([share, label]) => ({
      label,
      y: pixel(placing.y, drawing.to.y + (drawing.from.y - drawing.to.y) * share),
    }));
    return { end, index, kind: "fibonacci", levels, start };
  }
  return { end, index, kind: drawing.kind, start };
}

function shapeOf(drawing: LayoutDrawing, index: number, placing: Placing): Shape | null {
  if (drawing.kind === "horizontal") {
    const { y, plot } = placing;
    return y.log && drawing.y <= 0
      ? null
      : {
          index,
          kind: "horizontal",
          left: plot.x,
          right: plot.x + plot.width,
          y: pixel(y, drawing.y),
        };
  }
  if (drawing.kind === "note") {
    return noteShape(drawing, index, placing);
  }
  return twoPointShape(drawing, index, placing);
}

/** What drawings are placed on: the latest frame, the model drawn, and how wide a note's text is. */
interface ShapesOn {
  readonly frame: ChartFrameData;
  readonly model: ChartModel;
  readonly measure: (text: string) => number;
}

/** The drawings as drawn on a chart's price plot. A drawing whose anchors cannot be placed is left out. */
function shapesOf(
  drawings: readonly LayoutDrawing[],
  { frame, model, measure }: ShapesOn,
): Shape[] {
  const [x, y] = [model.x, priceScale(model)];
  if (x === null || y === null) {
    return [];
  }
  const placing: Placing = { frame, measure, plot: model.plot, x, y };
  return drawings.flatMap((drawing, index): Shape[] => {
    const shape = shapeOf(drawing, index, placing);
    return shape === null ? [] : [shape];
  });
}

/** Where a drawing made with a tool is anchored: its two anchors, and a note's text. */
interface Anchors {
  readonly from: Snap;
  readonly to: Snap;
  readonly text?: string;
}

/** A drawing made with a tool from one anchor to another, or at one, with a note's text. */
function drawingFrom(tool: DrawingTool, { from, to, text = "" }: Anchors): LayoutDrawing {
  switch (tool) {
    case "horizontal": {
      return { kind: "horizontal", y: from.anchor.y };
    }
    case "note": {
      return { at: from.anchor, kind: "note", text };
    }
    case "trend":
    case "fibonacci":
    case "rectangle": {
      return { from: from.anchor, kind: tool, to: to.anchor };
    }
    default: {
      return tool satisfies never;
    }
  }
}

/** A drawing with one anchor moved: by its place among the drawing's anchors, as `handles` gives them. */
function moved(drawing: LayoutDrawing, anchor: number, to: Snap): LayoutDrawing {
  switch (drawing.kind) {
    case "horizontal": {
      return { ...drawing, y: to.anchor.y };
    }
    case "note": {
      return { ...drawing, at: to.anchor };
    }
    case "trend":
    case "fibonacci":
    case "rectangle": {
      return anchor === 0 ? { ...drawing, from: to.anchor } : { ...drawing, to: to.anchor };
    }
    default: {
      return drawing satisfies never;
    }
  }
}

export { anchorPosition, drawingFrom, fibonacci, moved, priceScale, shapesOf };
export type {
  Anchors,
  DrawingTool,
  FibonacciShape,
  HorizontalShape,
  NoteShape,
  Shape,
  ShapesOn,
  Snap,
  Tool,
  TwoPointShape,
};
