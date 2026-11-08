/* DataTable's heading row and its rows of data: the selection checkbox, a cell for each column the menu shows, drawn
 * by the column's `cell` or from its value, and the row's actions. */

import type { RowData } from "@tanstack/react-table";
import type { ReactElement, ReactNode } from "react";

import { cellOf, cellText } from "./data-table-columns.ts";
import type { DataTableColumn, DataTableRowAction } from "./data-table-columns.ts";
import { RowActionsCell, SelectAllHead, SelectRowCell, SortableHead } from "./data-table-parts.tsx";
import { isShiftEvent } from "./data-table-state.ts";
import type { DataTableInstance } from "./data-table-state.ts";
import { Formatted } from "./formatted.tsx";
import { TableCell, TableHead, TableRow } from "./table.tsx";

/** What the heading row and the rows share. */
interface RowsProps<TRow extends RowData> {
  readonly table: DataTableInstance<TRow>;
  /** The columns the menu shows, in order. */
  readonly columns: readonly DataTableColumn<TRow>[];
  readonly selectable: boolean;
  readonly rowLabel: (row: TRow) => string;
  readonly rowActions: ((row: TRow) => readonly DataTableRowAction[]) | undefined;
}

/** What a cell shows: the column's own drawing, a number by its column's display format, or the value's text. */
function cellContent<TRow>(column: DataTableColumn<TRow>, row: TRow): ReactNode {
  if (column.cell !== undefined) {
    return column.cell(row);
  }
  if (column.variant === "numeric") {
    return <Formatted value={column.value(row)} format={column.format} />;
  }
  return cellText(cellOf(column, row));
}

/** Selects or clears every row the filter shows, on every page, keeping the choice for rows it hides. */
function selectShown<TRow extends RowData>(table: DataTableInstance<TRow>, select: boolean): void {
  const ids = new Set(table.getFilteredRowModel().rows.map((row) => row.id));
  table.setRowSelection((old) =>
    select
      ? { ...old, ...Object.fromEntries([...ids].map((id) => [id, true] as const)) }
      : Object.fromEntries(Object.entries(old).filter(([id]) => !ids.has(id))),
  );
}

/** The heading row: the select-all checkbox, a heading for each column, and one, read only by assistive technology,
 * over the actions. */
function DataTableHeadRow<TRow extends RowData>({
  table,
  columns,
  selectable,
  rowActions,
}: Omit<RowsProps<TRow>, "rowLabel">): ReactElement {
  const shown = table.getFilteredRowModel().rows;
  const selected = shown.filter((row) => row.getIsSelected()).length;
  const { sorting } = table.state;
  return (
    <TableRow>
      {selectable ? (
        <SelectAllHead
          checked={shown.length > 0 && selected === shown.length}
          indeterminate={selected > 0 && selected < shown.length}
          onCheckedChange={(select) => {
            selectShown(table, select);
          }}
        />
      ) : null}
      {columns.map((column) => {
        const position = sorting.findIndex((sort) => sort.id === column.id);
        const tableColumn = table.getColumn(column.id);
        return (
          <SortableHead
            key={column.id}
            header={column.header}
            numeric={column.variant === "numeric"}
            sortable={tableColumn?.getCanSort() ?? false}
            sorted={tableColumn?.getIsSorted() ?? false}
            sortPosition={sorting.length > 1 && position !== -1 ? position + 1 : undefined}
            onSort={tableColumn?.getToggleSortingHandler()}
          />
        );
      })}
      {rowActions === undefined ? null : (
        <TableHead scope="col" className="w-0">
          <span className="sr-only">Actions</span>
        </TableHead>
      )}
    </TableRow>
  );
}

/** The rows of the page showing. */
function DataTableRows<TRow extends RowData>({
  table,
  columns,
  selectable,
  rowLabel,
  rowActions,
}: RowsProps<TRow>): ReactElement {
  return (
    <>
      {table.getRowModel().rows.map((row) => {
        const selected = row.getIsSelected();
        const label = rowLabel(row.original);
        return (
          <TableRow key={row.id} data-state={selected ? "selected" : undefined}>
            {selectable ? (
              <SelectRowCell
                label={label}
                checked={selected}
                onToggle={(checked, event) => {
                  row.getToggleSelectedHandler()({
                    shiftKey: isShiftEvent(event),
                    target: { checked },
                  });
                }}
              />
            ) : null}
            {columns.map((column) => (
              <TableCell key={column.id} variant={column.variant ?? "default"}>
                {cellContent(column, row.original)}
              </TableCell>
            ))}
            {rowActions === undefined ? null : (
              <RowActionsCell label={label} actions={rowActions(row.original)} />
            )}
          </TableRow>
        );
      })}
    </>
  );
}

export { DataTableHeadRow, DataTableRows };
