/* What a right click's menu and the grid's handle do: copy the selection, with its headers or without, filter by a
 * cell's value or exclude it, sort and pin its column, fit one column or all, and find the cell a right click is on,
 * selecting it unless it is in the selection already. */

import type { CellValue } from "#frame/cell.ts";
import { pathValue } from "#format.ts";
import type { FrameData } from "#frame/frame.ts";
import type { Layout, LayoutFilter, LayoutScalar } from "#layout/layout.ts";

import { countOf, rangeText, windowOf } from "./copy.ts";
import { withPinned, withSort } from "./edit.ts";
import { cellOf } from "./events.ts";
import type { GridCell } from "./events.ts";
import type { GridHost } from "./host.ts";
import { contains, pasteSafe, rangeOf, toTsv } from "./selection.ts";
import type { CellRange } from "./selection.ts";

/** A cell's value as a filter's operand, in the engine's exact form, as a layout's group paths hold it: a decimal, a
 * big integer, a date or a time as exact text, never as the cell shows it, with its separators or to the second. */
function cellOperand(value: CellValue): LayoutScalar {
  return pathValue(value);
}

/** The headers of a range's columns, as a copy with headers writes them. */
function headersOf(frame: FrameData, layout: Layout | null, range: CellRange): string[] {
  const titles: string[] = [];
  for (let column = range.left; column <= range.right; column += 1) {
    const group =
      layout === null || layout.group_by.length === 0 ? "Group" : layout.group_by.join(" › ");
    titles.push(
      pasteSafe(column < 0 ? group : (frame.columns[column - frame.firstColumn]?.title ?? "")),
    );
  }
  return titles;
}

/** The selected cells, as the grid's handle gives them: the first and last view rows, and the columns by name, the
 * group column's as an empty name. */
interface GridSelection {
  readonly top: number;
  readonly bottom: number;
  readonly columns: readonly string[];
}

/** Writes text to the clipboard, which a page served over plain http has none of: Ctrl+C still copies there. */
async function clipboardText(text: string): Promise<void> {
  if (!("clipboard" in navigator)) {
    throw new Error(
      "this page has no clipboard to write to, as on plain http; press Ctrl+C instead",
    );
  }
  await navigator.clipboard.writeText(text);
}

/** The grid's actions on cells. */
class GridActions {
  readonly #host: GridHost;

  public constructor(host: GridHost) {
    this.#host = host;
  }

  /** The data cell at `x`, `y` on the canvas, selected unless the selection holds it; null off the data cells. */
  public cellAt(x: number, y: number): GridCell | null {
    const hit = this.#host.hit(x, y);
    if (hit === null || hit.header || hit.row === null || hit.column === null || hit.column < 0) {
      return null;
    }
    const ref = { column: hit.column, row: hit.row };
    const { selection } = this.#host.model.interaction;
    if (selection === null || !contains(rangeOf(selection), ref)) {
      this.#host.select({ anchor: ref, focus: ref });
    }
    return cellOf(this.#host, ref);
  }

  /** The frame that holds `range`: the grid's, or one fetched for it; undefined if the view is not open. */
  async #holding(frame: FrameData, range: CellRange): Promise<FrameData | undefined> {
    return rangeText(frame, range) === null ? this.#host.handle()?.fetch(windowOf(range)) : frame;
  }

  /** The text a copy of `range` writes, with its headers first when asked; null if the rows changed. */
  async #textOf(range: CellRange, withHeaders: boolean): Promise<string | null> {
    const { frame, layout } = this.#host.model;
    const source = frame === null ? undefined : await this.#holding(frame, range);
    const text = source === undefined ? null : rangeText(source, range);
    if (source === undefined || text === null) {
      return null;
    }
    return withHeaders ? `${toTsv([headersOf(source, layout, range)])}\r\n${text}` : text;
  }

  /** Copies the selection to the clipboard, with its headers first when asked, fetching rows the grid does not hold. */
  public async copy(withHeaders: boolean): Promise<void> {
    const { selection } = this.#host.model.interaction;
    if (selection === null) {
      return;
    }
    const range = rangeOf(selection);
    // A copy refused, such as of more cells than a fetch takes, or with no clipboard, says why rather than nothing.
    const said = await this.#copyText(range, withHeaders).catch(
      (error: unknown) => `Copy failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    this.#host.say(said);
  }

  /** Copies a range's text, returning what the status bar says of it. */
  async #copyText(range: CellRange, withHeaders: boolean): Promise<string> {
    const text = await this.#textOf(range, withHeaders);
    if (text === null) {
      return "Copy failed: the rows changed while copying; copy again";
    }
    await clipboardText(text);
    return `Copied ${countOf(range)}`;
  }

  /** Keeps only the rows whose `cell.column` is the cell's value, or with `exclude` those whose is not. */
  public filterBy(cell: GridCell, exclude: boolean): void {
    const value = cellOperand(cell.value);
    const nulls: LayoutFilter["op"] = exclude ? "is_not_null" : "is_null";
    const equals: LayoutFilter["op"] = exclude ? "ne" : "eq";
    const filter: LayoutFilter = {
      column: cell.column,
      columns: [],
      op: value === null ? nulls : equals,
      value,
      values: [],
    };
    this.#host.change((layout) => ({ ...layout, filters: [...layout.filters, filter] }));
  }

  /** Sorts by `column`, smallest first or largest. */
  public sortBy(column: string, descending: boolean): void {
    this.#host.change((layout) => withSort(layout, column, descending));
  }

  /** Pins `column` at the left, or lets it scroll again. */
  public pin(column: string, pinned: boolean): void {
    this.#host.change((layout) => withPinned(layout, column, pinned));
  }

  /** Scrolls view row `row`, and column `column` when given, into view, and selects that cell. */
  public scrollTo(row: number, column?: string): void {
    const { geometry, totalRows } = this.#host.model;
    const found = column === undefined ? 0 : this.#indexOf(column);
    const ref = { column: Math.max(0, found), row: Math.max(0, Math.min(row, totalRows - 1)) };
    this.#host.select({ anchor: ref, focus: ref });
    this.#host.reveal(
      column === undefined || found >= 0 || geometry.count === 0 ? ref : { ...ref, column: 0 },
    );
  }

  /** The selection, or null for none. */
  public selection(): GridSelection | null {
    const { selection } = this.#host.model.interaction;
    if (selection === null) {
      return null;
    }
    const range = rangeOf(selection);
    const columns: string[] = [];
    for (let column = range.left; column <= range.right; column += 1) {
      columns.push(column < 0 ? "" : this.#host.model.geometry.widthKey(column));
    }
    return { bottom: range.bottom, columns, top: range.top };
  }

  /** Data column `name`'s index, or -1. */
  #indexOf(name: string): number {
    const { geometry } = this.#host.model;
    return Array.from({ length: geometry.count }, (_entry, index) =>
      geometry.widthKey(index),
    ).indexOf(name);
  }

  /** Fits data column `column`, or every data column, to its header and values, in one change of the layout. */
  public fit(column: number | "all"): void {
    const { model } = this.#host;
    const columns =
      column === "all"
        ? Array.from({ length: model.geometry.count }, (_entry, index) => index)
        : [column];
    const widths = Object.fromEntries(
      columns.map((each) => [model.widthKey(each), this.#host.fitWidth(each)] as const),
    );
    this.#host.change((layout) => ({
      ...layout,
      column_widths: { ...layout.column_widths, ...widths },
    }));
  }
}

export { cellOperand, GridActions };
export type { GridSelection };
