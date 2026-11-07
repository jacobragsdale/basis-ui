/* DataTable's toolbar: the text filter, how many rows are selected, the button that copies them as TSV, the columns
 * menu, and the CSV export. It takes plain values and handlers, not TanStack's table, as data-table-parts.tsx says. */

import type { ReactElement } from "react";

import { Columns3Icon } from "#vendor/lucide/columns-3.tsx";
import { CopyIcon } from "#vendor/lucide/copy.tsx";
import { DownloadIcon } from "#vendor/lucide/download.tsx";
import { SearchIcon } from "#vendor/lucide/search.tsx";

import { Button } from "./button.tsx";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
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

/** The menu that hides and shows columns. */
function ColumnsMenu({
  columns,
  onColumnVisibilityChange,
}: Pick<DataTableToolbarProps, "columns" | "onColumnVisibilityChange">): ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <Columns3Icon data-icon="inline-start" />
        Columns
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The text filter, which narrows the rows to those with the text in a searchable column. */
function FilterInput({
  label,
  filter,
  onFilterChange,
}: {
  readonly label: string;
  readonly filter: string;
  readonly onFilterChange: (filter: string) => void;
}): ReactElement {
  return (
    <InputGroup className="max-w-xs">
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        aria-label={`Filter ${label}`}
        placeholder="Filter rows"
        value={filter}
        onChange={(event) => {
          onFilterChange(event.target.value);
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
