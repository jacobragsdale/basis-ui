/* The passes of one draw of the grid's canvas: a full redraw, which clears it and draws everything; a draw of what
 * changed, the cells whose text or rows changed; and a scroll's, which moves the pixels that stay (scroll.ts), draws
 * what changed beside what the scroll exposed, and paints what it exposed under a clip to it. Each then draws the
 * header again if a column now has another title, and the totals row if its totals changed. */

import type { FrameData } from "#frame/frame.ts";
import { scrolledColumns, selectColumn } from "#grid/geometry.ts";

import { fillRect, withClip } from "./canvas.ts";
import { Tally, boxOf, exposedBox } from "./damage.ts";
import type { Box, Exposed } from "./damage.ts";
import { drawHeader, titleOf } from "./header.ts";
import { headerShapeOf } from "./redraw.ts";
import type { InView, Memory } from "./redraw.ts";
import { drawFooter, drawRows } from "./rows.ts";
import type { Area, Pass, Scene } from "./scene.ts";
import { blit } from "./scroll.ts";
import { drawState } from "./states.ts";
import type { Copy } from "./scroll.ts";

/** How one of a draw's passes draws: whether it redraws everything it draws over, the exposed rows or columns it paints
 * alone or leaves to another pass, and what counts its pixels. */
type Mode = Pick<Pass, "besides" | "full" | "only" | "tally">;

/** One draw: its scene and area, what the painter remembers, and how it makes a pass in a mode. */
interface Draw {
  readonly scene: Scene;
  readonly area: Area;
  readonly ratio: number;
  readonly context: CanvasRenderingContext2D;
  readonly memory: Memory;
  readonly pass: (mode: Mode) => Pass;
  /** The painter's own canvas that a scroll's pixels are copied through. */
  readonly scratch: () => HTMLCanvasElement;
}

/** What a draw drew: its cells, and the device pixels it repainted. */
interface Painted {
  readonly cells: number;
  readonly painted: number;
}

/** The rows and columns in view at `at`. */
function inView(scene: Scene, at: Area): InView {
  const { geometry, metrics } = scene;
  const pinned = Array.from({ length: geometry.pinned }, (_entry, index) => index);
  const scrolled = scrolledColumns(geometry, at.scrollLeft, at.width);
  return {
    columns: new Set([selectColumn, -1, ...pinned, ...scrolled]),
    count: Math.ceil((at.height - metrics.headerPx) / metrics.rowPx),
    first: at.first,
  };
}

/** A pass that draws whatever it draws over, as a full redraw does, with nothing exposed. */
function wholeMode(draw: Draw): Mode {
  return {
    besides: null,
    full: true,
    only: null,
    tally: new Tally({ cells: false, exposed: null, ratio: draw.ratio }),
  };
}

/** Whether a column in view now has another title than its header was drawn with. */
function retitled(draw: Draw, pass: Pass): boolean {
  const { titles } = draw.memory;
  return [...inView(draw.scene, draw.area).columns].some(
    (column) => column >= 0 && titles.get(column) !== titleOf(pass, column),
  );
}

/** Draws the header again, counting its pixels, if a column in view now has another title, or the header shows another
 * part of the pointer: a full redraw has drawn it. */
function redrawHeader(
  draw: Draw,
  { pass, whole }: { readonly pass: Pass; readonly whole: Pass },
): void {
  const header = headerShapeOf(draw.scene);
  const pointed = header !== draw.memory.header;
  draw.memory.header = header;
  if (!pass.full && (pointed || retitled(draw, pass))) {
    drawHeader(whole);
    pass.tally.area(boxOf([0, 0, draw.area.width, pass.metrics.headerPx], draw.ratio));
  }
}

/** Draws the header again if a column in view now has another title, as when the frame that holds it arrives, and the
 * totals row if its totals changed, counting their pixels; a full redraw has drawn the header, and draws the totals. */
