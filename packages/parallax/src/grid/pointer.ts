/* The pointer on a grid's canvas: a press selects a cell, a drag selects a range, a header click sorts, a header's
 * edge resizes its column and a double click on it fits the column, a header dragged elsewhere moves its column or,
 * dropped on the group panel, groups by it, a checkbox checks its row, or with Shift every row from the last one
 * checked, the header's checkbox checks every row, and a cell cut short shows its full text after a moment. */

import { sortedBy, withWidth } from "./changes.ts";
import { minWidth, selectColumn } from "./geometry.ts";
import { HeaderDragger } from "./header-drag.ts";
import type { Pressed } from "./header-drag.ts";
import { onMarker } from "./hit.ts";
import type { Hit } from "./hit.ts";
import type { GridHost } from "./host.ts";
import { invisible } from "./paint/metrics.ts";
import { Tooltips } from "./tooltips.ts";

/** The cursor over what the pointer hit. */
function cursorFor(hit: Hit): string {
  if (hit.edge !== null) {
    return "col-resize";
  }
  return (hit.header && hit.column !== null) || hit.column === selectColumn ? "pointer" : "default";
}

/** Handles the pointer on a grid's canvas. */
class PointerInput {
  readonly #host: GridHost;
  #pressed: Pressed | null = null;
  #selecting = false;
  readonly #tooltips: Tooltips;
  readonly #headers: HeaderDragger;

  public constructor(host: GridHost, groupPanel: () => HTMLElement | null) {
    this.#host = host;
    this.#tooltips = new Tooltips(host);
    this.#headers = new HeaderDragger(host, { groupPanel, tooltips: this.#tooltips });
  }

  public readonly down = (event: PointerEvent): void => {
    const hit = this.#host.hit(event.offsetX, event.offsetY);
    if (event.button !== 0 || hit === null) {
      return;
    }
    this.clearTooltip();
    if (hit.column === selectColumn) {
      this.#check(hit, event);
    } else if (hit.header) {
      this.#press(hit, event);
    } else if (hit.row !== null && hit.column !== null) {
      this.#selectFrom({ column: hit.column, row: hit.row }, event);
    }
  };

  public readonly move = (event: PointerEvent): void => {
    const pressed = this.#pressed;
    if (pressed !== null && pressed.hit.edge !== null) {
      this.#resize(pressed, event);
      return;
    }
    if (pressed !== null && this.#headers.follow(pressed, event)) {
      return;
    }
    const hit = this.#host.hit(event.offsetX, event.offsetY);
    if (hit !== null && !this.#extend(hit)) {
      this.#hover(hit, event);
    }
  };

  public readonly up = (event: PointerEvent): void => {
    const pressed = this.#pressed;
    this.#pressed = null;
    this.#selecting = false;
    if (pressed === null) {
      return;
    }
    if (pressed.hit.edge !== null) {
      this.#commitWidth();
    } else if (this.#host.model.interaction.drag === null) {
      this.#click(pressed, event);
    } else {
      this.#headers.drop();
    }
  };

  public readonly leave = (): void => {
    const { interaction } = this.#host.model;
    this.clearTooltip();
    interaction.hoverHeader = null;
    interaction.pointerAt = null;
    interaction.hoverRow = null;
    if (this.#pressed === null) {
      this.#host.dom.cursor("default");
    }
    this.#host.redraw();
  };

  /** Ends a drag that the browser cancelled, as when the window loses focus. */
  public readonly cancel = (): void => {
    const { model } = this.#host;
    const dragging = model.interaction.drag !== null || model.liveWidth !== null;
    this.#pressed = null;
    this.#selecting = false;
    if (dragging) {
      Object.assign(model.interaction, { drag: null, overPanel: false });
      model.liveWidth = null;
      this.#host.publish();
      this.#host.redraw();
    }
  };

  public readonly doubleClick = (event: MouseEvent): void => {
    const host = this.#host;
    const hit = host.hit(event.offsetX, event.offsetY);
    if (hit === null) {
      return;
    }
    if (hit.header && hit.edge !== null) {
      const { edge } = hit;
      host.change((layout) => withWidth(layout, host.model.widthKey(edge), host.fitWidth(edge)));
    } else if (
      !hit.header &&
      hit.row !== null &&
      hit.column !== null &&
      hit.column !== selectColumn
    ) {
      this.#doubleClickCell({ column: hit.column, row: hit.row }, event.offsetX);
    }
  };

