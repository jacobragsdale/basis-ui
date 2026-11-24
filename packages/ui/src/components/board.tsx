/* Board: cards in columns, and optionally in lanes across them, as a kanban board or a row-per-person board lays work
 * out. It is DOM, not canvas, so a card holds whatever the app renders, and it is built for a desktop with no GPU: no
 * motion, no shadow, and `content-visibility` on each card, so a column of hundreds lays out only the cards in view.
 *
 * A card moves two ways, both through `onMove`: dragged with the browser's own drag and drop onto another cell, or by
 * its "Move to" menu, which lists every column and, with lanes, every lane, so the keyboard needs no drag of its own.
 * A board without `onMove` is read only: nothing drags and no menu shows. The focus is one card, the only one Tab
 * reaches: the arrow keys move it within a cell and across the columns, Home and End to a cell's ends, Enter opens the
 * card and Space chooses it. */

import { cn } from "cn";
import { useId, useState } from "react";
import type { KeyboardEvent, ReactElement, ReactNode } from "react";
import { flushSync } from "react-dom";

import { Cell } from "./board-cell.tsx";
import type { CardContext } from "./board-cell.tsx";
import { useBoardDrag } from "./board-drag.ts";
import { cellName, cellsOf, moveFocus } from "./board-model.ts";
import type { BoardCell, BoardItem, BoardKey } from "./board-model.ts";

/** One column of the board, such as a state. */
interface BoardColumn {
  /** The column's key, which each item's `column` names. */
  readonly id: string;
  /** The column's heading. */
  readonly title: string;
  /** What the heading shows beside the title, such as a count or a limit. */
  readonly aside?: ReactNode;
}

/** One lane across the columns, such as a person. */
interface BoardLane {
  /** The lane's key, which each item's `lane` names. */
  readonly id: string;
  /** The lane's name, for the menu and the cells' accessible names. */
  readonly title: string;
  /** What the lane's header shows, its title unless set, such as a name with figures under it. */
  readonly header?: ReactNode;
}

/** Where a card was moved to: a column, and on a board with lanes a lane. */
type BoardMove = BoardKey;

interface BoardProps<TItem extends BoardItem> {
  /** The board's name, such as "Work items". */
  readonly "aria-label": string;
  /** The columns, left to right. */
  readonly columns: readonly BoardColumn[];
  /** The lanes, top to bottom; a board without lanes is one row of cells. */
  readonly lanes?: readonly BoardLane[] | undefined;
  /** The cards, in the order each cell lists them. An item whose column or lane is not on the board is not shown. */
  readonly items: readonly TItem[];
  /** What a card shows. */
  readonly renderCard: (item: TItem) => ReactNode;
  /** A card's short name, such as its id and title, which its "Move to" menu and a drag are named by. The card's
   * own accessible name is its text. */
  readonly cardLabel: (item: TItem) => string;
  /** Moves a card to another cell; without it the board is read only. */
  readonly onMove?: ((item: TItem, to: BoardMove) => void) | undefined;
  /** Whether a card may go to a cell; every cell unless set. */
  readonly canMove?: ((item: TItem, to: BoardMove) => boolean) | undefined;
  /** The card chosen, by id, which is drawn as selected. */
  readonly selected?: string | undefined;
  /** Called when a card is chosen: clicked, or Space on it. */
  readonly onSelect?: ((item: TItem) => void) | undefined;
  /** Called when a card is opened: Enter on it, or a double click. */
  readonly onOpen?: ((item: TItem) => void) | undefined;
  /** What an empty cell says; nothing unless set. */
  readonly empty?: ((column: BoardColumn, lane: BoardLane | undefined) => ReactNode) | undefined;
  /** Places the board, as with `flex-1`; its look is fixed. */
  readonly className?: string | undefined;
}

/** The board's focus: the card Tab reaches, the chosen one or the first until the user moves it. */
function useFocus<TItem extends BoardItem>(
  cells: readonly BoardCell<TItem>[],
  selected: string | undefined,
  cardId: (id: string) => string,
): readonly [string | undefined, (id: string, move?: boolean) => void] {
  const [own, setOwn] = useState<string | undefined>(selected);
  const all = cells.flatMap((cell) => cell.items);
  const focused = all.some((item) => item.id === own) ? own : (selected ?? all[0]?.id);
  const focus = (id: string, move = false): void => {
    flushSync(() => {
      setOwn(id);
    });
    if (move) {
      document.querySelector<HTMLElement>(`#${CSS.escape(cardId(id))}`)?.focus();
    }
  };
  return [focused, focus];
}

/** What Enter and Space do on a card: open it, and choose it. */
function actionFor(key: string): "choose" | "open" | undefined {
  if (key === "Enter") {
    return "open";
  }
  return key === " " ? "choose" : undefined;
}

