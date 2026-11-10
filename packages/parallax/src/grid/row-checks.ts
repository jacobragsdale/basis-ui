/* What the grid does when rows are chosen: it takes the app's row selection on each render, checks a row, a Shift
 * range or every row shown, follows the focus in single mode, and hands the app the keys. The keys of rows off screen,
 * for a range or every row, are fetched from the view, one cell a row. The rules are row-selection.ts's. */

import type { ViewHandle } from "#engine/view.ts";

import type { GridHost } from "./host.ts";
import type { GridModel } from "./model.ts";
import { keyColumn, keysIn, maxRowsFetched, toggled, withKeys } from "./row-selection.ts";
import type { KeyColumn, RowSelect, RowSelectionInputs } from "./row-selection.ts";
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
    if (rowSelection?.selected !== undefined) {
      choice.replace(rowSelection.selected);
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
      this.#commit(toggled(choice.keys, key), false);
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

  /** Checks every row the view shows, or clears the choice when there is one, as the header's checkbox does. */
  public checkAll(): void {
    if (this.#host.model.choice.keys.size > 0) {
      this.#commit([], false);
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
    this.#commit([key], false);
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
      this.#commit(withKeys(this.#host.model.choice.keys, keys), false);
    }
  }

  /** Checks every row the view shows. */
  async #checkShown(): Promise<void> {
    const keys = await this.#keysOf(0, this.#host.model.totalRows);
    if (keys !== null) {
      this.#commit(keys, true);
    }
  }

  /** Hands the app the keys now chosen. Without keys of its own, the grid shows them at once; with them, it shows
   * what the app gives back. `all` says the header's checkbox chose them. */
  #commit(keys: readonly string[], all: boolean): void {
    const inputs = this.#host.inputs();
    const { choice } = this.#host.model;
    if (inputs === null) {
      return;
    }
    if (inputs.selected === undefined) {
      choice.replace(keys);
    }
    // Held by the app, the keys come back on its next render, and the header shows them all checked if they are these.
    choice.checkedAll(all ? keys : null);
    inputs.onChange?.(keys);
    this.#host.update();
  }
}

export { RowChecks };
