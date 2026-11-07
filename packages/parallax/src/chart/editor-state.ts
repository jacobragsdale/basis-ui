/* What the drawing editor holds and reads: its host, the state the page shows, the drawing being made or moved, and
 * the steps that read the host's model and frame, such as snapping the pointer to the data. */

import { stableStringify } from "@basis/ui/utils";

import type { Measurement } from "#engine/view-types.ts";
import type { ChartFrameData } from "#frame/chart-data.ts";
import type { LayoutDrawing } from "#layout/chart.ts";

import { handleAt } from "./drawing-hits.ts";
import { priceScale } from "./drawings.ts";
import type { DrawingTool, Shape, Snap, Tool } from "./drawings.ts";
import type { MeasureCard, Measuring } from "./measure.ts";
import type { ChartModel, Point } from "./model-types.ts";
import { pixel } from "./scale.ts";
import { seriesAt, snap } from "./snap.ts";
import type { SeriesChoice } from "./snap.ts";

/** What the editor reads from its chart, and how it saves and tells of changes. */
interface DrawingHost {
  readonly model: () => ChartModel | null;
  readonly frame: () => ChartFrameData | null;
  /** The layout's drawings; right after `save`, the saved ones. */
  readonly drawings: () => readonly LayoutDrawing[];
  readonly save: (drawings: readonly LayoutDrawing[]) => void;
  /** Measures a label's width in the chart font. */
  readonly measure: (text: string) => number;
  /** Series hidden from the plot, by their legend labels, which anchors never snap to. */
  readonly hidden: () => readonly string[];
  /** Asks the engine to measure between two axis positions. */
  readonly measureChart: (from: number, to: number, series: string) => Promise<Measurement | null>;
  /** After every change: `state` when `state` changed, and the canvas with it; `paint` when only the canvas did. */
  readonly changed: (what: "state" | "paint") => void;
}

/** What the page shows of the editor around the canvas. */
interface EditorState {
  /** The tool in hand, or null. */
  readonly tool: Tool | null;
  /** The selected drawing, by its place in the layout, or null. */
  readonly selected: number | null;
  /** Where a note being placed is anchored, while its text is typed. */
  readonly note: Snap | null;
  /** The measurement's card, or null. */
  readonly measure: MeasureCard | null;
}

/** A drawing being made: its tool and its two anchors so far. */
interface Sketch {
  readonly tool: DrawingTool;
  readonly from: Snap;
  readonly to: Snap;
}

/** A drawing chosen by its place in the layout and what it was there, so that a layout changed since cannot redirect it. */
interface Choice {
  readonly index: number;
  readonly key: string;
}

/** A drawing's anchor being dragged: the drawing, as it was when grabbed, the anchor and where it is now. */
interface Move extends Choice {
  readonly anchor: number;
  readonly to: Snap | null;
}

/** The fewest pixels between a drawing's anchors: a press without a drag makes nothing. */
const smallest = 4;
/** How far from a horizontal line, in pixels, a press grabs it. */
const grabSlack = 6;
/** The load a measurement is of before any frame. */
const noLoad = 0n;

/** The editor's state at rest: no tool, no selection, no note and no measurement. */
const resting: EditorState = { measure: null, note: null, selected: null, tool: null };

/** What a drawing is, to tell whether the drawing at a place is still the one chosen: its JSON with keys in order, since
 * the layout's schema writes a drawing's keys in its own order when the page passes the layout back. */
function keyOf(drawing: LayoutDrawing): string {
  return stableStringify(drawing);
}

/** The anchor of a selected drawing under `at`: a handle, or anywhere along a horizontal line. */
function grab(shape: Shape, at: Point): number | null {
  if (shape.kind === "horizontal") {
    return Math.abs(at.y - shape.y) <= grabSlack ? 0 : null;
  }
  return handleAt(shape, at);
}

/** A measurement's card: what of it the page shows. */
function cardOf(measuring: Measuring | null): MeasureCard | null {
  return measuring === null
    ? null
    : {
        load: measuring.load,
        measurement: measuring.measurement,
        series: measuring.series,
        state: measuring.state,
      };
}

function sameCard(first: MeasureCard | null, second: MeasureCard | null): boolean {
  return (
    first === second ||
    (first !== null &&
      second !== null &&
      first.state === second.state &&
      first.series === second.series &&
      first.measurement === second.measurement &&
      first.load === second.load)
  );
}