/** What the keys do on a card: the arrows move the focus, Enter opens the card and Space chooses it. */
function onBoardKey<TItem extends BoardItem>({
  event,
  item,
  cells,
  context,
}: {
  readonly event: KeyboardEvent<HTMLButtonElement>;
  readonly item: TItem;
  readonly cells: readonly BoardCell<TItem>[];
  readonly context: Pick<CardContext<TItem>, "choose" | "open"> & {
    readonly focus: (id: string) => void;
  };
}): void {
  const action = actionFor(event.key);
  if (action !== undefined) {
    event.preventDefault();
    context[action](item);
    return;
  }
  const next = moveFocus(cells, item.id, event.key);
  if (next !== undefined) {
    event.preventDefault();
    context.focus(next);
  }
}

function Headings({
  columns,
  withLanes,
}: {
  readonly columns: readonly BoardColumn[];
  readonly withLanes: boolean;
}): ReactElement {
  return (
    <div className="contents" aria-hidden="true">
      {withLanes ? <div /> : null}
      {columns.map((column) => (
        <div
          key={column.id}
          data-slot="board-column-header"
          className="flex items-baseline gap-2 px-2 pb-1 text-xs font-medium text-muted-foreground"
        >
          <span className="truncate">{column.title}</span>
          {column.aside === undefined ? null : <span className="tabular-nums">{column.aside}</span>}
        </div>
      ))}
    </div>
  );
}

/** The board's columns as a CSS grid template: a lane header column first on a board with lanes. */
function template(columns: number, withLanes: boolean): string {
  const cells = `repeat(${String(columns)}, minmax(12rem, 1fr))`;
  return withLanes ? `minmax(8rem, 10rem) ${cells}` : cells;
}

/** A cell, after its lane's header when it is the first of a lane's row. */
function BoardRowPart<TItem extends BoardItem>({
  cell,
  first,
  children,
}: {
  readonly cell: BoardCell<TItem>;
  readonly first: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <>
      {first && cell.lane !== undefined ? (
        <div data-slot="board-lane-header" className="min-w-0 px-2 py-1 text-sm">
          {cell.lane.header ?? cell.lane.title}
        </div>
      ) : null}
      {children}
    </>
  );
}

/** What every card of a board shares, from the board's props. */
function useCardContext<TItem extends BoardItem>(
  props: BoardProps<TItem>,
  cells: readonly BoardCell<TItem>[],
): CardContext<TItem> {
  const { columns, lanes, onMove, canMove, selected } = props;
  const prefix = useId();
  const cardId = (id: string): string => `${prefix}-card-${id}`;
  const [focused, focus] = useFocus(cells, selected, cardId);
  const allowed = (item: TItem, to: BoardKey): boolean => canMove?.(item, to) ?? true;
  const context: CardContext<TItem> = {
    cardId,
    cardLabel: props.cardLabel,
    choose: (item) => {
      focus(item.id);
      props.onSelect?.(item);
    },
    drag: useBoardDrag(onMove, allowed),
    focused,
    onKey: (event, item) => {
      onBoardKey({
        cells,
        context: {
          ...context,
          focus: (id) => {
            focus(id, true);
          },
        },
        event,
        item,
      });
    },
    open: (item) => props.onOpen?.(item),
    renderCard: props.renderCard,
    selected,
    targets: onMove === undefined ? undefined : { allowed, columns, lanes, move: onMove },
  };
  return context;
}

/** Cards in columns, and in lanes across them, that the user can move with the mouse or the keyboard.
 *
 * @use For work laid out by stage, such as tickets by state or orders by status, with a lane per person or desk when
 * the work is split that way. For rows to sort and compare, use DataTable or parallax's grid.
 * @see Badge, DropdownMenu, Sheet
 *
 * @example
 * ```tsx
 * import { Board } from "@basis/ui";
 *
 * const columns = [
 *   { id: "todo", title: "To do" },
 *   { id: "doing", title: "Doing" },
 *   { id: "done", title: "Done" },
 * ];
 * const items = [
 *   { column: "todo", id: "1", title: "Settle the batch" },
 *   { column: "doing", id: "2", title: "Retry the feed" },
 * ];
 *
 * <Board
 *   aria-label="Work"
 *   columns={columns}
 *   items={items}
 *   cardLabel={(item) => item.title}
 *   renderCard={(item) => item.title}
 *   onMove={() => undefined}
 * />;
 * ```
 */
function Board<TItem extends BoardItem>(props: BoardProps<TItem>): ReactElement {
  const { columns, lanes } = props;
  const cells = cellsOf(columns, lanes, props.items);
  const context = useCardContext(props, cells);
  return (
    <section
      aria-label={props["aria-label"]}
      data-slot="board"
      // The board's columns are its own geometry, so the template is a CSS variable, as the lint allows a style.
      style={{ "--board-template": template(columns.length, lanes !== undefined) }}
      className={cn(
        "grid min-h-0 auto-rows-min grid-cols-(--board-template) gap-1 overflow-auto",
        props.className,
      )}
    >
      <Headings columns={columns} withLanes={lanes !== undefined} />
      {cells.map((cell, index) => (
        <BoardRowPart
          key={cellName(cell.column.id, cell.lane?.id)}
          cell={cell}
          first={index % columns.length === 0}
        >
          <Cell cell={cell} context={context} empty={props.empty?.(cell.column, cell.lane)} />
        </BoardRowPart>
      ))}
    </section>
  );
}

export { Board, type BoardColumn, type BoardLane, type BoardMove, type BoardProps };
