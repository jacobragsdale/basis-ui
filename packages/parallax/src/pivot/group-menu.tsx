/* A row or column group's menu in the field list: move it, move it to another area, filter by it, or remove it, so
 * that dragging is never required. */

import {
  Button,
  ChevronDownIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@basis/ui";
import type { ReactNode } from "react";

import type { SourceField } from "#grid/fields.ts";
import type { Layout } from "#layout/layout.ts";

import { chipColumn, chipCount, moveChip, removeChip } from "./edit.ts";
import type { ChipArea } from "./labels.ts";

interface GroupMenuProps {
  readonly layout: Layout;
  /** Rows or columns. */
  readonly area: Exclude<ChipArea, "values">;
  /** The chip's position in its area. */
  readonly index: number;
  /** The chip's text, which names the menu's button. */
  readonly text: string;
  readonly fields: readonly SourceField[];
  readonly onChange: (layout: Layout) => void;
  /** Asks for a filter on the chip's column. */
  readonly onFilter: (column: string) => void;
}

/** What the menu's choices take: the chip, and how it moves. */
type ItemsProps = Omit<GroupMenuProps, "text"> & {
  readonly moveTo: (to: ChipArea, at: number | null) => void;
};

/** Moving the chip a place up or down in its area. */
function MoveItems({ layout, area, index, moveTo }: ItemsProps): ReactNode {
  const moves = [
    { at: index - 1, disabled: index === 0, text: "Move up" },
    { at: index + 2, disabled: index >= chipCount(layout, area) - 1, text: "Move down" },
  ];
  return moves.map((move) => (
    <DropdownMenuItem
      key={move.text}
      disabled={move.disabled}
      onClick={() => {
        moveTo(area, move.at);
      }}
    >
      {move.text}
    </DropdownMenuItem>
  ));
}

/** Moving the chip to another area, or filtering by its column. */
function ElsewhereItems({ layout, area, index, moveTo, onFilter }: ItemsProps): ReactNode {
  const other = area === "rows" ? "columns" : "rows";
  const column = chipColumn(layout, { area, index });
  return (
    <>
      <DropdownMenuItem
        onClick={() => {
          moveTo(other, null);
        }}
      >
        {other === "rows" ? "Move to Rows" : "Move to Columns"}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => {
          moveTo("values", null);
        }}
      >
        Move to Values
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={column === null}
        onClick={() => {
          if (column !== null) {
            onFilter(column);
          }
        }}
      >
        Filter by this field
      </DropdownMenuItem>
    </>
  );
}

/** The menu's choices. */
function GroupItems(props: Omit<GroupMenuProps, "text">): ReactNode {
  const { layout, area, index, fields, onChange } = props;
  const from = { area, index };
  const moveTo = (to: ChipArea, at: number | null): void => {
    onChange(moveChip(layout, { from, to: { area: to, at } }, fields));
  };
  return (
    <>
      <MoveItems {...props} moveTo={moveTo} />
      <DropdownMenuSeparator />
      <ElsewhereItems {...props} moveTo={moveTo} />
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => {
          onChange(removeChip(layout, from));
        }}
      >
        Remove field
      </DropdownMenuItem>
    </>
  );
}

/** The menu of a row or column chip, from its button. */
function GroupMenu({ text, ...props }: GroupMenuProps): ReactNode {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-xs" aria-label={`Options for ${text}`} />}
      >
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" aria-label={`Field ${text}`}>
        <GroupItems {...props} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { GroupMenu };
