/* The board's drag and drop, on the browser's own events: a card carries itself as the drag, a cell that would take it
 * says so on dragover and is marked while the card is over it, and a drop moves the card through `onMove`. A cell the
 * card is in, or one `canMove` refuses, takes nothing, so the browser shows the drag as refused there. */

import { useRef, useState } from "react";
import type { Dispatch, DragEvent, SetStateAction } from "react";

import { sameKey } from "./board-model.ts";
import type { BoardItem, BoardKey } from "./board-model.ts";

const dragType = "application/x-basis-board-card";

/** The card being dragged, and the cell under it. */
interface Dragging {
  readonly id: string;
  readonly over: BoardKey | undefined;
}

interface CardDrag {
  readonly draggable: boolean;
  readonly onDragStart?: (event: DragEvent<HTMLElement>) => void;
  readonly onDragEnd?: () => void;
}

interface CellDrop {
  readonly onDragOver?: (event: DragEvent<HTMLElement>) => void;
  readonly onDragLeave?: (event: DragEvent<HTMLElement>) => void;
  readonly onDrop?: (event: DragEvent<HTMLElement>) => void;
}

interface BoardDrag<TItem extends BoardItem> {
  /** The id of the card being dragged. */
  readonly draggingId: string | undefined;
  /** Whether the dragged card is over this cell, and the cell would take it. */
  readonly isOver: (key: BoardKey) => boolean;
  readonly card: (item: TItem, label: string) => CardDrag;
  readonly cell: (key: BoardKey) => CellDrop;
}

/** Whether a drag left an element for something outside it, rather than for one of its children. */
function leftFor(event: DragEvent<HTMLElement>): boolean {
  const next = event.relatedTarget;
  return !(next instanceof Node && event.currentTarget.contains(next));
}

/** What the hook keeps between events: the card in hand, and how to say where it is. */
interface DragState<TItem extends BoardItem> {
  readonly dragged: { current: TItem | undefined };
  readonly setDragging: Dispatch<SetStateAction<Dragging | undefined>>;
  readonly accepts: (to: BoardKey) => boolean;
}

function end<TItem extends BoardItem>(state: DragState<TItem>): void {
  state.dragged.current = undefined;
  state.setDragging(undefined);
}

function hover<TItem extends BoardItem>(state: DragState<TItem>, to?: BoardKey): void {
  state.setDragging((before) =>
    before === undefined || before.over === to || (to !== undefined && sameKey(before.over, to))
      ? before
      : { ...before, over: to },
  );
}

function cardDrag<TItem extends BoardItem>(
  state: DragState<TItem>,
  item: TItem,
  label: string,
): CardDrag {
  return {
    draggable: true,
    onDragEnd: () => {
      end(state);
    },
    onDragStart: (event) => {
      state.dragged.current = item;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(dragType, item.id);
      event.dataTransfer.setData("text/plain", label);
      state.setDragging({ id: item.id, over: undefined });
    },
  };
}

function cellDrop<TItem extends BoardItem>(
  state: DragState<TItem>,
  to: BoardKey,
  onMove: (item: TItem, to: BoardKey) => void,
): CellDrop {
  return {
    onDragLeave: (event) => {
      if (leftFor(event)) {
        hover(state);
      }
    },
    onDragOver: (event) => {
      if (state.accepts(to)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        hover(state, to);
      }
    },
    onDrop: (event) => {
      const item = state.dragged.current;
      if (item !== undefined && state.accepts(to)) {
        event.preventDefault();
        onMove(item, to);
      }
      end(state);
    },
  };
}

function useBoardDrag<TItem extends BoardItem>(
  onMove: ((item: TItem, to: BoardKey) => void) | undefined,
  allowed: (item: TItem, to: BoardKey) => boolean,
): BoardDrag<TItem> {
  const [dragging, setDragging] = useState<Dragging | undefined>();
  const dragged = useRef<TItem | undefined>(undefined);
  const state: DragState<TItem> = {
    accepts: (to) => {
      const item = dragged.current;
      return (
        item !== undefined &&
        !sameKey({ column: item.column, lane: item.lane }, to) &&
        allowed(item, to)
      );
    },
    dragged,
    setDragging,
  };
  if (onMove === undefined) {
    return {
      card: () => ({ draggable: false }),
      cell: () => ({}),
      draggingId: undefined,
      isOver: () => false,
    };
  }
  return {
    card: (item, label) => cardDrag(state, item, label),
    cell: (to) => cellDrop(state, to, onMove),
    draggingId: dragging?.id,
    isOver: (key) => sameKey(dragging?.over, key),
  };
}

export { useBoardDrag, type BoardDrag };
