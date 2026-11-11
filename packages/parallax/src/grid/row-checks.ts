/* What the grid does when rows are chosen: it takes the app's row selection on each render, checks a row, a Shift
 * range or every row shown, follows the focus in single mode, and hands the app the keys. The keys of rows off screen,
 * for a range or every row, are fetched from the view, one cell a row. The rules are row-selection.ts's. */

import type { ViewHandle } from "#engine/view.ts";

import type { GridHost } from "./host.ts";
import type { GridModel } from "./model.ts";
import { isKeyList, keyColumn, keysIn, maxRowsFetched, noRows, rowsOf } from "./row-selection.ts";
import type { KeyColumn, RowSelect, RowSelectionInputs, RowsChosen } from "./row-selection.ts";
import type { GridInputs } from "./types.ts";

/** What checking rows asks of the grid. */
interface RowChecksHost {
  readonly model: GridModel;
  /** The open view, for fetching keys; null until it opens. */
  readonly handle: () => ViewHandle | null;
  /** The app's row selection, from its latest render. */
  readonly inputs: () => RowSelectionInputs | null;
  readonly say: (message: string) => void;
  /** Draws and publishes what changed. */
  readonly update: () => void;
}

/** Whether two ways of choosing rows are the same. */
function sameSelect(one: RowSelect | null, other: RowSelect | null): boolean {
  return one?.index === other?.index && one?.mode === other?.mode;
}

/** How rows are chosen, if the app asks and the view shows the key column. */
function selectOf(
  rowSelection: RowSelectionInputs | null,
  column: KeyColumn | null,
): RowSelect | null {
  return column?.ok === true && rowSelection !== null
    ? { index: column.index, mode: rowSelection.mode }
    : null;
}

/** Checks rows for a grid. */
class RowChecks {
  readonly #host: RowChecksHost;
  /** In single mode, the key of the row last focused, so only a move to another row changes the choice. */
  #focusKey: string | null = null;
  /** Why rows cannot be chosen, as the status bar last said it, so it is said once each time it changes. */
  #reason = "";

  public constructor(host: RowChecksHost) {
    this.#host = host;
  }

  /** Takes the app's row selection: where its key column is, and the keys the app holds, if it holds them. After a
   * new layout, the rows have moved: a Shift range has no row to start from, and "every row" no longer holds. */
  public take({ rowSelection, layout, fields }: GridInputs, moved: boolean): void {
    const { choice } = this.#host.model;
    if (moved) {
      choice.moved();
    }
    const column = rowSelection === null ? null : keyColumn(layout, fields, rowSelection.key);
    const select = selectOf(rowSelection, column);
    this.#sayWhy(column);
    if (!sameSelect(select, choice.select)) {
      choice.select = select;
    }
    this.#takeRows(rowSelection);
  }

