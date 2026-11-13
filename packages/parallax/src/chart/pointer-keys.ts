/* What the wheel and the keys do to a chart's x range: how far they zoom and pan, and which key does what. */

import { panRange, zoomRange } from "./range.ts";
import type { Scale } from "./model-types.ts";
import type { Range } from "./range.ts";
import type { ChartZoom } from "./zoom.ts";

/** How far a step of the wheel or a key zooms in or out. */
const zoomIn = 0.8;
const zoomOut = 1.25;
/** A key pans a tenth of the range shown. */
const panSteps = 10;

/** What a key does to the plot. */
type KeyAction = "in" | "out" | "left" | "right" | "all" | "clear" | "remove";

const keys: Readonly<Partial<Record<string, KeyAction>>> = {
  "+": "in",
  "-": "out",
  "0": "all",
  "=": "in",
  ArrowLeft: "left",
  ArrowRight: "right",
  Backspace: "remove",
  Delete: "remove",
  Escape: "clear",
};

/** The range a key moves to from `range`. */
function keyed(
  action: "in" | "out" | "left" | "right",
  range: Range,
  extent: Range | null,
): Range | null {
  if (action === "in" || action === "out") {
    const anchor = (range[0] + range[1]) / 2;
    return zoomRange(range, { anchor, factor: action === "in" ? zoomIn : zoomOut, full: extent });
  }
  const step = (range[1] - range[0]) / panSteps;
  return panRange(range, action === "left" ? -step : step, extent);
}

/** Whether a key or the wheel is the browser's, with Ctrl, Cmd or Alt held: Ctrl and + or the wheel zoom the page,
 * and Alt and Left goes back. */
function browsers(event: {
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}): boolean {
  return event.ctrlKey || event.metaKey || event.altKey;
}

/** Where a turn of the wheel zooms. */
interface Turn {
  /** The axis position under the pointer, which stays put. */
  readonly anchor: number;
  /** The data's whole x range. */
  readonly full: Range | null;
  /** Whether it zooms out. */
  readonly out: boolean;
  /** Whether less than everything is shown. */
  readonly zoomed: boolean;
}

/** The range a turn of the wheel zooms `range` to, null for everything; or undefined when the wheel is the page's to
 * scroll with, as when everything is shown and it zooms out further, and asking the engine again would change
 * nothing. */
function wheeled(range: Range, { anchor, full, out, zoomed }: Turn): Range | null | undefined {
  const next = zoomRange(range, { anchor, factor: out ? zoomOut : zoomIn, full });
  return next === null && !zoomed ? undefined : next;
}

/** Where the wheel turned over a plot: the pixel along its x scale, and the data's whole range. */
interface WheelAt {
  readonly at: number;
  readonly x: Scale | null;
  readonly full: Range | null;
  readonly zoom: ChartZoom;
}

/** Zooms around the pointer, up to zoom in and down to zoom out, and takes the wheel from the page; unless the wheel
 * is the page's, or the browser's. */
function wheelZoom(event: WheelEvent, { at, x, full, zoom }: WheelAt): void {
  const range = zoom.shown();
  if (x === null || range === null || event.deltaY === 0 || browsers(event)) {
    return;
  }
  const turn = { anchor: x.invert(at), full, out: event.deltaY > 0, zoomed: zoom.zoomed() };
  const next = wheeled(range, turn);
  if (next !== undefined) {
    event.preventDefault();
    zoom.schedule(next);
    zoom.settle("at rest");
  }
}

export { browsers, keyed, keys, wheeled, wheelZoom, zoomIn, zoomOut };
export type { KeyAction };
