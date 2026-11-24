/* The board's cells, and where the arrow keys take the focus among their cards: Up and Down within a cell, Left and
 * Right to the same place in the next cell along the row that holds a card, and Home and End to a cell's ends. With
 * lanes, Up from a cell's first card and Down from its last go to the nearest cell above or below that holds one. */

import type { ReactNode } from "react";

/** What a board shows of an item: its id and the cell it is in. */
interface BoardItem {
  readonly id: string;
  /** The column the item is in. */
  readonly column: string;
  /** The lane it is in, on a board with lanes. */
  readonly lane?: string | undefined;
  /** A heading the cell draws above the first card of each run of cards that share it, such as "On hold". */
  readonly section?: string | undefined;
}

/** A cell's address: its column, and its lane on a board with lanes. */
interface BoardKey {
  readonly column: string;
  readonly lane: string | undefined;
}

interface CellColumn {
  readonly id: string;
  readonly title: string;
  readonly aside?: ReactNode;
}

interface CellLane {
  readonly id: string;
  readonly title: string;
  readonly header?: ReactNode;
}

/** One cell: a column in a lane, and the items in it, in the order given. */
interface BoardCell<TItem extends BoardItem> {
  readonly column: CellColumn;
  readonly lane: CellLane | undefined;
  readonly items: readonly TItem[];
}

function cellName(column: string, lane: string | undefined): string {
  return `${column}\u0000${lane ?? ""}`;
}

/** The items of each cell, by the cell's name, in the order given. */
function bucketsOf<TItem extends BoardItem>(
  items: readonly TItem[],
  withLanes: boolean,
): ReadonlyMap<string, readonly TItem[]> {
  const buckets = new Map<string, TItem[]>();
  for (const item of items) {
    const name = cellName(item.column, withLanes ? item.lane : undefined);
    buckets.set(name, [...(buckets.get(name) ?? []), item]);
  }
  return buckets;
}

/** The cells, lane by lane and column by column, each with its items. */
function cellsOf<TItem extends BoardItem>(
  columns: readonly CellColumn[],
  lanes: readonly CellLane[] | undefined,
  items: readonly TItem[],
): readonly BoardCell<TItem>[] {
  const buckets = bucketsOf(items, lanes !== undefined);
  const rows: readonly (CellLane | undefined)[] = lanes ?? [undefined];
  return rows.flatMap((lane) =>
    columns.map((column) => ({
      column,
      items: buckets.get(cellName(column.id, lane?.id)) ?? [],
      lane,
    })),
  );
}

/** Where the focus is: the cell's index, the card's index in it, and the board's width in columns. */
interface Place<TItem extends BoardItem> {
  readonly cells: readonly BoardCell<TItem>[];
  readonly at: number;
  readonly index: number;
  readonly width: number;
}

function placeOf<TItem extends BoardItem>(
  cells: readonly BoardCell<TItem>[],
  focused: string | undefined,
): Place<TItem> | undefined {
  const width = new Set(cells.map((cell) => cell.column.id)).size;
  const at = cells.findIndex((cell) => cell.items.some((item) => item.id === focused));
  const index = cells[at]?.items.findIndex((item) => item.id === focused) ?? -1;
  return at === -1 || width === 0 ? undefined : { at, cells, index, width };
}

/** The card at `position` in a cell, or its last when the cell is shorter. */
function cardAt<TItem extends BoardItem>(
  cell: BoardCell<TItem>,
  position: number,
): string | undefined {
  return cell.items[Math.min(position, cell.items.length - 1)]?.id;
}

/** The next cell along the row, left or right, that holds a card: the card at the same place, or its last. */
function across<TItem extends BoardItem>(
  place: Place<TItem>,
  direction: 1 | -1,
): string | undefined {
  const row = Math.floor(place.at / place.width);
  for (
    let next = place.at + direction;
    Math.floor(next / place.width) === row && next >= 0;
    next += direction
  ) {
    const cell = place.cells[next];
    if (cell !== undefined && cell.items.length > 0) {
      return cardAt(cell, place.index);
    }
  }
  return undefined;
}

/** The nearest cell up or down the column that holds a card: its last card going up, its first going down. */
function along<TItem extends BoardItem>(
  place: Place<TItem>,
  direction: 1 | -1,
): string | undefined {
  for (let next = place.at + direction * place.width; next >= 0; next += direction * place.width) {
    const cell = place.cells[next];
    if (cell === undefined) {
      return undefined;
    }
    if (cell.items.length > 0) {
      return direction === 1 ? cell.items[0]?.id : cell.items.at(-1)?.id;
    }
  }
  return undefined;
}

/** What each key does from a place. */
const moves: Readonly<
  Record<string, <TItem extends BoardItem>(place: Place<TItem>) => string | undefined>
> = {
  ArrowDown: (place) => place.cells[place.at]?.items[place.index + 1]?.id ?? along(place, 1),
  ArrowLeft: (place) => across(place, -1),
  ArrowRight: (place) => across(place, 1),
  ArrowUp: (place) =>
    place.index > 0 ? place.cells[place.at]?.items[place.index - 1]?.id : along(place, -1),
  End: (place) => place.cells[place.at]?.items.at(-1)?.id,
  Home: (place) => place.cells[place.at]?.items[0]?.id,
};

/** The card the key moves the focus to from `focused`, or `undefined` when the key does not move it. */
function moveFocus<TItem extends BoardItem>(
  cells: readonly BoardCell<TItem>[],
  focused: string | undefined,
  key: string,
): string | undefined {
  const place = placeOf(cells, focused);
  const move = Object.hasOwn(moves, key) ? moves[key] : undefined;
  return place === undefined || move === undefined ? undefined : move(place);
}

function sameKey(left: BoardKey | undefined, right: BoardKey): boolean {
  return left !== undefined && left.column === right.column && left.lane === right.lane;
}

export { cellName, cellsOf, moveFocus, sameKey, type BoardCell, type BoardItem, type BoardKey };