  /** Takes the rows the app holds, if it holds them. */
  #takeRows(rowSelection: RowSelectionInputs | null): void {
    const selected = rowSelection?.selected;
    if (selected !== undefined) {
      this.#host.model.choice.set(rowsOf(selected));
    }
  }

  /** Says why rows cannot be chosen, once each time the reason changes, or clears the reason once they can be. */
  #sayWhy(column: KeyColumn | null): void {
    const reason = column === null || column.ok ? "" : column.reason;
    if (reason !== this.#reason) {
      this.#reason = reason;
      this.#host.say(reason);
    }
  }

  /** Checks or unchecks view row `row`, or with `range` every row from the last one checked. Returns whether the row
   * can be checked: a table row, loaded, in a grid that checks rows. */
  public check(row: number, range: boolean): boolean {
    const { model } = this.#host;
    const key = model.choice.keyAt(model.frame, row);
    if (key === null || model.choice.select?.mode !== "multiple") {
      return false;
    }
    this.#checkFrom(row, key, range);
    return true;
  }

  /** Checks or unchecks the row of `key`, or with `range` every row from the last one checked to it. */
  #checkFrom(row: number, key: string, range: boolean): void {
    const { choice } = this.#host.model;
    const { anchor } = choice;
    choice.anchor = row;
    if (range && anchor !== null && anchor !== row) {
      this.#checkRange(anchor, row).catch(reportError);
    } else {
      this.#commit(choice.toggledChoice(key), false);
    }
  }

  /** What the grid's host takes of checking rows, for the pointer and the keyboard. */
  public get hostPart(): Pick<GridHost, "checkAll" | "checkRow"> {
    return {
      checkAll: () => {
        this.checkAll();
      },
      checkRow: (row, range) => this.check(row, range),
    };
  }

  /** Checks every row the view shows, or clears the choice when there is one, as the header's checkbox does. A flat
   * view chooses every row with none listed, fetching no key; a grouped view, whose header checks the open groups'
   * rows, and an app that holds the keys as a list, fetch the keys. */
  public checkAll(): void {
    const { model } = this.#host;
    const selected = this.#host.inputs()?.selected;
    if (model.choice.any) {
      this.#commit(noRows, false);
    } else if (model.frame?.tree === null && (selected === undefined || !isKeyList(selected))) {
      this.#commit({ all: true, keys: [] }, false);
    } else {
      this.#checkShown().catch(reportError);
    }
  }

  /** In single mode, chooses the focused cell's row once the focus moves to another row with a key. */
  public followFocus(): void {
    const { model } = this.#host;
    const focus = model.interaction.selection?.focus;
    const key = focus === undefined ? null : model.choice.keyAt(model.frame, focus.row);
    if (model.choice.select?.mode !== "single" || key === null || key === this.#focusKey) {
      return;
    }
    this.#focusKey = key;
    this.#commit({ all: false, keys: [key] }, false);
  }

  /** The keys of view rows `first` to `first + count - 1`, fetched from the view; null when it is not open, or the
   * rows are more than a fetch takes, which the status bar says. */
  async #keysOf(first: number, count: number): Promise<string[] | null> {
    const handle = this.#host.handle();
    const { select } = this.#host.model.choice;
    if (handle === null || select === null || count === 0) {
      return null;
    }
    if (count > maxRowsFetched) {
      const most = maxRowsFetched.toLocaleString("en-US");
      this.#host.say(`Up to ${most} rows are checked at once: filter the view first.`);
      return null;
    }
    const window = { columnCount: 1, firstColumn: select.index, firstRow: first, rowCount: count };
    return keysIn(await handle.fetch(window), select.index);
  }

  /** Checks every row from `from` to `to`, both included. */
  async #checkRange(from: number, to: number): Promise<void> {
    const keys = await this.#keysOf(Math.min(from, to), Math.abs(to - from) + 1);
    if (keys !== null) {
      this.#commit(this.#host.model.choice.withRange(keys), false);
    }
  }

  /** Checks every row the view shows. */
  async #checkShown(): Promise<void> {
    const keys = await this.#keysOf(0, this.#host.model.totalRows);
    if (keys !== null) {
      this.#commit({ all: false, keys }, true);
    }
  }

  /** Hands an app that takes keys the keys of every row the view shows but `except`, fetched from the view. */
  async #handKeys(
    onChange: (keys: readonly string[]) => void,
    except: readonly string[],
  ): Promise<void> {
    const keys = await this.#keysOf(0, this.#host.model.totalRows);
    if (keys !== null) {
      const left = new Set(except);
      onChange(keys.filter((key) => !left.has(key)));
    }
  }

  /** Hands the app the rows now chosen. Without rows of its own, the grid shows them at once; with them, it shows
   * what the app gives back. `all` says the header's checkbox chose these keys. */
  #commit(rows: RowsChosen, all: boolean): void {
    const inputs = this.#host.inputs();
    const { choice } = this.#host.model;
    if (inputs === null) {
      return;
    }
    if (inputs.selected === undefined) {
      choice.set(rows);
    }
    // Held by the app, the keys come back on its next render, and the header shows them all checked if they are these.
    choice.checkedAll(all && !rows.all ? rows.keys : null);
    inputs.onRows?.(rows);
    this.#handTo(inputs.onChange, rows);
    this.#host.update();
  }

  /** Hands an app that takes keys the keys chosen: for every row but some, once they are fetched. */
  #handTo(onChange: RowSelectionInputs["onChange"], rows: RowsChosen): void {
    if (onChange === undefined) {
      return;
    }
    if (rows.all) {
      this.#handKeys(onChange, rows.keys).catch(reportError);
    } else {
      onChange(rows.keys);
    }
  }
}

export { RowChecks };
