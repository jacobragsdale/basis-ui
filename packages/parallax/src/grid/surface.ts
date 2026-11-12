/* A grid's canvas and the elements around it, once React has rendered them: the listeners for scrolling, the wheel,
 * the pointer, the keyboard and the clipboard, the scroll's extent and the body's height, what the canvas draws, and
 * the focused cell as screen readers read it. */

import { DevicePixels } from "#canvas/device-pixels.ts";
import type { FrameData } from "#frame/frame.ts";

import { Copier } from "./copy.ts";
import { GridDom } from "./dom.ts";
import type { GridParts } from "./dom.ts";
import { rowGeometry, screenX } from "./geometry.ts";
import type { GridHost } from "./host.ts";
import { KeyInput } from "./keys.ts";
import type { Metrics } from "./paint/metrics.ts";
import type { GridPainter } from "./paint/painter.ts";
import { PointerInput } from "./pointer.ts";
import type { CellRef, Selection } from "./selection.ts";
import { wheelTop } from "./wheel.ts";
import { searchIn } from "./window.ts";
import { observeNextFrame } from "./next-frame-resize.ts";
import { trackGrid } from "#tools/grid-stats.ts";
import type { DrawStats } from "./paint/stats.ts";

/** How tall a horizontal scrollbar is until one shows and is measured: the widest a browser draws. */
const widestScrollbar = 14;
/** The room an auto-height grid keeps below its rows when no horizontal scrollbar shows. */
const scrollbarSlack = 2;

/** Listens for `type` on `target`; returns a function that stops. */
function on<TType extends keyof HTMLElementEventMap>(
  target: HTMLElement,
  type: TType,
  listener: (event: HTMLElementEventMap[TType]) => void,
): () => void {
  target.addEventListener(type, listener);
  return () => {
    target.removeEventListener(type, listener);
  };
}

/** Listens for the wheel on `target` with a listener that may cancel it, which a notch's rows need to replace the
 * browser's own scroll; returns a function that stops. */
function onWheel(target: HTMLElement, listener: (event: WheelEvent) => void): () => void {
  target.addEventListener("wheel", listener, { passive: false });
  return () => {
    target.removeEventListener("wheel", listener);
  };
}

/** A grid's canvas and the elements around it. */

class GridSurface {
  public readonly dom: GridDom;
  public readonly context: CanvasRenderingContext2D | null;
  readonly #host: GridHost;
  readonly #pointer: PointerInput;
  readonly #keys: KeyInput;
  readonly #copier: Copier;
  #scrollbarPx = widestScrollbar;
  /** Keeps the canvas in whole device pixels while the surface listens. */
  #device: DevicePixels | null = null;
  /** The search of each layout version, read once. */
  #search: { readonly version: bigint; readonly search: string } | null = null;

  public constructor(
    parts: GridParts,
    {
      host,
      groupPanel,
    }: { readonly host: GridHost; readonly groupPanel: () => HTMLElement | null },
  ) {
    this.dom = new GridDom(parts);
    // The canvas draws opaque, which lets text draw as crisply as the browser can.
    this.context = parts.canvas.getContext("2d", { alpha: false });
    this.#host = host;
    this.#pointer = new PointerInput(host, groupPanel);
    this.#keys = new KeyInput(host);
    this.#copier = new Copier(host);
  }

