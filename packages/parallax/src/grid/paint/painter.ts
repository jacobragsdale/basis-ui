/* The grid's canvas painter. Only the visible rows and columns are drawn, and when a frame arrives for rows already on
 * screen only the cells whose text changed are redrawn, which keeps both the CPU and a remote-display protocol such as
 * Citrix's as idle as possible. Anything that moves the cells, such as a scroll, a new layout or new tokens, redraws
 * everything. */

import type { DevicePixels } from "#canvas/device-pixels.ts";
import { rangeOf } from "#grid/selection.ts";
import type { CellRange, CellRef } from "#grid/selection.ts";
import type { Theme } from "#theme/read.ts";

import { fillRect } from "./canvas.ts";
import { drawHeader } from "./header.ts";
import { invisible } from "./metrics.ts";
import { drawFooter, drawRows } from "./rows.ts";
import type { Area, Pass, Scene } from "./scene.ts";
import { DrawCounter } from "./stats.ts";
import type { DrawStats } from "./stats.ts";
import { TextWidths } from "./text.ts";

/** Everything a full redraw depends on, as one comparable string. */
function shapeOf(scene: Scene, at: Area): string {
  const { frame, layout, geometry } = scene;
  const versions =
    frame === null
      ? null
      : [
          frame.configVersion.toString(),
          frame.loadVersion.toString(),
          frame.totalRows,
          frame.firstColumn,
        ];
  const decor =
    layout === null
      ? null
      : [
          layout.column_widths,
          layout.sort,
          layout.group_sort,
          layout.filters,
          layout.pinned,
          scene.hoverHeader,
          scene.menuColumn,
          scene.drag,
          // The header's checkbox is drawn with the header, so a change to it draws everything again.
          scene.rowSelection?.header ?? null,
        ];
  const columns = [geometry.selectPx, geometry.treePx, geometry.contentWidth];
  return JSON.stringify([at, versions, columns, decor]);
}

/** Whether a row is in a range. */
function covered(range: CellRange | null, row: number): boolean {
  return range !== null && row >= range.top && row <= range.bottom;
}

/** What the canvas showed when it was last drawn: its selection, focus and highlighted row. */
interface Shown {
  readonly range: CellRange | null;
  readonly focus: CellRef | null;
  readonly hover: number | null;
}

const nothingShown: Shown = { focus: null, hover: null, range: null };

/** The visible rows the selection covered or now covers, which must be drawn again even if their text is the same. */
function selectionRows(
  now: Shown,
  was: Shown,
  rows: { readonly first: number; readonly count: number },
): number[] {
  const stale: number[] = [];
  for (let row = rows.first; row < rows.first + rows.count; row += 1) {
    const focused = row === now.focus?.row || row === was.focus?.row;
    if (covered(now.range, row) || covered(was.range, row) || focused) {
      stale.push(row);
    }
  }
  return stale;
}

/** The rows the pointer left and entered. */
function hoverRows(now: Shown, was: Shown): number[] {
  if (now.hover === was.hover) {
    return [];
  }
  return [now.hover, was.hover].filter((row) => row !== null);
}

/** Whether the selection moved since the canvas was drawn. */
function moved(now: Shown, was: Shown): boolean {
  return JSON.stringify([now.range, now.focus]) !== JSON.stringify([was.range, was.focus]);
}

/** The fonts of a pass: the body's, a group row's and the header's. */
function fontsOf(theme: Theme): Pass["fonts"] {
  return {
    body: theme.font,
    group: `${theme.groupFontWeight} ${theme.font}`,
    header: `${theme.headerFontWeight} ${theme.font}`,
  };
}

/** The part of a pass its scene decides. */
function scenePart(
  scene: Scene,
): Omit<
  Pass,
  | "context"
  | "drawn"
  | "drawnRows"
  | "focus"
  | "full"
  | "notes"
  | "pen"
  | "range"
  | "ratio"
  | "stale"
  | "width"
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

/** Draws a grid's canvas, remembering what it drew to redraw as little as it can. */
class GridPainter {
  /** Measured text widths, which fitting columns shares. */
  public readonly widths = new TextWidths();
  readonly #stats = new DrawCounter();
  #drawn = new Map<string, string>();
  #drawnRows = new Set<number>();
  #notes = new Map<string, string>();
  #shape = "";
  /** The tokens of the last full redraw. */
  #tokens: Theme | null = null;
  #shown: Shown = nothingShown;

  /** Drawing counters, for measurement. */
  public get stats(): DrawStats {
    return this.#stats.stats;
  }

  /** What a cell's tooltip says: its full text when drawn cut short, or the note of a flagged cell. */
  public note(key: string): string | undefined {
    return this.#notes.get(key);
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
    // A new size, as a new ratio gives, cleared the canvas.
    this.#shape = prepared.resized ? "" : this.#shape;
    const { at } = prepared;
    const area = { ...at, first: scene.rows.firstRow(scene.scrollTop, at.height) };
    this.#body(this.#begin(prepared, scene, area), area, started);
  }

  /** Draws the frame's rows and totals, if there is a frame, and counts them. */
  #body(pass: Pass, area: Area, started: number): void {
    const { frame } = pass.scene;
    if (frame !== null) {
      const cells = drawRows(pass, frame, area);
      drawFooter(pass, frame, area.height);
      this.#stats.drew(frame, { cells, started });
    }
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

  /** Starts a pass: decides whether it redraws everything, and if so clears the canvas and draws the header. */
  #begin({ context, ratio }: Prepared, scene: Scene, at: Area): Pass {
    const { selection, theme } = scene;
    const shape = shapeOf(scene, at);
    const range = selection === null ? null : rangeOf(selection);
    const focus = selection?.focus ?? null;
    const stale = this.#staleRows(scene, { focus, hover: scene.hoverRow, range }, at);
    const full = theme !== this.#tokens || shape !== this.#shape;
    this.#remember(theme, { full, shape });
    const pass = this.#pass(context, scene, {
      focus,
      full,
      range,
      ratio,
      stale,
      width: at.width,
    });
    this.#clear(pass, at);
    return pass;
  }

  /** Remembers the tokens and shape drawn; a full redraw forgets every cell drawn before. */
  #remember(
    theme: Theme,
    { full, shape }: { readonly full: boolean; readonly shape: string },
  ): void {
    this.#tokens = theme;
    this.#shape = shape;
    if (full) {
      this.#drawn = new Map();
      this.#drawnRows = new Set();
      this.#notes = new Map();
    }
  }

  /** Sets the pass's font and baseline, and for a full redraw clears the canvas and draws the header. */
  #clear(pass: Pass, at: Area): void {
    const { context, theme } = pass;
    this.widths.use(context, theme.font);
    Object.assign(context, { textBaseline: "middle" });
    if (pass.full) {
      fillRect(pass, theme.background, [0, 0, at.width, at.height]);
      drawHeader(pass);
      this.#stats.full();
    }
  }

  #pass(
    context: CanvasRenderingContext2D,
    scene: Scene,
    drawing: Pick<Pass, "focus" | "full" | "range" | "ratio" | "stale" | "width">,
  ): Pass {
    const { metrics } = scene;
    return {
      ...scenePart(scene),
      ...drawing,
      context,
      drawn: this.#drawn,
      drawnRows: this.#drawnRows,
      notes: this.#notes,
      pen: {
        context,
        padding: metrics.padding,
        ratio: drawing.ratio,
        rowPx: metrics.rowPx,
        widths: this.widths,
      },
    };
  }
}

export { GridPainter };
