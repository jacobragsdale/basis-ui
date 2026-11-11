/* The events a grid gives its app: a cell clicked, a row activated by a double click or Enter, and the cell a right
 * click opened the menu on. The pointer and the keyboard send them up the grid's element as DOM events, which the
 * component hands the app's props, so the controller between them stays as it is. */

import type { CellValue } from "#frame/cell.ts";

import type { GridHost } from "./host.ts";
import type { CellRef } from "./selection.ts";

/** A cell of the grid, as the app is told of it. */
interface GridCell {
  /** Its view row, from 0. */
  readonly row: number;
  /** Its source column's name, or the header a pivot's measure shows. */
  readonly column: string;
  /** Its text as the grid shows it. */
  readonly text: string;
  readonly value: CellValue;
  /** Its row's key, when rows are chosen by `rowKey`, else null. */
  readonly key: string | null;
  /** Whether the layout draws its column as links. */
  readonly link: boolean;
}

/** A row of the grid, as the app is told of it: its view row and its key, when rows are chosen by `rowKey`. */
interface GridRow {
  readonly row: number;
  readonly key: string | null;
}

/** An item an app adds to the menu a right click opens on the grid. */
interface GridMenuItem {
  readonly label: string;
  readonly onSelect: () => void;
}

/** The DOM events the grid's element carries, each with a `CellRef` as its detail. */
const cellClickEvent = "parallax:cellclick";
const rowActivateEvent = "parallax:rowactivate";

/** Sends `name` up the grid's element for `cell`. */
function send(host: GridHost, name: string, cell: CellRef): void {
  host.dom.parts.scroll.dispatchEvent(
    new CustomEvent<CellRef>(name, { bubbles: true, detail: cell }),
  );
}

/** The cell at `ref` as the app is told of it, or null where the frame holds no data cell. */
function cellOf({ model }: Pick<GridHost, "model">, ref: CellRef): GridCell | null {
  const { frame, layout } = model;
  const data = frame === null ? undefined : frame.columns[ref.column - frame.firstColumn];
  if (frame === null || data === undefined || ref.column < 0) {
    return null;
  }
  const local = ref.row - frame.firstRow;
  if (local < 0 || local >= frame.rowCount) {
    return null;
  }
  return {
    column: data.name,
    key: model.choice.keyAt(frame, ref.row),
    link: layout?.cells?.[data.name]?.kind === "link",
    row: ref.row,
    text: data.text(local),
    value: data.value(local),
  };
}

/** The row at view row `row` as the app is told of it. */
function rowOf({ model }: Pick<GridHost, "model">, row: number): GridRow {
  return { key: model.choice.keyAt(model.frame, row), row };
}

/** The cell a DOM event of the grid's names, from its detail. */
function refOf(event: Event): CellRef | null {
  if (!(event instanceof CustomEvent)) {
    return null;
  }
  const detail: unknown = event.detail;
  return typeof detail === "object" && detail !== null && "row" in detail && "column" in detail
    ? { column: Number(detail.column), row: Number(detail.row) }
    : null;
}

export { cellClickEvent, cellOf, refOf, rowActivateEvent, rowOf, send };
export type { GridCell, GridMenuItem, GridRow };
