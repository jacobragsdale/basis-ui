/* Row selection: the rows the user chose, kept by the value of the key column the app names, such as a trade id or a
 * CUSIP, so a choice stays with its rows as they sort, filter, group and scroll. A key is the column's text as a copy
 * writes it, every digit of a number, so it compares exactly and the app can keep it in a URL or a request.
 *
 * In `multiple` mode a checkbox column at the far left checks rows one at a time, Shift checks every row from the last
 * one checked, and its header checks every row the view shows, or clears the choice when there is one; Space checks
 * the focused row. In `single` mode the selected row is the focused cell's. A grouped grid's rows can be selected, not
 * its group rows; a pivot's rows are groups, so it selects none, and neither does a view that hides the key column. */

import type { FrameData } from "#frame/frame.ts";
import type { Layout, LayoutFilter } from "#layout/layout.ts";

import { isPivotLayout, shownColumns } from "./edit.ts";
import type { SourceField } from "./fields.ts";

/** How rows are selected: by checkbox, any number of them, or one, the focused cell's. */
type SelectMode = "multiple" | "single";

/** What the app asks of row selection. */
interface RowSelectionInputs {
  readonly mode: SelectMode;
  /** The column whose value names a row: one of the view's columns, with a different value on every row. */
  readonly key: string;
  /** The rows the app holds, which the grid shows, as keys or as every row but some; `undefined` leaves the grid to
   * keep its own. */
  readonly selected: readonly string[] | RowsChosen | undefined;
  /** Takes the keys selected, in the order they were chosen, whenever the user changes them; for every row but some,
   * the keys of the rows, fetched from the view, up to `maxRowsFetched`. */
  readonly onChange: ((keys: readonly string[]) => void) | undefined;
  /** Takes the rows chosen, as keys or as every row but some, whenever the user changes them. */
  readonly onRows: ((rows: RowsChosen) => void) | undefined;
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

/** The key of view row `row`, if the frame holds the row and the key column, named `column`, and the row is one of
 * the table's: a group row and a total have none, nor does a row whose key is empty. The column is found in the frame
 * by its name, so a frame of the layout before, whose columns stood elsewhere, still gives the key. */
function rowKeyAt(frame: FrameData | null, row: number, column: string): string | null {
  if (frame === null) {
    return null;
  }
  const local = row - frame.firstRow;
  if (local < 0 || local >= frame.rowCount || (frame.tree?.kind(local) ?? "row") !== "row") {
    return null;
  }
  const key = frame.columns.find(({ name }) => name === column)?.copy(local) ?? "";
  return key === "" ? null : key;
}

/** The keys of every table row a frame holds, in order, from the key column named `column`. */
function keysIn(frame: FrameData, column: string): string[] {
  const keys: string[] = [];
  for (let row = frame.firstRow; row < frame.firstRow + frame.rowCount; row += 1) {
    const key = rowKeyAt(frame, row, column);
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

/** The column whose value names a row, and its index among the view's columns, while the app names one and the view
 * shows it: rows chosen or not, every row event carries its key. */
interface KeyedBy {
  readonly name: string;
  readonly index: number;
}

/** Whether `keys` are the keys of `set`, in any order. */
function sameKeys(set: ReadonlySet<string>, keys: readonly string[]): boolean {
  return keys.length === set.size && keys.every((key) => set.has(key));
}

/** The keys after checking or unchecking one row. */
function toggled(keys: ReadonlySet<string>, key: string): string[] {
  return keys.has(key) ? [...keys].filter((each) => each !== key) : [...keys, key];
}

/** The keys after checking rows, those already chosen first. */
function withKeys(keys: ReadonlySet<string>, added: readonly string[]): string[] {
  return [...new Set([...keys, ...added])];
}

/** The view a choice of every row covers, as an app's API can find its rows: the layout's filters and search, and
 * how many rows the view shows. */
interface ChosenView {
  readonly filters: readonly LayoutFilter[];
  readonly search: string;
  readonly rows: number;
}

/** The rows chosen: these rows, by key, in the order they were chosen; or every row the view shows but these, which
 * the header's checkbox chooses in a flat view without fetching a key. "Every row" follows the view: a row a filter
 * later shows is chosen, and one it hides is not, and the app hears the choice again whenever its rows change. */
interface RowsChosen {
  /** Whether every row the view shows is chosen but `keys`, or only `keys`. */
  readonly all: boolean;
  /** With `all` false, the keys of the rows chosen, in the order they were chosen; with `all` true, of those left
   * out. */
  readonly keys: readonly string[];
  /** With `all` true, as the grid hands it over, the view whose rows are chosen: what a bulk action sends its API, with
   * `keys` as the rows left out. The grid reads none of it in the rows an app gives back. */
  readonly view?: ChosenView | undefined;
}

const noRows: RowsChosen = { all: false, keys: [] };

/** Whether the rows an app holds are a list of keys. */
function isKeyList(rows: readonly string[] | RowsChosen): rows is readonly string[] {
  return Array.isArray(rows);
}

/** The rows an app holds, as keys or as every row but some, as the grid holds them. */
function rowsOf(rows: readonly string[] | RowsChosen): RowsChosen {
  return isKeyList(rows) ? { all: false, keys: rows } : rows;
}

/** The rows chosen, by key, with the row a Shift range starts from. */
class RowChoice {
  #keys = new Set<string>();
  /** The rows left out of every row, when every row but these is chosen; null when the keys are those chosen. */
  #except: Set<string> | null = null;
  /** How rows are chosen, while the app asks for it and the view shows the key column; null otherwise. */
  public select: RowSelect | null = null;
  /** The key column, while the app names one and the view shows it, whether rows are chosen or not; null otherwise. */
  public keyed: KeyedBy | null = null;
  /** The view row last checked or unchecked, which a Shift range starts from; null after a change of layout. */
  public anchor: number | null = null;
  /** The keys the header's checkbox chose, every row the view showed, until the layout or the choice changes; null
   * when it chose none. They are kept apart from the keys held, so that an app holding the keys, which gives them back
   * a render later, still shows every row checked. */
  #all: ReadonlySet<string> | null = null;

  /** The keys chosen, when these rows are; empty when every row but some is. */
  public get keys(): ReadonlySet<string> {
    return this.#except === null ? this.#keys : new Set();
  }

  /** The rows chosen, as the app is given them. */
  public get rows(): RowsChosen {
    return this.#except === null
      ? { all: false, keys: [...this.#keys] }
      : { all: true, keys: [...this.#except] };
  }

  /** Whether anything is chosen. */
  public get any(): boolean {
    return this.#except !== null || this.#keys.size > 0;
  }

  /** What the header's checkbox shows. */
  public get header(): HeaderCheck {
    if (this.#except !== null) {
      return this.#except.size === 0 ? "all" : "some";
    }
    if (this.#keys.size === 0) {
      return "none";
    }
    return this.#all !== null && sameKeys(this.#all, [...this.#keys]) ? "all" : "some";
  }

  /** How many rows are chosen, of the `rows` the view shows. */
  public count(rows: number): number {
    return this.#except === null ? this.#keys.size : Math.max(0, rows - this.#except.size);
  }

  /** Records the keys of every row the view shows, as the header's checkbox chose them, or null for a choice of some
   * rows, or after a change of layout, when they may no longer be every row. */
  public checkedAll(keys: readonly string[] | null): void {
    this.#all = keys === null ? null : new Set(keys);
  }

  public has(key: string | null): boolean {
    if (key === null) {
      return false;
    }
    return this.#except === null ? this.#keys.has(key) : !this.#except.has(key);
  }

  /** The key of view row `row` in `frame`: null without a key column, or for a row that is a group's or not loaded. */
  public keyAt(frame: FrameData | null, row: number): string | null {
    return this.keyed === null ? null : rowKeyAt(frame, row, this.keyed.name);
  }

  /** Whether view row `row` in `frame` is chosen. */
  public chosen(frame: FrameData | null, row: number): boolean {
    return this.has(this.keyAt(frame, row));
  }

  /** Forgets where a Shift range starts and that every row is checked, after a change of layout moves the rows. Every
   * row but some stays chosen: it follows the view. */
  public moved(): void {
    this.anchor = null;
    this.#all = null;
  }

  /** Takes the keys the app holds; returns whether they differ from the grid's. */
  public replace(keys: readonly string[]): boolean {
    return this.set({ all: false, keys });
  }

  /** Takes the rows chosen; returns whether they differ from those the grid had. */
  public set(chosen: RowsChosen): boolean {
    if (chosen.all) {
      const same = this.#except !== null && sameKeys(this.#except, chosen.keys);
      this.#except = same ? this.#except : new Set(chosen.keys);
      return !same;
    }
    const same = this.#except === null && sameKeys(this.#keys, chosen.keys);
    if (!same) {
      this.#except = null;
      this.#keys = new Set(chosen.keys);
    }
    return !same;
  }

  /** The rows chosen after checking or unchecking the row of `key`. */
  public toggledChoice(key: string): RowsChosen {
    return this.#except === null
      ? { all: false, keys: toggled(this.#keys, key) }
      : { all: true, keys: toggled(this.#except, key) };
  }

  /** The rows chosen after checking the rows of `keys`, as a Shift range does. */
  public withRange(keys: readonly string[]): RowsChosen {
    if (this.#except === null) {
      return { all: false, keys: withKeys(this.#keys, keys) };
    }
    const checked = new Set(keys);
    return { all: true, keys: [...this.#except].filter((key) => !checked.has(key)) };
  }
}

export {
  isKeyList,
  keyColumn,
  keysIn,
  maxRowsFetched,
  noRows,
  RowChoice,
  rowKeyAt,
  rowsOf,
  toggled,
  withKeys,
};
export type {
  ChosenView,
  HeaderCheck,
  KeyedBy,
  KeyColumn,
  RowSelect,
  RowSelectionInputs,
  RowsChosen,
  SelectMode,
};
