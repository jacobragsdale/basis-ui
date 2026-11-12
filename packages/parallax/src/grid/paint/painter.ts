/* The grid's canvas painter. Only the visible rows and columns are drawn, and when a frame arrives for rows already on
 * screen only the cells whose text changed are redrawn, which keeps both the CPU and a remote-display protocol such as
 * Citrix's as idle as possible. A scroll by rows, or across, moves the pixels that stay and paints only what it exposed
 * (scroll.ts, passes.ts). Anything else that moves the cells, such as a new layout, new tokens, a new size or ratio, or
 * rows that arrive for a table still loading, redraws everything. */

import type { DevicePixels } from "#canvas/device-pixels.ts";
import type { FrameData } from "#frame/frame.ts";
import { rangeOf } from "#grid/selection.ts";
import type { Theme } from "#theme/read.ts";

import { invisible } from "./metrics.ts";
import { paintChanged, paintCopy, paintWhole } from "./passes.ts";
import type { Draw, Mode, Painted } from "./passes.ts";
import { Memory, hoverRows, moved, nothingShown, selectionRows, shapeOf } from "./redraw.ts";
import type { Shown } from "./redraw.ts";
import type { Area, Pass, Scene } from "./scene.ts";
import { columnEdges, scrollCopy } from "./scroll.ts";
import type { Board, Copy, Place } from "./scroll.ts";
import { DrawCounter } from "./stats.ts";
import type { DrawStats } from "./stats.ts";
import { TextWidths } from "./text.ts";

/** The fonts of a pass: the body's, a group row's and the header's. */
function fontsOf(theme: Theme): Pass["fonts"] {
  return {
    body: theme.font,
    group: `${theme.groupFontWeight} ${theme.font}`,
    header: `${theme.headerFontWeight} ${theme.font}`,
  };
}

/** What a draw decides before it draws: the selection, focus and stale rows, the body's bottom, the ratio and width. */
type Drawing = Pick<
  Pass,
  "bodyBottom" | "focus" | "range" | "ratio" | "sameFrame" | "stale" | "width"
>;

/** The part of a pass its scene decides. */
function scenePart(
  scene: Scene,
): Omit<
  Pass,
  | keyof Drawing
  | keyof Mode
  | "chosenRows"
  | "context"
  | "drawn"
  | "drawnRows"
  | "notes"
  | "pen"
  | "titles"
> {
  const { theme, metrics, hoverRow } = scene;
  return {
    ...scene.searched,
    detail: scene.layout?.detail ?? false,
    fonts: fontsOf(theme),
    geometry: scene.geometry,
    hover:
      hoverRow === null || invisible(theme.rowHover)
        ? null
        : { color: theme.rowHover, row: hoverRow },
    metrics,
    rowRule: invisible(theme.rowBorder) ? null : theme.rowBorder,
    scene,
    scrollLeft: scene.scrollLeft,
    theme,
  };
}

/** A canvas ready to draw on: its context, the device pixels of one CSS pixel, the area it covers, and whether it
 * was resized, which cleared it. */
interface Prepared {
  readonly context: CanvasRenderingContext2D;
  readonly ratio: number;
  readonly at: Area;
  readonly resized: boolean;
}

/** Sizes the canvas to fill the scene's area in whole device pixels, and gives its context their scale. Drawing fills
 * the canvas, which is the area or a fraction of a pixel less. */
function prepare(device: DevicePixels, scene: Scene): Prepared | null {
  const context = device.canvas.getContext("2d", { alpha: false });
  if (context === null) {
    return null;
  }
  const { ratio, resized, cssWidth, cssHeight } = device.fit(
    Math.max(1, scene.width),
    Math.max(1, scene.height),
  );
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const at = { first: 0, height: cssHeight, scrollLeft: scene.scrollLeft, width: cssWidth };
  return { at, context, ratio, resized };
}

/** Where the body's rows end: above the totals row, if the frame has totals, or at the bottom. */
function bodyBottomOf(scene: Scene, height: number): number {
  const totals = scene.frame?.totals ?? null;
  return totals === null ? height : height - scene.metrics.rowPx;
}

/** The canvas as a scroll moves it, in device pixels. */
function boardOf({ context, ratio }: Prepared, scene: Scene, bodyBottom: number): Board {
  const { canvas } = context;
  const { metrics, geometry } = scene;
  return {
    bodyBottom: Math.round(bodyBottom * ratio),
    bodyTop: Math.round(metrics.headerPx * ratio),
    frozen: Math.round(geometry.frozenPx * ratio),
    height: canvas.height,
    edges: columnEdges(geometry, { ratio, scrollLeft: scene.scrollLeft, width: scene.width }),
    pinnedEdge: geometry.pinned > 0,
    ratio,
    rowPx: metrics.rowPx,
    width: canvas.width,
  };
}

/** How a draw draws: everything, the cells that changed, or a scroll's copy and what it exposed. */
type Plan =
  | { readonly kind: "full" }
  | { readonly kind: "partial" }
  | { readonly kind: "copy"; readonly copy: Copy; readonly frame: FrameData };

/** Draws a grid's canvas, remembering what it drew to redraw as little as it can. */
class GridPainter {
  /** Measured text widths, which fitting columns shares. */
  public readonly widths = new TextWidths();
  readonly #stats = new DrawCounter();
  readonly #memory = new Memory();
  #shape = "";
  /** The tokens of the last full redraw. */
  #tokens: Theme | null = null;
  #shown: Shown = nothingShown;
  /** Where the view was when the canvas was last drawn. */
  #place: Place | null = null;
  /** The canvas a scroll's pixels are copied through, made at the first scroll that copies. */
  #scratch: HTMLCanvasElement | null = null;

