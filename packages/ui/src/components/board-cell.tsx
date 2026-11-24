/* One cell of a board, a column in a lane, with its cards: each a draggable card holding the card's body, which takes
 * the focus and is clicked to choose it, and its "Move to" menu beside it, so no control sits inside another. A run of
 * cards that share a section is headed by it, such as the on-hold strip at the foot of a person's Doing. */

import { cn } from "cn";
import { Fragment } from "react";
import type { KeyboardEvent, ReactElement, ReactNode } from "react";

import type { BoardDrag } from "./board-drag.ts";
import type { BoardCell, BoardItem, BoardKey } from "./board-model.ts";
import { MoveMenu } from "./board-move-menu.tsx";
import { boardCardVariants } from "./board-variants.ts";

/** What every card of the board shares: how it draws, what it is called, and what choosing or moving it does. */
interface CardContext<TItem extends BoardItem> {
  readonly renderCard: (item: TItem) => ReactNode;
  readonly cardLabel: (item: TItem) => string;
  readonly cardId: (id: string) => string;
  readonly selected: string | undefined;
  readonly focused: string | undefined;
  readonly choose: (item: TItem) => void;
  readonly open: (item: TItem) => void;
  /** The board's keys, which each card's body answers: see Board. */
  readonly onKey: (event: KeyboardEvent<HTMLButtonElement>, item: TItem) => void;
  readonly drag: BoardDrag<TItem>;
  /** The menu's targets, or `undefined` on a read-only board. */
  readonly targets:
    | {
        readonly columns: readonly { readonly id: string; readonly title: string }[];
        readonly lanes: readonly { readonly id: string; readonly title: string }[] | undefined;
        readonly allowed: (item: TItem, to: BoardKey) => boolean;
        readonly move: (item: TItem, to: BoardKey) => void;
      }
    | undefined;
}

function Section({ name }: { readonly name: string }): ReactElement {
  return (
    <li
      data-slot="board-section"
      className="flex items-center gap-2 px-1 pt-1 text-2xs font-medium text-muted-foreground uppercase"
    >
      <span className="h-px flex-1 bg-border" />
      {name}
      <span className="h-px flex-1 bg-border" />
    </li>
  );
}

/** The card's body: what the app renders, as the button that takes the focus and chooses the card. Its text is its
 * accessible name, so what a sighted user reads is what a screen reader announces. */
function Body<TItem extends BoardItem>({
  item,
  context,
}: {
  readonly item: TItem;
  readonly context: CardContext<TItem>;
}): ReactElement {
  return (
    <button
      type="button"
      id={context.cardId(item.id)}
      aria-pressed={item.id === context.selected}
      tabIndex={item.id === context.focused ? 0 : -1}
      data-slot="board-card-body"
      className="min-w-0 flex-1 cursor-default rounded-sm text-left focus-visible:outline-solid focus-visible:outline focus-visible:outline-offset-(--focus-offset) focus-visible:outline-ring"
      onClick={() => {
        context.choose(item);
      }}
      onDoubleClick={() => {
        context.open(item);
      }}
      onKeyDown={(event) => {
        context.onKey(event, item);
      }}
    >
      {context.renderCard(item)}
    </button>
  );
}

function Card<TItem extends BoardItem>({
  item,
  context,
}: {
  readonly item: TItem;
  readonly context: CardContext<TItem>;
}): ReactElement {
  const label = context.cardLabel(item);
  const chosen = item.id === context.selected;
  const { targets } = context;
  return (
    <li
      data-slot="board-card"
      data-selected={chosen ? "" : undefined}
      data-dragging={context.drag.draggingId === item.id ? "" : undefined}
      className={boardCardVariants({ selected: chosen })}
      {...context.drag.card(item, label)}
    >
      <Body item={item} context={context} />
      {targets === undefined ? null : (
        <MoveMenu
          label={label}
          at={{ column: item.column, lane: item.lane }}
          columns={targets.columns}
          lanes={targets.lanes}
          allowed={(to) => targets.allowed(item, to)}
          move={(to) => {
            targets.move(item, to);
          }}
        />
      )}
    </li>
  );
}

function Cell<TItem extends BoardItem>({
  cell,
  context,
  empty,
}: {
  readonly cell: BoardCell<TItem>;
  readonly context: CardContext<TItem>;
  readonly empty: ReactNode;
}): ReactElement {
  const key = { column: cell.column.id, lane: cell.lane?.id };
  const over = context.drag.isOver(key);
  return (
    <ul
      aria-label={
        cell.lane === undefined ? cell.column.title : `${cell.lane.title}, ${cell.column.title}`
      }
      data-slot="board-cell"
      data-drop-target={over ? "" : undefined}
      className={cn(
        "flex min-h-16 min-w-0 flex-col gap-1 rounded-md border border-transparent bg-muted p-1",
        over && "border-ring bg-accent",
      )}
      {...context.drag.cell(key)}
    >
      {cell.items.length === 0 ? (
        <li className="px-1 py-2 text-xs text-muted-foreground">{empty}</li>
      ) : null}
      {cell.items.map((item, index) => (
        <Fragment key={item.id}>
          {item.section !== undefined && item.section !== cell.items[index - 1]?.section ? (
            <Section name={item.section} />
          ) : null}
          <Card item={item} context={context} />
        </Fragment>
      ))}
    </ul>
  );
}

export { Cell, type CardContext };