/** Whether two states show the same, so that a change that alters none of it renders nothing. */
function sameState(first: EditorState, second: EditorState): boolean {
  return (
    first.tool === second.tool &&
    first.selected === second.selected &&
    first.note === second.note &&
    sameCard(first.measure, second.measure)
  );
}

/** The drawing chosen at `index`, as the host's drawings now hold it, or null. */
function choiceAt(host: DrawingHost, index: number | null): Choice | null {
  const drawing = index === null ? undefined : host.drawings()[index];
  return index === null || drawing === undefined ? null : { index, key: keyOf(drawing) };
}

/** The chosen drawing's place, or null once the layout no longer holds it there. */
function selectedOf(host: DrawingHost, choice: Choice | null): number | null {
  if (choice === null) {
    return null;
  }
  const drawing = host.drawings()[choice.index];
  return drawing !== undefined && keyOf(drawing) === choice.key ? choice.index : null;
}

/** What the editor holds that the page shows. */
interface Shown {
  readonly tool: Tool | null;
  readonly choice: Choice | null;
  readonly note: Snap | null;
  readonly measuring: Measuring | null;
}

/** The state the page shows: the tool, the selection while the layout still holds it, the note and the card. */
function stateOf(host: DrawingHost, { tool, choice, note, measuring }: Shown): EditorState {
  return {
    measure: cardOf(measuring),
    note,
    selected: selectedOf(host, choice),
    tool,
  };
}

/** An anchor at `at`, held within the price's plot: drawings go over the price, not its panes. */
function snapAt(host: DrawingHost, at: Point): Snap | null {
  const [model, frame] = [host.model(), host.frame()];
  if (model === null || frame === null) {
    return null;
  }
  const { plot } = model;
  const point = { x: at.x, y: Math.min(plot.y + plot.height, Math.max(plot.y, at.y)) };
  return snap(frame, model, { hidden: host.hidden(), point });
}

/** Whether `at` is on the price's plot, where drawings are made. */
function onPrice(host: DrawingHost, at: Point): boolean {
  const plot = host.model()?.plot;
  return plot !== undefined && at.y >= plot.y && at.y <= plot.y + plot.height;
}

/** A point's axis position and price. */
function valueAt(host: DrawingHost, point: Point): Point | null {
  const model = host.model();
  const x = model?.x ?? null;
  const y = model === null ? null : priceScale(model);
  return x === null || y === null ? null : { x: x.invert(point.x), y: y.invert(point.y) };
}

/** An axis position and price in pixels. */
function pointOf(host: DrawingHost, value: Point): Point {
  const model = host.model();
  const x = model?.x ?? null;
  const y = model === null ? null : priceScale(model);
  return {
    x: x === null ? 0 : pixel(x, value.x),
    y: y === null ? 0 : pixel(y, value.y),
  };
}

/** The shown series under a point on a line chart of several, which a measurement measures. */
function seriesUnder(host: DrawingHost, point: Point): SeriesChoice | null {
  const [model, frame] = [host.model(), host.frame()];
  return model === null || frame === null
    ? null
    : seriesAt(frame, model, { hidden: host.hidden(), point });
}

/** A measurement starting at an anchor, or null where the anchor has no price. */
function measuringAt(host: DrawingHost, anchor: Snap): Measuring | null {
  const at = valueAt(host, anchor.point);
  const choice = seriesUnder(host, anchor.point);
  return at === null
    ? null
    : {
        from: at,
        load: host.frame()?.loadVersion ?? noLoad,
        measurement: null,
        series: choice?.label ?? "",
        state: "dragging",
        to: at,
      };
}

/** Whether a measurement's band is wide enough, on the chart's x axis now, to ask about. */
function wideEnough(host: DrawingHost, measuring: Measuring): boolean {
  const x = host.model()?.x ?? null;
  return (
    x !== null && !(Math.abs(pixel(x, measuring.to.x) - pixel(x, measuring.from.x)) < smallest)
  );
}

export {
  cardOf,
  choiceAt,
  grab,
  keyOf,
  measuringAt,
  onPrice,
  pointOf,
  resting,
  sameState,
  selectedOf,
  seriesUnder,
  smallest,
  snapAt,
  stateOf,
  valueAt,
  wideEnough,
};
export type { Choice, DrawingHost, EditorState, Move, Sketch };
