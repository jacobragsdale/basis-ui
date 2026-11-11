/* DataTable's toolbar: the text filter, how many rows are selected, the button that copies them as TSV, the columns
 * menu, and the CSV export. It takes plain values and handlers, not TanStack's table, as data-table-parts.tsx says.
 *
 * The filter's box holds what is typed, and the table filters once typing pauses, or at once on Enter or leaving the
 * box, so a key draws only the box, not the rows. A filter set from outside, by the app or the empty table's clear,
 * replaces what the box holds. */

import { cn } from "cn";
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

import { Columns3Icon } from "#vendor/lucide/columns-3.tsx";
import { CopyIcon } from "#vendor/lucide/copy.tsx";
import { DownloadIcon } from "#vendor/lucide/download.tsx";
import { SearchIcon } from "#vendor/lucide/search.tsx";

import { Button } from "./button.tsx";
import { buttonVariants } from "./button-variants.ts";
import { AnchoredMenuContent } from "./data-table-menu.tsx";
import type { AnchoredMenu } from "./data-table-menu.tsx";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
} from "./dropdown-menu.tsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./input-group.tsx";

const counts = new Intl.NumberFormat("en-US");

/** A column as the columns menu lists it. */
interface ColumnChoice {
  readonly id: string;
  readonly header: string;
  readonly visible: boolean;
  /** Whether the menu may hide or show it: hideable, and not the last column showing. */
  readonly enabled: boolean;
}

interface DataTableToolbarProps {
  /** The table's name, which names the filter. */
  readonly label: string;
  /** The filter's text, or `undefined` for a table without one. */
  readonly filter: string | undefined;
  readonly onFilterChange: (filter: string) => void;
  /** How many of the rows the filter shows are selected, or `undefined` for a table without selection. */
  readonly selected: number | undefined;
  readonly rows: number;
  readonly onCopy: () => void;
  /** The columns the menu lists; it shows only when one can be hidden. */
  readonly columns: readonly ColumnChoice[];
  readonly onColumnVisibilityChange: (id: string, visible: boolean) => void;
  /** Exports the rows as CSV, or `undefined` for a table without an export. */
  readonly onExport: (() => void) | undefined;
}

/** Button's classes, merged as Button merges them, so the outline's border replaces the base's transparent one. */
const columnsButtonClasses = cn(buttonVariants({ size: "sm", variant: "outline" }));

/** The menu that hides and shows columns, made when it first opens. */
function ColumnsMenu({
  columns,
  onColumnVisibilityChange,
}: Pick<DataTableToolbarProps, "columns" | "onColumnVisibilityChange">): ReactElement {
  const [menu, setMenu] = useState<AnchoredMenu | undefined>();
  return (
    <>
      <button
        type="button"
        data-slot="button"
        aria-haspopup="menu"
        aria-expanded={menu?.open ?? false}
        className={columnsButtonClasses}
        onClick={(event) => {
          setMenu({ anchor: event.currentTarget, keyboard: event.detail === 0, open: true });
        }}
      >
        <Columns3Icon data-icon="inline-start" />
        Columns
      </button>
      {menu === undefined ? null : (
        <AnchoredMenuContent
          menu={menu}
          onClose={() => {
            setMenu({ ...menu, open: false });
          }}
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel>Show columns</DropdownMenuLabel>
            {columns.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={column.visible}
                disabled={!column.enabled}
                onCheckedChange={(visible) => {
                  onColumnVisibilityChange(column.id, visible);
                }}
              >
                {column.header}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
        </AnchoredMenuContent>
      )}
    </>
  );
}

/** How long typing pauses before the table filters, in milliseconds. */
const typingPause = 200;

/** What the filter's box holds. A new filter replaces it, unless it is the text the box last wrote, since the user
 * may have typed on. */
function useFilterText(
  filter: string,
): readonly [string, (text: string) => void, (written: string) => void] {
  const [held, setHeld] = useState({ seen: filter, text: filter, written: filter });
  if (held.seen !== filter) {
    setHeld({ seen: filter, text: filter === held.written ? held.text : filter, written: filter });
  }
  return [
    held.text,
    (text) => {
      setHeld((old) => ({ ...old, text }));
    },
    (written) => {
      setHeld((old) => ({ ...old, written }));
    },
  ];
}

/** The filter's box: what it holds, and the handlers that send it to the table once typing pauses, or at once. */
function usePausedFilter(
  filter: string,
  onFilterChange: (filter: string) => void,
): {
  readonly text: string;
  readonly type: (text: string) => void;
  readonly apply: (text: string) => void;
} {
  const [text, setText, wrote] = useFilterText(filter);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => (): void => {
      clearTimeout(timer.current);
    },
    [],
  );
  const apply = (next: string): void => {
    clearTimeout(timer.current);
    if (next !== filter) {
      wrote(next);
      onFilterChange(next);
    }
  };
  const type = (next: string): void => {
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      apply(next);
    }, typingPause);
  };
  return { apply, text, type };
}

/** The text filter, which narrows the rows to those whose cells show the text in a searchable column. */
function FilterInput({
  label,
  filter,
  onFilterChange,
}: {
  readonly label: string;
  readonly filter: string;
  readonly onFilterChange: (filter: string) => void;
}): ReactElement {
  const { text, type, apply } = usePausedFilter(filter, onFilterChange);
  return (
    <InputGroup className="max-w-xs">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        aria-label={`Filter ${label}`}
        placeholder="Filter rows"
        value={text}
        onChange={(event) => {
          type(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            apply(event.currentTarget.value);
          }
        }}
        onBlur={(event) => {
          apply(event.currentTarget.value);
        }}
      />
    </InputGroup>
  );
}

/** The toolbar over a DataTable. */
function DataTableToolbar({
  label,
  filter,
  onFilterChange,
  selected,
  rows,
  onCopy,
  columns,
  onColumnVisibilityChange,
  onExport,
}: DataTableToolbarProps): ReactElement {
  const hideable = columns.some((column) => column.enabled);
  return (
    <div data-slot="data-table-toolbar" className="flex flex-wrap items-center gap-2">
      {filter === undefined ? null : (
        <FilterInput label={label} filter={filter} onFilterChange={onFilterChange} />
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {selected === undefined ? null : (
          <>
            <output className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
              {`${counts.format(selected)} of ${counts.format(rows)} selected`}
            </output>
            <Button variant="outline" size="sm" disabled={selected === 0} onClick={onCopy}>
              <CopyIcon data-icon="inline-start" />
              Copy
            </Button>
          </>
        )}
        {hideable ? (
          <ColumnsMenu columns={columns} onColumnVisibilityChange={onColumnVisibilityChange} />
        ) : null}
        {onExport === undefined ? null : (
          <Button variant="outline" size="sm" onClick={onExport}>
            <DownloadIcon data-icon="inline-start" />
            Export CSV
          </Button>
        )}
      </div>
    </div>
  );
}

export { DataTableToolbar };
export type { ColumnChoice };