  /** Highlights the row at the pointer, or none, if the theme highlights rows under the pointer. */
  public hoverAt(): void {
    const { model } = this.#host;
    const { pointerAt } = model.interaction;
    if (model.theme === null || invisible(model.theme.rowHover)) {
      return;
    }
    model.interaction.hoverRow =
      pointerAt === null ? null : (this.#host.hit(pointerAt.x, pointerAt.y)?.row ?? null);
  }

  public clearTooltip(): void {
    this.#tooltips.clear();
  }

  /** A press on the checkbox column: the header's checks every row, a row's checks that row. */
  #check(hit: Hit, event: PointerEvent): void {
    this.#host.dom.parts.scroll.focus({ preventScroll: true });
    if (hit.header) {
      this.#host.checkAll();
    } else if (hit.row !== null) {
      this.#host.checkRow(hit.row, event.shiftKey);
    }
  }

  #press(hit: Hit, event: PointerEvent): void {
    const { model, dom } = this.#host;
    const key = hit.edge === null ? "" : model.widthKey(hit.edge);
    const startWidth = hit.edge === null ? 0 : model.widthOf(hit.edge);
    this.#pressed = { hit, key, startWidth, x: event.clientX };
    // A resize, or a header dragged to another place, follows the pointer off the canvas.
    dom.parts.canvas.setPointerCapture(event.pointerId);
  }

  #selectFrom(cell: { readonly row: number; readonly column: number }, event: PointerEvent): void {
    const { model, dom } = this.#host;
    dom.parts.scroll.focus({ preventScroll: true });
    const previous = model.interaction.selection;
    this.#host.select(
      event.shiftKey && previous !== null
        ? { anchor: previous.anchor, focus: cell }
        : { anchor: cell, focus: cell },
    );
    this.#selecting = true;
    dom.parts.canvas.setPointerCapture(event.pointerId);
    if (cell.column === -1 && !event.shiftKey && this.#onMarker(cell.row, event.offsetX)) {
      this.#host.toggleRow(cell.row);
    }
  }

  #resize(pressed: Pressed, event: PointerEvent): void {
    const width = Math.round(pressed.startWidth + event.clientX - pressed.x);
    this.#host.model.liveWidth = { key: pressed.key, width: Math.max(minWidth, width) };
    this.#host.redraw();
  }

  /** Extends the selection to the cell under the pointer while a press selects. Returns whether it did. */
  #extend(hit: Hit): boolean {
    const { selection } = this.#host.model.interaction;
    if (!this.#selecting || hit.row === null || hit.column === null) {
      return false;
    }
    // A drag over the checkboxes selects to the first column, as a drag past the left edge does.
    const first = this.#host.model.extent.tree ? -1 : 0;
    const column = Math.max(hit.column, first);
    if (selection !== null) {
      this.#host.select({ anchor: selection.anchor, focus: { column, row: hit.row } });
    }
    return true;
  }

  #hover(hit: Hit, event: PointerEvent): void {
    const { interaction } = this.#host.model;
    const was = [interaction.hoverHeader, interaction.hoverRow];
    this.#host.dom.cursor(cursorFor(hit));
    interaction.hoverHeader = hit.header ? hit.column : null;
    interaction.pointerAt = { x: event.offsetX, y: event.offsetY };
    this.hoverAt();
    this.#tooltips.schedule(hit, event);
    if (was[0] !== interaction.hoverHeader || was[1] !== interaction.hoverRow) {
      this.#host.redraw();
    }
  }

  /** Whether `x` falls on the expand marker of view row `row`'s group cell. */
  #onMarker(row: number, x: number): boolean {
    const metrics = this.#host.metrics();
    const { frame, geometry } = this.#host.model;
    return metrics !== null && onMarker({ frame, metrics, treeLeft: geometry.selectPx }, row, x);
  }

  #commitWidth(): void {
    const { model } = this.#host;
    const live = model.liveWidth;
    model.liveWidth = null;
    if (live !== null) {
      this.#host.change((layout) => withWidth(layout, live.key, live.width));
    }
  }

  /** A header pressed and released in place: its funnel opens its menu, and anywhere else sorts by it. */
  #click(pressed: Pressed, event: PointerEvent): void {
    const host = this.#host;
    const hit = host.hit(event.offsetX, event.offsetY);
    if (hit === null || !hit.header || hit.column === null || hit.column !== pressed.hit.column) {
      return;
    }
    const { column } = hit;
    if (hit.funnel && pressed.hit.funnel) {
      host.openMenu(column);
      return;
    }
    const name = column >= 0 ? host.model.geometry.widthKey(column) : "";
    host.change((layout) => sortedBy(layout, column, { additive: event.shiftKey, name }));
  }

  #doubleClickCell(cell: { readonly row: number; readonly column: number }, x: number): void {
    if (cell.column === -1) {
      // The marker toggles on a single click, so only the label toggles here.
      if (!this.#onMarker(cell.row, x)) {
        this.#host.toggleRow(cell.row);
      }
    } else {
      this.#host.drill(cell.row, cell.column);
    }
  }
}

export { PointerInput };
