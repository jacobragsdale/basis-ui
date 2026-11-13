/* A column's menu, opened from its header's funnel or with Alt+Down: sorting, the column's filter, and hiding,
 * pinning, fitting, grouping, renaming and totalling the column. Every choice is a new layout. */

import { Button, Separator } from "@basis/ui";
import type { KeyboardEvent, ReactNode } from "react";

import type { Layout } from "#layout/layout.ts";

import { TitleField, TotalField } from "./column-fields.tsx";
import type { MenuPart } from "./column-fields.tsx";
import { ColumnFilter } from "./column-filter.tsx";
import { withGroupedBy, withHidden, withoutGroup, withPinned, withSort } from "./edit.ts";
import type { FieldKind, SourceField } from "./fields.ts";
import type { ValueSource } from "./value-picker.tsx";

/** How each kind of column says its sort order. */
const orders: Readonly<Record<FieldKind, readonly [string, string]>> = {
  boolean: ["false first", "true first"],
  date: ["oldest first", "newest first"],
  decimal: ["smallest first", "largest first"],
  float: ["smallest first", "largest first"],
  integer: ["smallest first", "largest first"],
  text: ["A to Z", "Z to A"],
  timestamp: ["oldest first", "newest first"],
};

interface HeaderMenuProps {
  readonly layout: Layout;
  /** The source column the menu is for. */
  readonly column: string;
  readonly fields: readonly SourceField[];
  /** Where the column's values come from, for its filter list. */
  readonly source: ValueSource;
  /** Why the engine refused the latest change, if it did, which the filter shows beside its box. */
  readonly error: string | null;
  readonly onChange: (layout: Layout) => void;
  /** Fits the column to its values. */
  readonly onFit: () => void;
  /** Closes the menu, once a choice ends its work. */
  readonly onDone: () => void;
}

/** Moves between a menu's items with the arrow keys, Home and End, as a menu does. */
function moveInMenu(event: KeyboardEvent<HTMLElement>): void {
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLElement>("[role='menuitem']:not(:disabled)"),
  ];
  const active = document.activeElement;
  const at = active instanceof HTMLElement ? items.indexOf(active) : -1;
  const moves: Readonly<Record<string, number>> = {
    ArrowDown: (at + 1) % items.length,
    ArrowUp: (at - 1 + items.length) % items.length,
    End: items.length - 1,
    Home: 0,
  };
  const next = items[moves[event.key] ?? -1];
  if (next !== undefined) {
    event.preventDefault();
    next.focus();
  }
}

/** A list of menu items, moved through with the arrow keys. */
function Menu({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div
      role="menu"
      aria-label={label}
      tabIndex={-1}
      className="flex flex-col outline-none"
      onKeyDown={moveInMenu}
    >
      {children}
    </div>
  );
}

/** A menu item: a ghost button the width of the menu. */
function Item({
  children,
  onClick,
  disabled = false,
}: {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}): ReactNode {
  return (
    <Button
      variant="ghost"
      size="sm"
      role="menuitem"
      disabled={disabled}
      className="w-full justify-start"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** A note at an item's end, such as the order a sort gives. */
function Note({ children }: { readonly children: ReactNode }): ReactNode {
  return <span className="ml-auto text-xs font-normal text-muted-foreground">{children}</span>;
}

/** Sorting by the column, either way, or not. */
function SortItems({
  layout,
  column,
  kind,
  finish,
}: MenuPart & { readonly finish: (layout: Layout) => void }): ReactNode {
  const [ascending, descending] = orders[kind];
  const sorted = layout.sort.some((sort) => sort.column === column);
  return (
    <Menu label="Sort">
      <Item
        onClick={() => {
          finish(withSort(layout, column, false));
        }}
      >
        Sort ascending<Note>{ascending}</Note>
      </Item>
      <Item
        onClick={() => {
          finish(withSort(layout, column, true));
        }}
      >
        Sort descending<Note>{descending}</Note>
      </Item>
      <Item
        disabled={!sorted}
        onClick={() => {
          finish(withSort(layout, column, null));
        }}
      >
        Clear sort
      </Item>
    </Menu>
  );
}

/** Hiding, pinning, fitting and grouping the column. */
function ColumnItems({
  layout,
  column,
  fields,
  finish,
  fit,
}: Pick<HeaderMenuProps, "layout" | "column" | "fields"> & {
  readonly finish: (layout: Layout) => void;
  readonly fit: () => void;
}): ReactNode {
  const pinned = layout.pinned.includes(column);
  const grouped = layout.group_by.includes(column);
  return (
    <Menu label="Column">
      <Item
        // The last column shown cannot be hidden: a layout of none shows every one.
        disabled={withHidden(layout, column, fields) === layout}
        onClick={() => {
          finish(withHidden(layout, column, fields));
        }}
      >
        Hide column
      </Item>
      <Item
        onClick={() => {
          finish(withPinned(layout, column, !pinned));
        }}
      >
        {pinned ? "Unpin" : "Pin to the left"}
      </Item>
      <Item onClick={fit}>Fit width</Item>
      <Item
        onClick={() => {
          finish(grouped ? withoutGroup(layout, column) : withGroupedBy(layout, column));
        }}
      >
        {grouped ? "Stop grouping by this column" : "Group by this column"}
      </Item>
    </Menu>
  );
}

/** A list column's menu. */
function HeaderMenu({
  layout,
  column,
  fields,
  source,
  error,
  onChange,
  onFit,
  onDone,
}: HeaderMenuProps): ReactNode {
  const field = fields.find((each) => each.name === column);
  const kind = field?.kind ?? "text";
  // The format the column is shown in, which a typed condition is read by.
  const format = layout.formats[column] ?? field?.format;
  const finish = (next: Layout): void => {
    onChange(next);
    onDone();
  };
  const part = { column, kind, layout, onChange };
  return (
    <div data-slot="grid-header-menu" className="flex flex-col gap-1 text-sm">
      <SortItems {...part} finish={finish} />
      <Separator />
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Filter</p>
      <ColumnFilter
        layout={layout}
        column={column}
        kind={kind}
        format={format}
        source={source}
        error={error}
        onChange={onChange}
      />
      <Separator />
      <ColumnItems
        layout={layout}
        column={column}
        fields={fields}
        finish={finish}
        fit={() => {
          onFit();
          onDone();
        }}
      />
      <TitleField {...part} />
      <TotalField {...part} />
    </div>
  );
}

export { HeaderMenu, Item as MenuItem, Menu };