  /** Drawing counters, for measurement. */
  public get stats(): DrawStats {
    return this.#stats.stats;
  }

  /** What a cell's tooltip says: its full text when drawn cut short, or the note of a flagged cell. */
  public note(key: string): string | undefined {
    return this.#memory.notes.get(key);
  }

  /** Records when the view began opening, so the first rows drawn after it are timed. */
  public opening(atMs: number): void {
    this.#stats.opening(atMs);
  }

  /** Draws `scene` on the canvas that `device` keeps in whole device pixels. */
  public draw(device: DevicePixels, scene: Scene): void {
    const started = performance.now();
    const prepared = prepare(device, scene);
    if (prepared === null) {
      return;
    }
    const area = {
      ...prepared.at,
      first: scene.rows.firstRow(scene.scrollTop, prepared.at.height),
    };
    const drawing = this.#drawing(prepared, scene, area);
    const plan = this.#plan(prepared, scene, { area, bodyBottom: drawing.bodyBottom });
    const painted = this.#paint(plan, this.#draw(prepared, { area, drawing, scene }));
    if (scene.frame !== null) {
      this.#stats.drew(scene.frame, { ...painted, started });
    }
  }

  /** Draws as `plan` says, counting it. */
  #paint(plan: Plan, draw: Draw): Painted {
    this.#stats.began(plan.kind);
    this.widths.use(draw.context, draw.scene.theme.font);
    Object.assign(draw.context, { textBaseline: "middle" });
    if (plan.kind === "copy") {
      return paintCopy(draw, plan);
    }
    return plan.kind === "full" ? paintWhole(draw) : paintChanged(draw);
  }

  /** One draw: its scene and area, and how it makes a pass in a mode. */
  #draw(
    { context, ratio }: Prepared,
    { scene, area, drawing }: { scene: Scene; area: Area; drawing: Drawing },
  ): Draw {
    return {
      area,
      context,
      memory: this.#memory,
      pass: (mode) => this.#pass(context, scene, { ...drawing, ...mode }),
      ratio,
      scene,
      scratch: () => {
        this.#scratch ??= context.canvas.ownerDocument.createElement("canvas");
        return this.#scratch;
      },
    };
  }

  /** What every pass of a draw shares: the selection, the rows to draw again, and where the body ends. */
  #drawing({ ratio }: Prepared, scene: Scene, at: Area): Drawing {
    const { selection } = scene;
    const range = selection === null ? null : rangeOf(selection);
    const focus = selection?.focus ?? null;
    const stale = this.#staleRows(scene, { focus, hover: scene.hoverRow, range }, at);
    const sameFrame = this.#memory.drawingWith(scene);
    return {
      bodyBottom: bodyBottomOf(scene, at.height),
      focus,
      range,
      ratio,
      sameFrame,
      stale,
      width: at.width,
    };
  }

  /** Decides how the draw draws: everything, if what a full redraw depends on changed or a scroll cannot be copied. */
  #plan(
    prepared: Prepared,
    scene: Scene,
    { area, bodyBottom }: { readonly area: Area; readonly bodyBottom: number },
  ): Plan {
    const shape = shapeOf(scene, area, prepared.ratio);
    // A new size, as a new ratio gives, cleared the canvas.
    const full = prepared.resized || scene.theme !== this.#tokens || shape !== this.#shape;
    const was = this.#remember(scene.theme, { area, shape });
    const { frame } = scene;
    if (full || was === null || frame === null) {
      return { kind: "full" };
    }
    const copy = scrollCopy(was, area, boardOf(prepared, scene, bodyBottom));
    if (copy === "paint") {
      return { kind: "full" };
    }
    return copy === "still" ? { kind: "partial" } : { copy, frame, kind: "copy" };
  }

  /** Remembers the tokens, shape and place of this draw; returns the place of the one before. */
  #remember(
    theme: Theme,
    { area, shape }: { readonly area: Area; readonly shape: string },
  ): Place | null {
    const was = this.#place;
    this.#tokens = theme;
    this.#shape = shape;
    this.#place = { first: area.first, scrollLeft: area.scrollLeft };
    return was;
  }

  /**
   * The rows to draw again although their text is unchanged: those the selection covered or now covers, and the row
   * the pointer left and the row it entered.
   */
  #staleRows(scene: Scene, now: Shown, at: Area): Set<number> {
    const was = this.#shown;
    this.#shown = now;
    const count = Math.ceil(at.height / scene.metrics.rowPx);
    const selected = moved(now, was) ? selectionRows(now, was, { count, first: at.first }) : [];
    return new Set([...selected, ...hoverRows(now, was)]);
  }

  #pass(context: CanvasRenderingContext2D, scene: Scene, drawing: Drawing & Mode): Pass {
    const { metrics } = scene;
    const memory = this.#memory;
    return {
      ...scenePart(scene),
      ...drawing,
      context,
      drawn: memory.drawn,
      chosenRows: memory.chosenRows,
      drawnRows: memory.drawnRows,
      notes: memory.notes,
      pen: {
        context,
        padding: metrics.padding,
        ratio: drawing.ratio,
        rowPx: metrics.rowPx,
        widths: this.widths,
      },
      titles: memory.titles,
    };
  }
}

export { GridPainter };
