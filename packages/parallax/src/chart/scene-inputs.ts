/* What a chart's scene draws from, and the checks that keep a frame of another shape off the screen. */

import type { ViewHandle } from "#engine/view.ts";
import { drawableKinds } from "#layout/chart.ts";
import type { LayoutChart } from "#layout/chart.ts";
import { checkLayout } from "#layout/layout.ts";
import type { Layout } from "#layout/layout.ts";

import { shapeOf } from "./source.ts";

/** A plot's size in CSS pixels. */
interface PlotSize {
  readonly width: number;
  readonly height: number;
}

/** The group a chart's crosshair moves with: `sync` when given, null for none; by default charts of the same dataset,
 * x column and axis, among the kinds drawn along an x axis. */
function groupOf(layout: Layout | null, sync: string | null | undefined): string | null {
  if (sync !== undefined) {
    return sync;
  }
  const chart = layout?.chart ?? null;
  if (layout === null || chart === null || chart.x === "" || !drawableKinds.includes(chart.kind)) {
    return null;
  }
  return JSON.stringify([layout.dataset, chart.x, chart.axis]);
}

/** Whether a chart takes drawings: the kinds the engine reduces along an x axis over a price. */
function isDrawable(chart: LayoutChart | null): boolean {
  return chart !== null && drawableKinds.includes(chart.kind);
}

/** Whether a chart shows its drawing tools and lets the pointer edit drawings: one that takes drawings, unless its
 * layout turns them off. */
function hasDrawingTools(chart: LayoutChart | null): boolean {
  return isDrawable(chart) && chart?.drawing_tools !== false;
}

/** The shape of the layout a view sent at each configuration version, read back from the view, the last one kept. */
class FrameShapes {
  #json = "";
  #shape: string | null = null;

  /** The shape of the layout `handle` sent at `configVersion`, or null if the view no longer remembers it. */
  public shapeAt(handle: ViewHandle | null, configVersion: bigint): string | null {
    const json = handle?.layoutAt(configVersion);
    if (json === undefined) {
      return null;
    }
    if (json !== this.#json) {
      const parsed: unknown = JSON.parse(json);
      const checked = checkLayout(parsed);
      this.#json = json;
      this.#shape = checked.ok ? shapeOf(checked.layout) : null;
    }
    return this.#shape;
  }
}

/** Whether a frame of `configVersion` was built for a layout of `shape`, so it can be drawn as the chart is now; a
 * frame whose layout the view has forgotten is older than any it remembers, and is not. */
function fitsShape(
  shapes: FrameShapes,
  frame: { readonly handle: ViewHandle | null; readonly configVersion: bigint },
  shape: string | null,
): boolean {
  return shape !== null && shapes.shapeAt(frame.handle, frame.configVersion) === shape;
}

export { FrameShapes, fitsShape, groupOf, hasDrawingTools, isDrawable };
export type { PlotSize };