  /** Listens to the elements, calling `changed` after a scroll or a resize, and gives the performance overlay the
   * grid's counters; returns a function that stops. */
  public listen(changed: () => void, counted: { readonly drawStats: DrawStats }): () => void {
    const { scroll, canvas } = this.dom.parts;
    const pointer = this.#pointer;
    const scrolled = (): void => {
      this.#measure();
      pointer.hoverAt();
      changed();
    };
    const stopObserving = observeNextFrame(scroll, scrolled);
    // The canvas's box in device pixels, or the ratio, changed: it is sized and drawn again.
    const device = new DevicePixels(canvas, changed);
    this.#device = device;
    const stops = [
      on(scroll, "scroll", scrolled),
      onWheel(scroll, this.#wheel),
      on(scroll, "keydown", this.#keys.down),
      on(scroll, "copy", this.#copier.copy),
      on(canvas, "pointerdown", pointer.down),
      on(canvas, "pointermove", pointer.move),
      on(canvas, "pointerup", pointer.up),
      on(canvas, "pointerleave", pointer.leave),
      on(canvas, "pointercancel", pointer.cancel),
      on(canvas, "lostpointercapture", pointer.cancel),
      on(canvas, "dblclick", pointer.doubleClick),
      trackGrid(scroll, () => counted.drawStats),
    ];
    this.#measure();
    return () => {
      stopObserving();
      device.dispose();
      this.#device = null;
      pointer.clearTooltip();
      for (const stop of stops) {
        stop();
      }
    };
  }

  /** When the rows shrink to end at or above the first row in view, as after a search, shows them from the top; the
   * engine answers such a change from row 0, so the rows are already here. */
  public rowsChanged(before: number): void {
    const { model } = this.#host;
    const { metrics, area } = model;
    const rows = model.totalRows;
    if (metrics === null || rows >= before) {
      return;
    }
    const first = rowGeometry(before, metrics).firstRow(area.scrollTop, area.height);
    if (rows <= first) {
      this.dom.parts.scroll.scrollTop = 0;
      model.area = { ...area, scrollTop: 0 };
    }
  }

  /** Sizes the scroll's extent, an auto-height grid's body and the pinned columns' shadow. */
  public layoutElements(metrics: Metrics, maxHeight: number | null): void {
    const { geometry, area } = this.#host.model;
    this.dom.extent(geometry.contentWidth, this.#host.model.rows(metrics).spacerPx);
    this.dom.pinnedEdge(geometry.pinned > 0 && area.scrollLeft > 0 ? geometry.frozenPx : null);
    this.dom.bodyHeight(maxHeight === null ? null : this.#autoHeight(metrics, maxHeight));
  }

  /** An auto-height grid's body height: the header, every row and the totals, up to `maxHeight`. */
  #autoHeight(metrics: Metrics, maxHeight: number): number {
    const { model } = this.#host;
    // Room for a horizontal scrollbar, so it never covers the last row.
    const scrollbar =
      model.geometry.contentWidth > model.area.width ? this.#scrollbarPx : scrollbarSlack;
    const content = (model.totalRows + (model.footer ? 1 : 0)) * metrics.rowPx + metrics.headerPx;
    return Math.min(maxHeight, content + scrollbar);
  }

  /** Draws the canvas as the model now says. */
  public draw(painter: GridPainter): void {
    const { model } = this.#host;
    const { metrics, theme, frame, area, interaction } = model;
    const device = this.#device;
    if (metrics === null || theme === null || device === null) {
      return;
    }
    painter.draw(device, {
      ...area,
      drag: interaction.drag,
      frame,
      geometry: model.geometry,
      hoverHeader: interaction.hoverHeader,
      hoverRow: interaction.hoverRow,
      layout: model.layout,
      look: (column) => model.look(column),
      menuColumn: interaction.menu?.column ?? null,
      metrics,
      rows: model.rows(metrics),
      searched: model.searched(frame === null ? "" : this.#searchOf(frame)),
      rowSelection:
        model.choice.select === null
          ? null
          : {
              header: model.choice.header,
              selectable: (row): boolean => model.choice.keyAt(model.frame, row) !== null,
              selected: (row): boolean => model.choice.chosen(model.frame, row),
            },
      selection: interaction.selection,
      sortMark: (column) => model.sortMark(column),
      theme,
    });
  }

  /** Scrolls so that `cell` is in view. */
  public reveal(cell: CellRef): void {
    const { metrics, geometry } = this.#host.model;
    if (metrics !== null) {
      this.#revealRow(cell.row, metrics);
    }
    if (cell.column >= geometry.pinned) {
      this.#revealColumn(cell.column);
    }
  }

  #revealRow(row: number, metrics: Metrics): void {
    const { model } = this.#host;
    const { scroll } = this.dom.parts;
    const rows = model.rows(metrics);
    // The rows that show whole between the header and the totals row, which covers the body's last row.
    const visibleRows = Math.max(
      1,
      Math.floor((scroll.clientHeight - metrics.headerPx) / metrics.rowPx) - (model.footer ? 1 : 0),
    );
    const first = rows.firstRow(model.area.scrollTop, model.area.height);
    if (row < first) {
      scroll.scrollTop = rows.scrollTopFor(row, scroll.clientHeight);
    } else if (row >= first + visibleRows) {
      scroll.scrollTop = rows.scrollTopFor(row - visibleRows + 1, scroll.clientHeight);
    }
  }

  /** Moves a notch of the wheel's rows at once, by setting the scroll to the row they reach, which draws once. At
   * either end, where the rows cannot move, the event is the browser's, which scrolls the page instead. */
  readonly #wheel = (event: WheelEvent): void => {
    const { model } = this.#host;
    const { metrics } = model;
    const { scroll } = this.dom.parts;
    const body = metrics === null ? null : { metrics, rows: model.rows(metrics), scroll };
    const top = body === null ? null : wheelTop(event, { ...body, totalRows: model.totalRows });
    if (top !== null) {
      event.preventDefault();
      scroll.scrollTop = top;
    }
  };

  /** Replaces the selection, drawing it and saying it to screen readers. */
  public select(selection: Selection | null): void {
    this.#host.model.interaction.selection = selection;
    this.#host.publish();
    this.#host.redraw();
  }

  /** Opens data column `column`'s menu below its header: a column's, or a pivot measure's. */
  public openMenu(column: number): void {
    const { model } = this.#host;
    const menu = { column, measure: model.menuMeasure(column), name: model.menuColumn(column) };
    const { metrics, geometry } = model;
    if ((menu.name === null && menu.measure === null) || metrics === null) {
      return;
    }
    this.#pointer.clearTooltip();
    const left = screenX(geometry, column, model.area.scrollLeft);
    this.dom.menuAnchor({ height: metrics.headerPx, left, top: 0, width: geometry.width(column) });
    model.interaction.menu = { ...menu, name: menu.name ?? "" };
  }

  /** Reads the visible area's size and scroll, and a horizontal scrollbar's height once one shows. */
  #measure(): void {
    const { scroll } = this.dom.parts;
    const scrollbar = scroll.offsetHeight - scroll.clientHeight;
    if (scrollbar > 0) {
      this.#scrollbarPx = scrollbar;
    }
    this.#host.model.area = {
      height: scroll.clientHeight,
      scrollLeft: scroll.scrollLeft,
      scrollTop: scroll.scrollTop,
      width: scroll.clientWidth,
    };
  }

  #revealColumn(column: number): void {
    const { geometry, area } = this.#host.model;
    const { scroll } = this.dom.parts;
    const x = geometry.x(column) - area.scrollLeft;
    if (x < geometry.frozenPx) {
      scroll.scrollLeft = geometry.x(column) - geometry.frozenPx;
    } else if (x + geometry.width(column) > scroll.clientWidth) {
      scroll.scrollLeft = geometry.x(column) + geometry.width(column) - scroll.clientWidth;
    }
  }

  /** The search of the layout that `frame` answers, which is what its rows matched; empty without one. */
  #searchOf(frame: FrameData): string {
    if (this.#search?.version === frame.configVersion) {
      return this.#search.search;
    }
    const json = this.#host.handle()?.layoutAt(frame.configVersion);
    if (json === undefined) {
      return "";
    }
    const search = searchIn(json);
    this.#search = { search, version: frame.configVersion };
    return search;
  }
}

export { GridSurface };
