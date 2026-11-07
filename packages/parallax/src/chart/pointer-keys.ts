/* What the wheel and the keys do to a chart's x range: how far they zoom and pan, and which key does what. */

import { panRange, zoomRange } from "./range.ts";
import type { Range } from "./range.ts";

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

export { keyed, keys, zoomIn, zoomOut };
export type { KeyAction };
