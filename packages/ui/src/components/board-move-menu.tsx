/* A board card's "Move to" menu: every column but the card's own, and on a board with lanes every other lane, each a
 * menu item, so a card moves from the keyboard as it does by dragging. */

import type { ReactElement } from "react";

import { EllipsisIcon } from "#vendor/lucide/ellipsis.tsx";

import type { BoardKey } from "./board-model.ts";
import { Button } from "./button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu.tsx";

interface Target {
  readonly id: string;
  readonly title: string;
}

interface MoveMenuProps {
  /** The card's name, which the trigger's accessible name is made from. */
  readonly label: string;
  /** Where the card is. */
  readonly at: BoardKey;
  readonly columns: readonly Target[];
  readonly lanes: readonly Target[] | undefined;
  readonly allowed: (to: BoardKey) => boolean;
  readonly move: (to: BoardKey) => void;
}

function Targets({
  title,
  targets,
  pick,
}: {
  readonly title: string;
  readonly targets: readonly Target[];
  readonly pick: (id: string) => void;
}): ReactElement {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{title}</DropdownMenuLabel>
      {targets.map((target) => (
        <DropdownMenuItem
          key={target.id}
          onClick={() => {
            pick(target.id);
          }}
        >
          {target.title}
        </DropdownMenuItem>
      ))}
    </DropdownMenuGroup>
  );
}

function MoveMenu({ label, at, columns, lanes, allowed, move }: MoveMenuProps): ReactElement {
  const otherColumns = columns.filter(
    (column) => column.id !== at.column && allowed({ ...at, column: column.id }),
  );
  const otherLanes = (lanes ?? []).filter(
    (lane) => lane.id !== at.lane && allowed({ ...at, lane: lane.id }),
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-xs" aria-label={`Move ${label} to`} />}
      >
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <Targets
          title="Move to"
          targets={otherColumns}
          pick={(column) => {
            move({ ...at, column });
          }}
        />
        {otherLanes.length > 0 ? <DropdownMenuSeparator /> : null}
        {otherLanes.length > 0 ? (
          <Targets
            title="Move to lane"
            targets={otherLanes}
            pick={(lane) => {
              move({ ...at, lane });
            }}
          />
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { MoveMenu };
