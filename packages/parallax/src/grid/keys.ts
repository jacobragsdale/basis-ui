/* The keyboard on a grid: the arrow keys, Page Up and Down, Home and End move the focused cell, with Ctrl to the edge
 * and Shift extending the selection; Ctrl+A selects everything and Escape nothing, leaving an Escape with no selection
 * to drop to the page, which restores a maximized grid with it; Space checks the focused row when rows are chosen by
 * checkbox, and with Shift every row from the last one checked; Enter or Space on a group opens or
 * closes it; Ctrl+F searches the grid rather than the page; and Alt+Down opens the focused cell's column menu, as a
 * spreadsheet's filter does. */

import type { GridHost } from "./host.ts";
import { moveFocus, selectAll } from "./selection.ts";
import type { Extent, Selection } from "./selection.ts";

/** How many rows short of a page Page Up and Page Down move, so a few rows stay in view. */
const pageOverlap = 2;
const far = Number.MAX_SAFE_INTEGER;

/** The rows and columns each navigation key moves by, with Ctrl or without. */
function stepOf(
  key: string,
  { jump, page }: { readonly jump: boolean; readonly page: number },
): readonly [number, number] | null {
  const steps: Readonly<Record<string, readonly [number, number]>> = {
    ArrowDown: [jump ? far : 1, 0],
    ArrowLeft: [0, jump ? -far : -1],
    ArrowRight: [0, jump ? far : 1],
    ArrowUp: [jump ? -far : -1, 0],
    End: [jump ? far : 0, far],
    Home: [jump ? -far : 0, -far],
    PageDown: [page, 0],
    PageUp: [-page, 0],
  };
  return steps[key] ?? null;
}

/** Handles the keyboard on a grid. */
class KeyInput {
  readonly #host: GridHost;

  public constructor(host: GridHost) {
    this.#host = host;
  }

  public readonly down = (event: KeyboardEvent): void => {
    const { extent } = this.#host.model;
    if (this.#shortcut(event) || (extent.rows > 0 && this.#act(event, extent))) {
      event.preventDefault();
    }
  };

  /** Handles a key that changes the selection or a group. Returns whether it did. */
  #act(event: KeyboardEvent, extent: Extent): boolean {
    const start = { column: extent.tree ? -1 : 0, row: 0 };
    const selection = this.#host.model.interaction.selection ?? { anchor: start, focus: start };
    // Space checks a table row first; on a group's row, which has no checkbox, it opens or closes the group.
    if (this.#escape(event) || this.#check(event, selection)) {
      return true;
    }
    // Alt+Enter is the page's: it maximizes the grid.
    if (
      (event.key === "Enter" || event.key === " ") &&
      !event.altKey &&
      selection.focus.column === -1
    ) {
      this.#host.toggleRow(selection.focus.row);
      return true;
    }
    if (this.#selectAll(event, extent)) {
      return true;
    }
    return this.#move(this.#navigate(event, selection, extent));
  }

  /** Ctrl+A selects everything, whatever case its letter arrives in, as with Caps Lock or Shift, and leaves the view
   * where it is. Returns whether it did. */
  #selectAll(event: KeyboardEvent, extent: Extent): boolean {
    const all =
      (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "a";
    if (all) {
      this.#host.select(selectAll(extent));
    }
    return all;
  }

  /** Escape selects nothing. Returns whether it dropped a selection: an Escape with none is left to the page. */
  #escape(event: KeyboardEvent): boolean {
    const had = this.#host.model.interaction.selection !== null;
    if (event.key === "Escape") {
      this.#host.select(null);
    }
    return event.key === "Escape" && had;
  }

  /** Space checks the focused row, if rows are checked and the focus is on a table row: a group's row has no
   * checkbox, and Space opens or closes it instead. Returns whether it checked one. */
  #check(event: KeyboardEvent, selection: Selection): boolean {
    const focused = this.#host.model.interaction.selection !== null;
    return event.key === " " && focused && this.#host.checkRow(selection.focus.row, event.shiftKey);
  }

  /** Moves the selection where a navigation key leads, into view. Returns whether the key navigates. */
  #move(next: Selection | null): boolean {
    if (next !== null) {
      this.#host.select(next);
      this.#host.reveal(next.focus);
    }
    return next !== null;
  }

  /** Handles the grid's own shortcuts, Ctrl+F and Alt+Down. Returns whether it handled `event`. */
  #shortcut(event: KeyboardEvent): boolean {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "f") {
      return this.#host.focusSearch();
    }
    const focus = this.#host.model.interaction.selection?.focus;
    if (
      event.altKey &&
      event.key === "ArrowDown" &&
      focus !== undefined &&
      this.#host.model.hasMenu(focus.column)
    ) {
      this.#host.openMenu(focus.column);
      return true;
    }
    return false;
  }

  /** The selection a navigation key leads to, or null for keys that do not navigate. */
  #navigate(event: KeyboardEvent, selection: Selection, extent: Extent): Selection | null {
    const metrics = this.#host.metrics();
    const rowPx = metrics?.rowPx ?? 1;
    const page = Math.max(1, Math.floor(this.#host.model.area.height / rowPx) - pageOverlap);
    const jump = event.ctrlKey || event.metaKey;
    const step = stepOf(event.key, { jump, page });
    return step === null
      ? null
      : moveFocus(selection, { columns: step[1], extend: event.shiftKey, rows: step[0] }, extent);
  }
}

export { KeyInput };