function drawEdges(draw: Draw, pass: Pass): void {
  const { area, memory, ratio } = draw;
  const { frame } = draw.scene;
  const whole = draw.pass(wholeMode(draw));
  redrawHeader(draw, { pass, whole });
  const totals = frame?.totals ?? null;
  if (frame !== null && totals !== null && (pass.full || totals !== memory.totals)) {
    drawFooter(whole, frame, area.height);
    const footer = [0, pass.bodyBottom, area.width, area.height - pass.bodyBottom] as const;
    pass.tally.area(boxOf(footer, ratio));
  }
  memory.totals = totals;
}

/** Clears the canvas and draws everything. */
function paintWhole(draw: Draw): Painted {
  const { area, context, scene } = draw;
  draw.memory.clear();
  const pass = draw.pass(wholeMode(draw));
  fillRect(pass, scene.theme.background, [0, 0, area.width, area.height]);
  drawHeader(pass);
  const cells = scene.frame === null ? 0 : drawRows(pass, scene.frame, area);
  drawState(pass, area.height);
  drawEdges(draw, pass);
  return { cells, painted: context.canvas.width * context.canvas.height };
}

/** Draws the cells whose text or rows changed. */
function paintChanged(draw: Draw): Painted {
  const { area, scene, ratio } = draw;
  const tally = new Tally({ cells: true, exposed: null, ratio });
  const pass = draw.pass({ besides: null, full: false, only: null, tally });
  const cells = scene.frame === null ? 0 : drawRows(pass, scene.frame, area);
  drawEdges(draw, pass);
  return { cells, painted: tally.px };
}

/** The box, in device pixels, of what a scroll exposed on the canvas. */
function exposedBoxOf(draw: Draw, exposed: Exposed): Box {
  const { canvas } = draw.context;
  return exposedBox(exposed, [canvas.width, canvas.height]);
}

/** The clip, in CSS pixels, of what a scroll exposed on the canvas. */
function exposedClip(draw: Draw, exposed: Exposed): readonly [number, number, number, number] {
  const [left, top, right, bottom] = exposedBoxOf(draw, exposed);
  const css = (edge: number): number => edge / draw.ratio;
  return [css(left), css(top), css(right - left), css(bottom - top)];
}

/** Paints what a scroll exposed, under a clip to it: its background, the rows or columns that meet it, and for a strip
 * of columns, their header and totals, with the totals the frame has; if they changed, the whole row is drawn after.
 * Returns the cells drawn. */
function paintExposed(
  draw: Draw,
  { exposed, frame }: { exposed: Exposed; frame: FrameData },
): number {
  const { scene, area } = draw;
  const pass = draw.pass({ ...wholeMode(draw), only: exposed });
  const clip = exposedClip(draw, exposed);
  return withClip(pass, clip, () => {
    fillRect(pass, scene.theme.background, clip);
    if (exposed.axis === "columns") {
      drawHeader(pass);
    }
    const cells = drawRows(pass, frame, area);
    if (exposed.axis === "columns") {
      drawFooter(pass, frame, area.height);
    }
    return cells;
  });
}

/** Moves a scroll's pixels, forgets what left the view, draws the cells that changed beside what the scroll exposed,
 * and paints what it exposed. */
function paintCopy(draw: Draw, { copy, frame }: { copy: Copy; frame: FrameData }): Painted {
  const { area, context, scene, ratio } = draw;
  if (!blit(context, { copy, scratch: draw.scratch() })) {
    return paintWhole(draw);
  }
  draw.memory.keepOnly(inView(scene, area));
  const tally = new Tally({ cells: true, exposed: exposedBoxOf(draw, copy.exposed), ratio });
  const beside = draw.pass({ besides: copy.exposed, full: false, only: null, tally });
  const cells =
    drawRows(beside, frame, area) + paintExposed(draw, { exposed: copy.exposed, frame });
  tally.area(exposedBoxOf(draw, copy.exposed));
  drawEdges(draw, beside);
  return { cells, painted: tally.px };
}

export { paintChanged, paintCopy, paintWhole };
export type { Draw, Mode, Painted };
