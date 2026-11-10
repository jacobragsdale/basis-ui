/* Row selection: the rows the user chose, kept by the value of the key column the app names, such as a trade id or a
 * CUSIP, so a choice stays with its rows as they sort, filter, group and scroll. A key is the column's text as a copy
 * writes it, every digit of a number, so it compares exactly and the app can keep it in a URL or a request.
 *
 * In `multiple` mode a checkbox column at the far left checks rows one at a time, Shift checks every row from the last
 * one checked, and its header checks every row the view shows, or clears the choice when there is one; Space checks
 * the focused row. In `single` mode the selected row is the focused cell's. A grouped grid's rows can be selected, not
 * its group rows; a pivot's rows are groups, so it selects none, and neither does a view that hides the key column. */

import type { FrameData } from "#frame/frame.ts";
import type { Layout } from "#layout/layout.ts";

import { isPivotLayout, shownColumns } from "./edit.ts";
import type { SourceField } from "./fields.ts";

/** How rows are selected: by checkbox, any number of them, or one, the focused cell's. */
type SelectMode = "multiple" | "single";

/** What the app asks of row selection. */
interface RowSelectionInputs {
  readonly mode: SelectMode;
  /** The column whose value names a row: one of the view's columns, with a different value on every row. */
  readonly key: string;
  /** The keys the app holds, which the grid shows; `undefined` leaves the grid to keep its own. */
  readonly selected: readonly string[] | undefined;
  /** Takes the keys selected, in the order they were chosen, whenever the user changes them. */
  readonly onChange: ((keys: readonly string[]) => void) | undefined;
}

/** Where the key column is among the view's columns, or why rows cannot be selected; an empty reason while the view
 * has not opened. */
type KeyColumn =
  | { readonly ok: true; readonly index: number }
  | { readonly ok: false; readonly reason: string };

/** What the header's checkbox shows: no row selected, some, or every row the view showed when it was checked. */
type HeaderCheck = "none" | "some" | "all";

/** The most rows a Shift range or the header's checkbox fetches the keys of, one cell each: a fetch's limit. */
const maxRowsFetched = 1_000_000;

/** The key column's place among a flat or detail view's columns, or why its rows cannot be selected. */
function keyColumn(layout: Layout | null, fields: readonly SourceField[], key: string): KeyColumn {
  if (layout === null || fields.length === 0) {
    return { ok: false, reason: "" };
  }
  if (isPivotLayout(layout)) {
    return { ok: false, reason: "A pivot's rows are groups, which cannot be selected." };
  }
  const index = shownColumns(layout, fields).indexOf(key);
  return index === -1
    ? { ok: false, reason: `Rows cannot be selected while the ${key} column is hidden.` }
    : { index, ok: true };
}

/** The key of view row `row`, if the frame holds the row and the key column, and the row is one of the table's: a
 * group row and a total have none, nor does a row whose key is empty. */
function rowKeyAt(frame: FrameData | null, row: number, index: number): string | null {
  if (frame === null) {
    return null;
  }
  const local = row - frame.firstRow;
  if (local < 0 || local >= frame.rowCount || (frame.tree?.kind(local) ?? "row") !== "row") {
    return null;
  }
  const key = frame.columns[index - frame.firstColumn]?.copy(local) ?? "";
  return key === "" ? null : key;
}

/** The keys of every table row a frame holds, in order. */
function keysIn(frame: FrameData, index: number): string[] {
  const keys: string[] = [];
  for (let row = frame.firstRow; row < frame.firstRow + frame.rowCount; row += 1) {
    const key = rowKeyAt(frame, row, index);
    if (key !== null) {
      keys.push(key);
    }
  }
  return keys;
}

/** Row selection's mode and the key column's index among the view's columns, when the grid chooses rows. */
interface RowSelect {
  readonly mode: SelectMode;
  readonly index: number;
}

/** Whether `keys` are the keys of `set`, in any order. */
function sameKeys(set: ReadonlySet<string>, keys: readonly string[]): boolean {
  return keys.length === set.size && keys.every((key) => set.has(key));
}

/** The rows chosen, by key, in the order they were chosen, with the row a Shift range starts from. */
class RowChoice {
  #keys = new Set<string>();
  /** How rows are chosen, while the app asks for it and the view shows the key column; null otherwise. */
  public select: RowSelect | null = null;
  /** The view row last checked or unchecked, which a Shift range starts from; null after a change of layout. */
  public anchor: number | null = null;
  /** The keys the header's checkbox chose, every row the view showed, until the layout or the choice changes; null
   * when it chose none. They are kept apart from the keys held, so that an app holding the keys, which gives them back
   * a render later, still shows every row checked. */
  #all: ReadonlySet<string> | null = null;

  public get keys(): ReadonlySet<string> {
    return this.#keys;
  }

  /** What the header's checkbox shows. */
  public get header(): HeaderCheck {
    if (this.#keys.size === 0) {
      return "none";
    }
    return this.#all !== null && sameKeys(this.#all, [...this.#keys]) ? "all" : "some";
  }

  /** Records the keys of every row the view shows, as the header's checkbox chose them, or null for a choice of some
   * rows, or after a change of layout, when they may no longer be every row. */
  public checkedAll(keys: readonly string[] | null): void {
    this.#all = keys === null ? null : new Set(keys);
  }

  public has(key: string | null): boolean {
    return key !== null && this.#keys.has(key);
  }

  /** The key of view row `row` in `frame`: null when rows are not chosen, or the row is a group's or not loaded. */
  public keyAt(frame: FrameData | null, row: number): string | null {
    return this.select === null ? null : rowKeyAt(frame, row, this.select.index);
  }

  /** Whether view row `row` in `frame` is chosen. */
  public chosen(frame: FrameData | null, row: number): boolean {
    return this.has(this.keyAt(frame, row));
  }

  /** Forgets where a Shift range starts and that every row is checked, after a change of layout moves the rows. */
  public moved(): void {
    this.anchor = null;
    this.#all = null;
  }

  /** Takes the keys the app holds; returns whether they differ from the grid's. */
  public replace(keys: readonly string[]): boolean {
    const same = sameKeys(this.#keys, keys);
    if (!same) {
      this.#keys = new Set(keys);
    }
    return !same;
  }
}

/** The keys after checking or unchecking one row. */
function toggled(keys: ReadonlySet<string>, key: string): string[] {
  return keys.has(key) ? [...keys].filter((each) => each !== key) : [...keys, key];
}

/** The keys after checking rows, those already chosen first. */
function withKeys(keys: ReadonlySet<string>, added: readonly string[]): string[] {
  return [...new Set([...keys, ...added])];
}

export { keyColumn, keysIn, maxRowsFetched, RowChoice, rowKeyAt, toggled, withKeys };
export type { HeaderCheck, KeyColumn, RowSelect, RowSelectionInputs, SelectMode };
